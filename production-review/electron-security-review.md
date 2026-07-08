# Electron Security Review — interval-timer

Scope: `main.js`, `preload.cjs`, `js/**`, `index.html`, `mini.html`, `package.json`, electron-builder config. Reviewed against the [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security). Read-only audit — no source files were modified.

## Executive summary

**8 findings: 1 CRITICAL, 2 HIGH, 2 MEDIUM, 2 LOW, 1 SUGGESTION.**

The BrowserWindow/preload/IPC fundamentals are in good shape (contextIsolation on everywhere, no nodeIntegration, no raw `ipcRenderer` exposed, a real CSP in both HTML entry points, Spotify client secret genuinely confined to the main process). The one serious structural problem is the local HTTP server in `main.js`: its static-file handler has a classic path-traversal bug that lets anything able to reach `127.0.0.1:47821` (a fixed, predictable port) read arbitrary files off the victim's disk. That single issue accounts for the CRITICAL and one of the HIGH findings and should be fixed before shipping. Everything else is hardening/defense-in-depth.

| # | Severity | Area | Location |
|---|----------|------|----------|
| 1 | CRITICAL | Local HTTP server — path traversal, arbitrary file read | `main.js:74-98` |
| 2 | HIGH | Local HTTP server — `/local-audio/` arbitrary absolute-path file read | `main.js:52-72` |
| 3 | HIGH | Spotify OAuth tokens stored in plaintext `localStorage` | `js/alarm/AlarmManager.js:288-294`, `js/alarmModal.js:247-249` |
| 4 | MEDIUM | No `session.setPermissionRequestHandler` — defaults to Electron's implicit allow for unhandled requests | `main.js` (absent) |
| 5 | MEDIUM | No navigation/new-window hardening on the main and mini windows | `main.js:237-263`, `main.js:266-337` |
| 6 | LOW | `sandbox` not explicitly set on BrowserWindow `webPreferences` | `main.js:241-247`, `main.js:289-294` |
| 7 | LOW | `presets:save` accepts renderer-supplied objects with no schema/type validation | `main.js:475-493` |
| 8 | SUGGESTION | Unsigned Windows installer (`signExecutable: false`) | `package.json:19` |

---

## 1. BrowserWindow configuration

Three `BrowserWindow` instantiations exist: main window (`main.js:237`), mini window (`main.js:277`), and the Spotify OAuth popup (`main.js:542`).

**Main window** (`main.js:241-247`):
```js
webPreferences: {
  contextIsolation: true,
  enableRemoteModule: false,
  preload: preloadPath,
  backgroundThrottling: false,
  autoplayPolicy: "no-user-gesture-required",
}
```
- `contextIsolation: true` — correct.
- `nodeIntegration` not set → defaults to `false` — correct.
- `sandbox` not set → defaults to `true` in modern Electron (v20+) when `nodeIntegration` is off, and this app is on Electron 41. Effectively sandboxed today, but see Finding 6 for why to make it explicit.
- `webSecurity` not set → defaults to `true` (not disabled anywhere) — correct, CORS/same-origin protections for the renderer stay intact.
- `allowRunningInsecureContent` not set → defaults to `false` — correct.
- `nodeIntegrationInSubFrames` not set → defaults to `false` — correct and specifically relevant here since the app embeds a YouTube iframe/script; if this were `true` it would hand Node access to that YouTube-controlled subframe.
- `webviewTag` not set → defaults to `false`. No `<webview>` tags used anywhere in the codebase — confirmed via grep.
- `autoplayPolicy: "no-user-gesture-required"` (`main.js:246`) is an intentional product choice (alarms must play without a fresh click), but it does globally disable Chromium's autoplay-gate protection for the whole renderer, including the remote YouTube iframe content. Low risk in isolation (see Finding 5 for why it's not exploitable today), but worth being aware it widens what embedded remote content can auto-trigger.

**Mini window** (`main.js:289-294`): same `webPreferences` shape as main (`contextIsolation: true`, no `nodeIntegration`), no issues beyond what's noted above.

**Spotify OAuth window** (`main.js:550-556`): this one is explicit and correct — `nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true`, and critically **no `preload` script**, so even though it navigates to Spotify's real login page (fully untrusted remote content), it has zero IPC surface. This is the right pattern.

No custom protocol handlers (`protocol.handle`/`registerSchemesAsPrivileged`) are registered anywhere in the app.

---

## 2. Finding: CRITICAL — Path traversal in the local static file server

**File:** `main.js:74-98` (`handleLocalServerRequest`)

```js
function handleLocalServerRequest(req, res) {
  if (req.url.startsWith("/local-audio/")) { ... }
  let filePath = path.join(
    __dirname,
    decodeURIComponent(req.url.split("?")[0]),
  );
  if (req.url === "/") filePath = path.join(__dirname, "index.html");
  fs.readFile(filePath, (err, data) => { ... });
}
```

`req.url` is attacker-controlled input, URL-decoded and passed straight into `path.join(__dirname, ...)` with no normalization/containment check afterward. `path.join` does **not** stop `..` segments from walking above the base directory — it collapses them. I verified this concretely:

```
__dirname = "C:\CodeSpace\interval-timer\dist-app"
request   = "/../../../../../../Windows/win.ini"
path.join(__dirname, decodeURIComponent(...)) === "C:\Windows\win.ini"
```
i.e. the request escapes `__dirname` entirely and reaches an arbitrary absolute path on the victim's disk, then reads it and returns the contents with `Content-Type` inferred from the extension (or `application/octet-stream`).

**Why this matters for this app specifically:** the server binds to `127.0.0.1:47821` — a fixed, hardcoded port (`LOCAL_SERVER_PORT`, `main.js:45`), chosen precisely so it's *predictable* across restarts (for `localStorage` persistence — see the comment at `main.js:40-44`). That predictability is exactly what turns this into a real cross-process attack surface, not just a theoretical one:
- **Any other process running as the same OS user** — another installed app, a script, or actual malware already on the machine — can `GET http://127.0.0.1:47821/../../../../Users/<user>/AppData/Roaming/<anything>` and read any file that process' account can read, with zero authentication. Windows loopback traffic is not user-isolated or firewalled between processes by default.
- **A web page open in the user's regular browser** can also fire this request (via `fetch`, `<img>`, `<script src>`, `<audio src>`, etc.) at the fixed, well-known port. The Same-Origin Policy stops arbitrary JS on that page from *reading* the response body via `fetch`, but it does not stop the request from being sent, does not stop `<script src="http://127.0.0.1:47821/../../../path/to/file.js">` from executing file contents that happen to be syntactically valid JS, and does not stop e.g. an `<audio>`/`<img>` tag from rendering a targeted file if the attacker already knows its path (drive-by probing for known Windows/app config paths is realistic). Because the port never changes across runs, an attacker page can simply always target `127.0.0.1:47821` without needing to discover it first.

**Fix:** resolve the joined path with `path.resolve`/`path.normalize`, then verify it still starts with `__dirname` (`path.sep`-safe check) before calling `fs.readFile`; reject (404) otherwise. Also consider restricting the server to only ever serve a fixed allow-list of files (`index.html`, `mini.html`, `js/**`, `css/**`, `assets/**`) rather than resolving directly from request path, since that removes the traversal class of bug entirely rather than just patching this instance of it.

---

## 3. Finding: HIGH — `/local-audio/` route allows arbitrary absolute-path file read

**File:** `main.js:52-72` (`handleLocalAudioRequest`)

```js
function handleLocalAudioRequest(req, res) {
  const encodedPath = req.url.slice("/local-audio/".length);
  const filePath = decodeURIComponent(encodedPath);
  const ext = path.extname(filePath).toLowerCase();
  if (!LOCAL_AUDIO_EXTENSIONS.includes(ext)) { res.writeHead(403); ... }
  fs.readFile(filePath, (err, data) => { ... });
}
```

Unlike the root handler, this one doesn't even prefix with `__dirname` — `filePath` is used as-is, so a request like `/local-audio/C%3A%5CUsers%5C<user>%5CDocuments%5Csecret.wav` reads that absolute path directly, restricted only by requiring the extension to be `.mp3`/`.wav`/`.ogg`. This is intentional in design (it exists so the renderer can play a user-picked local file via `fetch`/`<audio>` over `http://` instead of `file://` — see the comment at `main.js:47-51` and the corresponding call site `AlarmManager._toFileUrl` in `js/alarm/AlarmManager.js:331-333`), and the *renderer's own* calls only ever pass paths the user picked via the native file dialog. The vulnerability is that the **server itself** doesn't confine the read to a directory or to files the user actually selected — it will happily serve any absolute path ending in an allowed extension, to any caller who can reach the port, not just the app's own renderer.

**Concrete impact:** more constrained than Finding 1 (needs a matching extension, no `..`-style relative traversal since it takes the decoded path directly, not joined with a base), but still a same-origin-policy-permeable, unauthenticated read primitive for any `.mp3`/`.wav`/`.ogg` file on disk if the caller knows or guesses the path — and since these route/port are fixed and documented in this very repo's comments, guessing is not hard for a targeted attack (e.g. reading a `.wav` recording that happens to be sensitive, or using it as a local file-existence oracle via 404 vs. 200).

**Fix:** validate that the resolved path is one the renderer actually selected (e.g. keep a main-process-side allowlist/session-scoped record populated only by the `get-file-path` dialog result), or at minimum restrict serving to a specific user-data subdirectory rather than an arbitrary absolute path.

---

## 4. preload.cjs — API surface exposed to the renderer

`preload.cjs` is minimal and well-scoped — this is the strongest part of the app's security posture. Full enumeration of everything exposed on `window.electronAPI`:

| Exposed function | ipcRenderer call | Notes |
|---|---|---|
| `quitApp()` | `invoke("app:quit")` | no args |
| `getFilePath()` | `invoke("get-file-path")` | no args |
| `setAlwaysOnTop(value)` | `invoke("set-always-on-top", value)` | boolean |
| `sendTimerState(state)` | `send("timer-state", state)` | opaque object, forwarded only between the app's own windows |
| `sendMiniAction(action)` | `send("mini-action", action)` | string, mapped through a fixed lookup table in `js/renderer.js`, not interpolated into selectors |
| `onMiniClosed/onTimerState/onMiniAction/onMiniReady` | `ipcRenderer.on(...)` wrapped in listener functions | listeners, not the raw emitter |
| `presetsGetAll/GetActive/Save/Delete/SetActive` | `invoke("presets:*")` | see Finding 7 for `Save` |
| `spotifyLogin/spotifyRefresh/spotifyOpenTrack` | `invoke("spotify:*")` | see §8 for secret handling |

**Critically, `ipcRenderer` itself is never exposed** — `preload.cjs:1` destructures it locally but only ever passes it wrapped calls with hardcoded channel names into `contextBridge.exposeInMainWorld`. The renderer cannot call `ipcRenderer.invoke` with an arbitrary channel, cannot call `ipcRenderer.send` with an arbitrary channel, and has no access to `remote`, `require`, `process`, `fs`, or `shell`. This is exactly the recommended pattern from the checklist ("only expose what's needed, never the whole module").

No over-broad APIs, no arbitrary-channel passthroughs, no direct filesystem or shell access from preload. No issues found here.

---

## 5. Content Security Policy

Both renderer entry points ship a real CSP via `<meta http-equiv="Content-Security-Policy">`:

**`index.html:15-24`:**
```
default-src 'self';
script-src 'self' https://www.youtube.com https://sdk.scdn.co;
frame-src https://www.youtube.com https://www.youtube-nocookie.com https://accounts.spotify.com https://sdk.scdn.co;
img-src 'self' data: https://i.ytimg.com https://i.scdn.co;
connect-src 'self' https://www.youtube.com https://api.spotify.com https://accounts.spotify.com;
style-src 'self' 'unsafe-inline';
font-src 'self';
media-src 'self' blob: data: https://p.scdn.co;
worker-src blob:
```

**`mini.html:5-11`:** a tighter `default-src 'self'` policy with no remote allowances at all — appropriate, since the mini window never needs YouTube/Spotify content.

Observations (not flagging separately, folded in as context):
- `script-src` correctly has **no** `'unsafe-inline'` and no `'unsafe-eval'` — this is the single biggest mitigating factor against DOM-based XSS turning into anything worse, since even if attacker-controlled markup were injected, inline `<script>`/`onclick=` handlers would be blocked by CSP.
- `style-src 'self' 'unsafe-inline'` is looser but low-risk (CSS-only injection is a much smaller attack surface, no code execution).
- The CSP is delivered only via HTML `<meta>` tag — the local HTTP server (`startLocalServer`/`handleLocalServerRequest`) does not set a `Content-Security-Policy` HTTP response header. This means any non-HTML resource served directly (e.g. a `.js` file requested directly, or a path-traversed file per Findings 1–2) is returned with **no CSP protection at all**, since meta-tag CSP only applies to the HTML document it's embedded in. This is a second-order consequence of Findings 1/2 rather than a new bug — fixing those two closes this gap as a side effect. Not spinning up a separate finding for it, but worth fixing the header at the server level too as defense-in-depth once the traversal fix lands.
- There's a commented-out, slightly stricter earlier version of the CSP still in the file (`index.html:5-13`) — dead code, not a vulnerability, just worth cleaning up.

No CSP is missing outright — good — and a leftover commented block is dead weight but harmless.

---

## 6. IPC channel enumeration and input validation

Every `ipcMain.handle`/`ipcMain.on` registration in `main.js`, with what it does with renderer input:

| Channel | Handler | Renderer input | Validation |
|---|---|---|---|
| `get-file-path` | `main.js:416` | none | n/a — opens native OS dialog, no renderer-controlled path used |
| `app:quit` | `main.js:426` | none | n/a |
| `set-always-on-top` | `main.js:429` | boolean | used only as a truthy/falsy branch — safe regardless of type |
| `mini-action` (on) | `main.js:442` | string | forwarded verbatim to main window; consumed via a fixed lookup table client-side (`js/renderer.js:179`), not used to build selectors or paths — safe |
| `timer-state` (on) | `main.js:448` | object | forwarded verbatim to mini window; consumed via property reads + `textContent`, never `innerHTML` (`js/mini.js`) — safe |
| `presets:get-all` | `main.js:455` | none | n/a |
| `presets:get-active` | `main.js:464` | none | n/a |
| `presets:save` | `main.js:475` | preset object | **no schema/type/bounds validation** — see Finding 7 |
| `presets:delete` | `main.js:495` | id string | used only as a filter predicate (`p.id !== id`) — safe, worst case is a no-op if id doesn't match |
| `presets:set-active` | `main.js:510` | id string | stored verbatim as `activePresetId`; later used only as `p.id === activeId` comparison in `presets:get-active` — safe, no lookup/write side effect if the id doesn't correspond to a real preset |
| `spotify:login` | `main.js:527` | none | n/a |
| `spotify:refresh` | `main.js:626` | refresh token string | checked for truthiness only, then sent to Spotify's real token endpoint over HTTPS — Spotify's API itself will reject a malformed/foreign token, so no local validation gap of consequence |
| `spotify:open-track` | `main.js:638` | track id string | checked for truthiness only, then interpolated into `spotify:track:${trackId}` passed to `shell.openExternal` — see §7 |

Most handlers are either parameterless or use renderer input in ways where malformed input just produces a benign no-op (not a security boundary crossing) — appropriate for a single-user, offline-first desktop app, and I'm not flagging those as needing "input validation" theater. The one handler that genuinely lacks validation with a real (if low-severity) consequence is `presets:save` — see Finding 7.

---

## 7. Finding: MEDIUM — no `session.setPermissionRequestHandler`

**File:** `main.js` — absent entirely (confirmed via grep across the whole repo).

The app embeds real remote content in the main window: the YouTube IFrame API (`js/alarm/providers/YouTubeAlarmProvider.js:262`, loading `https://www.youtube.com/iframe_api` and creating a `YT.Player` iframe) and Spotify's `sdk.scdn.co`/`accounts.spotify.com` origins are allow-listed in CSP. Without a `session.setPermissionRequestHandler`, Electron falls back to its built-in default behavior for any permission request (camera, microphone, geolocation, notifications, etc.) that this remote content's origin might trigger — historically an implicit-allow, and even on current Electron versions the built-in default is looser than an app-authored allowlist. Given `autoplayPolicy: "no-user-gesture-required"` is also set globally (`main.js:246`), the combination means embedded YouTube/Spotify content runs with fewer default browser guardrails than a normal web page would.

**Concrete risk today:** low-to-moderate — the app doesn't currently do anything with camera/mic/geolocation, and the embedded YouTube iframe is a fixed 1x1px hidden player (`js/alarm/providers/YouTubeAlarmProvider.js:274-290`) that the app itself creates from a URL the *user* pastes in, not fully attacker-controlled in the general case. But if YouTube's own embedded page (which the app doesn't control) ever prompts for a permission, or if a future feature adds more remote content, there's currently no app-level backstop. This is a cheap, high-value hardening step.

**Fix:** add a `session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false))` (deny-all, since nothing in this app currently needs any browser permission), or an explicit allowlist if some permission is genuinely needed later.

---

## 8. Finding: MEDIUM — no navigation/new-window restrictions on main/mini windows

**File:** `main.js:237-263` (main window), `main.js:266-337` (mini window) — neither registers `webContents.setWindowOpenHandler` nor a `will-navigate` listener.

Electron's modern default (Electron 15+) is to *deny* `window.open()`-triggered new-window creation when no `setWindowOpenHandler` is registered, so that half of the checklist item is satisfied by default here — I verified there's no custom handler overriding this to `allow`. However, there's also no `will-navigate` listener constraining **top-level navigation** of the main window itself. Concretely: if a bug anywhere in the renderer (now or in the future) ever let attacker-influenced content trigger `location.href = ...` or a link click, nothing in `main.js` would stop the main window from navigating away from `http://127.0.0.1:<port>/index.html` to an arbitrary URL — and that window still has the app's real `preload.cjs` attached, i.e. `window.electronAPI` (including `quitApp`, preset read/write, Spotify login/refresh/open-track) would be exposed to whatever page it navigated to.

The CSP's `script-src`/`connect-src` restrictions make an actual injection point hard to find today — I did not find one (presets render via `escapeHtml()` in `js/presets.js`, alarm URLs are set via `textContent` not `innerHTML` in `js/alarmModal.js`) — so this is a defense-in-depth gap rather than an active exploit path.

**Fix:** add
```js
mainWindow.webContents.on("will-navigate", (e, url) => {
  if (!url.startsWith(`http://127.0.0.1:${serverPort}/`)) e.preventDefault();
});
```
(and the same for `miniWindow`), plus an explicit `setWindowOpenHandler(() => ({ action: "deny" }))` for both, so the intended-allow behavior isn't relying on an implicit Electron default that could change.

---

## 9. Finding: HIGH — Spotify OAuth tokens stored in plaintext `localStorage`

**Files:** `js/alarm/AlarmManager.js:288-294` (`_saveSpotifyTokens`), `js/alarmModal.js:247-249` (`hasSpotifySession`), consumed at `js/alarm/AlarmManager.js:238-263`.

```js
_saveSpotifyTokens({ accessToken, refreshToken, expiresAt }) {
  if (accessToken) localStorage.setItem("spotify_access_token", accessToken);
  if (refreshToken) localStorage.setItem("spotify_refresh_token", refreshToken);
  if (expiresAt) localStorage.setItem("spotify_expires_at", String(expiresAt));
}
```

The access token and — more importantly — the long-lived **refresh token** are stored unencrypted in the renderer's `localStorage`, which persists as a plaintext file on disk (in the profile directory for the app's fixed origin, `http://127.0.0.1:47821`) and is readable by anything with filesystem access to that profile, or by any script that manages to execute in the renderer's context (e.g. via a future XSS bug, or via DevTools if ever enabled). A leaked refresh token gives an attacker durable Spotify API access (read email, read/modify playback state — the scopes requested at `main.js:157-163`) until the user revokes it from their Spotify account settings, since refresh tokens don't expire on their own.

This is standard practice for many desktop apps and the impact is scoped to a Spotify account (not the OS or other apps), so I'm rating it HIGH rather than CRITICAL — but Electron ships a purpose-built mitigation for exactly this (`safeStorage` — OS-keychain-backed encryption, available via the main process) that this app doesn't use.

**Fix:** move token storage to the main process via IPC, encrypting at rest with `safeStorage.encryptString`/`decryptString` (backed by Windows DPAPI on this platform) instead of raw renderer `localStorage`, or at minimum store only the access token client-side (short-lived) and keep the refresh token main-process-only, mirroring how the client secret is already correctly confined.

---

## 10. `shell.openExternal` usage

**File:** `main.js:638-643`:
```js
ipcMain.handle("spotify:open-track", async (_event, trackId) => {
  if (!trackId) throw new Error(...);
  await shell.openExternal(`spotify:track:${trackId}`);
});
```

`trackId` is renderer-supplied and only checked for truthiness, not format. The call site (`js/alarm/providers/SpotifyAlarmProvider.js:94`, via `_extractTrackId` at line 239-251) does constrain it with a regex (`^[a-zA-Z0-9]{22}$`) before it ever reaches this IPC call in normal operation, but that validation lives in the *renderer*, not in the trusted main-process boundary — so it's not actually enforced against a compromised or buggy renderer. Because the string is appended after a fixed `spotify:track:` prefix (not renderer-controlled), the exploitability is low: an attacker can't turn this into an arbitrary-protocol launch (they can't change the `spotify:track:` prefix), only feed garbage into the value, so at worst `shell.openExternal` is asked to open a malformed `spotify:track:<garbage>` URI, which the OS URI handler would simply reject. This is not a real "open anything via shell.openExternal" bug given the fixed prefix, but it's still the kind of thing that should be validated main-process-side rather than trusted from the renderer as a matter of principle.

**Fix (low priority):** re-validate `/^[a-zA-Z0-9]{22}$/.test(trackId)` inside the `ipcMain.handle` itself before building the URI, so the main process doesn't rely on the renderer having done it.

No other `shell.openExternal`/`shell.openPath`/`shell.showItemInFolder` calls exist anywhere in the codebase.

---

## 11. Remote content (YouTube iframe / Spotify)

- **YouTube**: loaded via the official IFrame Player API (`js/alarm/providers/YouTubeAlarmProvider.js`), which internally creates a same-window iframe (not a `<webview>` tag — confirmed `webviewTag` is never enabled and no `<webview>` markup exists anywhere). The iframe is 1x1px, `pointer-events: none`, `opacity: 0` (`main.js`-sibling file `YouTubeAlarmProvider.js:280-289`) — a legitimate "hidden background player," not a disguised UI-spoofing risk. It runs inside the main window's existing (contextIsolation-on, no nodeIntegration) renderer process; iframes do not inherit the parent's `nodeIntegration`/preload access in Electron regardless, so this iframe has no more privilege than it would in a normal Chrome tab. CSP's `frame-src`/`script-src` allowlists constrain it to YouTube's real origins.
- **Spotify**: no in-app iframe/Web Playback SDK is actually used for audio (per the architecture notes in `CLAUDE.md` — Widevine isn't available in stock Electron, so `AlarmManager` never requests full playback via the SDK). The only Spotify "remote content" surfaces are (a) the dedicated OAuth `BrowserWindow` (`main.js:542`, correctly sandboxed, isolated, no preload — see §1) and (b) `sdk.scdn.co`/`accounts.spotify.com` allowlisted in CSP, seemingly vestigial from an earlier design (the full Web Playback SDK path is commented out per `CLAUDE.md`). Not a vulnerability, just worth noting the CSP is slightly broader than what's actually exercised at runtime — low-priority cleanup, not filing as a separate finding.

Both remote-content integrations are handled about as safely as they can be in Electron: real iframes (not `<webview>`), no elevated privileges granted to them, and a dedicated zero-preload window for the one flow that needs to show untrusted login UI.

---

## 12. Filesystem access from the renderer

The renderer has **no direct filesystem access** — no `fs` require, no Node integration. All disk access is mediated:
- File selection goes through the native dialog via `get-file-path` IPC (main-process-only `dialog.showOpenDialog`).
- Reading the picked file's *contents* happens by the renderer `fetch`ing it back from the local HTTP server's `/local-audio/` route (`js/alarm/AlarmManager.js:331-333`), not via direct `fs` access — which is exactly why Findings 1–2 matter, since that server route is the only privileged file-read primitive in the app and it's under-guarded.
- Presets are read/written exclusively through `presets:*` IPC to `electron-store`, never via direct `fs`.

No `child_process`, `execa`, `spawn`, or `exec` usage anywhere in the codebase (confirmed via grep across all `.js` files) — no command-injection surface exists at all.

---

## 13. Auto-updater

No `autoUpdater`, `electron-updater`, or `update-electron-app` dependency or usage anywhere (confirmed via `package.json` dependencies and a repo-wide grep). The app has no self-update mechanism, so there's no update-feed-URL/signature-verification surface to assess — not applicable.

---

## 14. Secrets handling

Traced `SPOTIFY_CLIENT_SECRET` end-to-end:
- Loaded once at startup from the gitignored `spotify-credentials.json` (`main.js:139-152`; confirmed gitignored via `.gitignore` and confirmed never committed via `git ls-files`/`git log` — only `spotify-credentials.example.json` is tracked).
- Used exactly twice, both in main-process-only helper functions: `exchangeCodeForTokens` (`main.js:647-674`) and `refreshAccessToken` (`main.js:676-703`), both building a `Basic` auth header for direct `fetch` calls to `https://accounts.spotify.com/api/token` over HTTPS.
- Never passed to `ipcMain.handle` return values, never sent via `webContents.send`, never referenced in `preload.cjs` or any `js/**` renderer file (confirmed via grep — `SPOTIFY_CLIENT_SECRET`/`clientSecret` only appear in `main.js`).
- The renderer only ever receives the resulting **access/refresh tokens** (via `spotify:login`/`spotify:refresh` IPC return values), never the client secret itself.

**Confirmed: the client secret never reaches the renderer.** This is correctly implemented.

`electron-store`'s `timer-config.json` (`main.js:168-205`) only ever stores preset objects (`name`, `workMinutes`, `workSeconds`, `breakMinutes`, `breakSeconds`, `loops`, `id`, `isDefault`) and `activePresetId` — nothing sensitive. No encryption key configured for the store, but there's nothing in it that would warrant one.

The one secrets-adjacent issue is the Spotify *user* tokens in `localStorage` — see Finding 9 (§9) above; that's a separate, real gap from the client-secret handling, which itself is clean.

---

## 15. Session usage

No `session.fromPartition` / custom partitions anywhere — all windows (main, mini, and the Spotify OAuth popup) share Electron's `defaultSession`. This means Spotify's OAuth login cookies live in the same session/cookie jar as everything else the app ever loads (currently just its own local-origin content). Not a vulnerability in the current app (there's no other untrusted content sharing that session to leverage the cookies against), but worth a note: if the app ever added a second piece of untrusted remote content, it would share cookies/cache with the Spotify auth flow. Low priority — not filing as its own finding, folding into Finding 8's general "add explicit hardening" recommendation.

No use of `session.defaultSession.clearStorageData`, no elevated permission grants on the default session (ties back to Finding 7 — no permission handler is set at all, default session included).

---

## 16. Local HTTP server — summary of the binding/access question

To directly answer the prompt's specific question: **yes, other things on the local machine can reach this server.** It binds to `127.0.0.1` (not `0.0.0.0`), so it is *not* reachable from the network/other machines — that part is done correctly. But within the same machine, it is reachable by:
- any other process running as any local user (loopback isn't user-isolated on Windows by default),
- any web page open in the user's browser (via requests that don't need to read the response to have effect, and via `fetch`/`XHR` for anything where CORS/opaque-response restrictions don't block the attack, as discussed in Finding 1),
- and it uses a **fixed, hardcoded port** (`47821`) specifically so it survives restarts (`main.js:40-44` comment) — which is reasonable for the `localStorage`-persistence goal it's solving, but does mean the attack surface in Findings 1–2 is reachable without any port-discovery step, at any time the app is running.

It does **serve arbitrary files from the filesystem** — that's Findings 1 and 2, not a separate item.

---

## Appendix: full severity list with fixes (quick reference)

1. **CRITICAL** — `main.js:74-98` — path traversal in root static handler → full arbitrary file read. Fix: resolve + verify containment under `__dirname` before `fs.readFile`, or switch to an explicit allowlist of servable files.
2. **HIGH** — `main.js:52-72` — `/local-audio/` serves any absolute path with an allowed extension, no containment/allowlist. Fix: constrain to paths the user actually selected via the dialog, or a fixed subdirectory.
3. **HIGH** — `js/alarm/AlarmManager.js:288-294` — Spotify access/refresh tokens in plaintext `localStorage`. Fix: move to main process + `safeStorage` encryption.
4. **MEDIUM** — `main.js` (absent) — no `session.setPermissionRequestHandler`. Fix: add an explicit deny-all (or minimal allowlist) handler.
5. **MEDIUM** — `main.js:237-337` — no `will-navigate`/`setWindowOpenHandler` restrictions on main/mini windows. Fix: add both, scoped to the local server's own origin.
6. **LOW** — `main.js:241-247`, `main.js:289-294` — `sandbox` relies on Electron's implicit default rather than being explicit. Fix: add `sandbox: true` explicitly.
7. **LOW** — `main.js:475-493` — `presets:save` trusts renderer-supplied object shape/bounds entirely. Fix: validate types and reasonable numeric ranges for `workMinutes`/`breakMinutes`/`loops`/`name` length server-side.
8. **SUGGESTION** — `package.json:19` — `signExecutable: false` means the shipped installer/exe is unsigned, triggering SmartScreen warnings and offering users no publisher-authenticity signal. Not an Electron-API security issue, but relevant to production distribution trust.
