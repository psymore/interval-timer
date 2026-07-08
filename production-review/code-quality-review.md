# Code Quality / Production-Readiness Review

Scope: `main.js`, `preload.cjs`, everything under `js/` (recursive), `index.html`, `mini.html`, `css/`.
Out of scope (covered by a separate reviewer): Electron security checklist (contextIsolation, IPC input validation, CSP correctness, secrets handling, path traversal). Security-adjacent items are mentioned only in passing where they overlap a general-quality finding.

Architectural decisions documented in `CLAUDE.md` (process split, `setInterval`-based tick loop + throttling workarounds, alarm provider strategy pattern, mini-window one-way IPC, electron-store presets) are treated as settled and are **not** re-litigated below.

## Executive Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 7 |
| LOW | 4 |
| SUGGESTION | 3 |

The codebase is generally well-engineered for its size — the alarm provider strategy pattern is followed consistently, the two timer state machines are carefully commented and handle race conditions (`_playToken` generation counters) thoughtfully, and there's no `var`/`==` sloppiness anywhere. The main gaps are: (1) `main.js` has grown into a God-file mixing five unrelated concerns, (2) the app has no recovery path for a renderer crash or a failed initial page load — it would just show a blank window forever, (3) a "cleanup registry" abstraction exists in `renderer.js` but is never invoked (dead machinery, not dead code in the knip sense), and (4) `css/styles.css` has accumulated a real specificity war (33 `!important`s) plus design tokens that have already drifted out of sync with `css/mini.css`.

---

## 1. Architecture & Maintainability

### [HIGH] `main.js` is a 707-line God-file mixing 5+ unrelated concerns
**File:** `d:\CodeSpace\interval-timer\main.js` (whole file)
It owns: the local HTTP server (lines 37–126), main/mini window lifecycle (219–341), tray (350–382), app lifecycle wiring (385–413), the file-picker/quit/mini/preset IPC surface (416–518), and a *complete* Spotify OAuth authorization-code flow including a second `BrowserWindow`, URL parsing, and token exchange/refresh (520–707). None of these share meaningfully cohesive state beyond a handful of module-level `let`s.
Why it matters here: this is the single file every future feature (new IPC channel, new window type, new OAuth provider) will touch, so merge conflicts and regressions concentrate here. It's also the one place in the codebase that doesn't follow the separation-of-concerns discipline the project applies everywhere else (`js/alarm/*`, `js/logic/*`, `js/views/*` are all cleanly split).
**Fix:** extract `lib/localServer.js`, `lib/windows.js` (main+mini+tray), `lib/presetsIpc.js`, and `lib/spotifyAuth.js` (the OAuth window + token exchange/refresh, ~160 lines on their own). `main.js` would then just wire these together at startup — mirroring the `AlarmManager`/`AlarmProviderFactory` split it already does well in the renderer.

### [MEDIUM] `AlarmManager._activateFallback` bypasses its own factory
**File:** `d:\CodeSpace\interval-timer\js\alarm\AlarmManager.js:2, 313`
`AlarmProviderFactory`'s own doc comment states its purpose is that "`AlarmManager` uses this factory — it doesn't know provider classes directly" (`AlarmProviderFactory.js:9`). But `AlarmManager.js` imports `LocalAlarmProvider` directly at the top (line 2) and constructs it directly in `_activateFallback()` (`const fallback = new LocalAlarmProvider();`, line 313) instead of `AlarmProviderFactory.create("local")`.
Why it matters: it's a small, live contradiction of the pattern the file itself documents. If `LocalAlarmProvider`'s constructor signature ever changes, this call site won't be caught by grepping the factory's registry, and a future "new provider" author following the "3 steps" doc comment in `AlarmProviderFactory.js:11-14` won't realize there's a second direct-construction call site to update.
**Fix:** `AlarmProviderFactory.create("local")` in `_activateFallback`, and drop the direct `LocalAlarmProvider` import from `AlarmManager.js`.

### [SUGGESTION] Flat `js/` root mixes controllers with utilities, unlike `logic/`/`views`/`alarm`
**Files:** `js/timer.js`, `js/intervalTimer.js`, `js/tabs.js`, `js/presets.js`, `js/mini.js`, `js/renderer.js`, `js/numberStepper.js`, `js/alarmModal.js`
`js/logic/`, `js/views/`, and `js/alarm/` are cleanly named layers. The DOM-facing controllers sit loose in `js/` root with names that only differ from their logic counterpart by case and folder (`js/timer.js` controller vs. `js/logic/Timer.js` state machine) — easy to mis-grep or mis-open in an editor with fuzzy-find. Not a bug, but for a codebase that otherwise organizes by layer, consider `js/controllers/` for `timer.js`/`intervalTimer.js`/`tabs.js`/`presets.js`/`mini.js`/`alarmModal.js`.

### [SUGGESTION] `js/renderer.js` (280 lines) is doing app-shell, two-modal, and mini-broadcast duty at once
**File:** `d:\CodeSpace\interval-timer\js\renderer.js`
It sets up tab switching, the settings modal, the alarm-folder modal open/close, focus-trapping for both modals, quit confirmation, always-on-top toggling, and the mini-window broadcast/snapshot bridge — all as top-level side effects in one module. It's under the 300-line flag but is already the most multi-purpose file outside `main.js`. If it grows further, splitting the settings-modal and alarm-folder-modal wiring into their own files (mirroring the existing `alarmModal.js` extraction) would keep it navigable.

---

## 2. JavaScript Best Practices / Error Handling

### [HIGH] No error handling around the main window's initial page load
**File:** `d:\CodeSpace\interval-timer\main.js:251`
```js
mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);
```
`loadURL()` returns a promise that rejects on failure (`ERR_CONNECTION_REFUSED`, a firewall/AV blocking loopback, the local server not actually up yet, etc.) — there's no `.catch()`, and no `mainWindow.webContents.on("did-fail-load", ...)` listener (contrast with the Spotify auth window, which *does* have one at line 603). If the load fails, the user gets a permanently blank window with zero feedback, and the rejected promise becomes an unhandled rejection with nothing consuming it (see next finding).
**Fix:** attach a `did-fail-load` handler that retries once or shows an in-window error page, and `.catch()` the `loadURL()` promise to log/report the failure instead of silently swallowing it via Node's default unhandled-rejection behavior.

### [HIGH] No renderer crash/hang recovery
**File:** `d:\CodeSpace\interval-timer\main.js` (no such listener anywhere)
There is no `mainWindow.webContents.on("render-process-gone", ...)` or `("unresponsive", ...)` handler. The renderer does real work that can wedge or crash a tab (YouTube IFrame API + postMessage, Spotify `fetch()` calls, `MutationObserver`s) — if it does, the window just sits there dead with no reload button, no dialog, nothing. The tray's "Open" action would refocus the same dead window.
**Fix:** listen for `render-process-gone` and `unresponsive`, and at minimum offer `mainWindow.reload()` (optionally behind a `dialog.showMessageBox` prompt so an in-progress timer isn't silently reset without the user knowing why).

### [HIGH] `app.on("activate", ...)` async handler isn't covered by the startup `.catch`
**File:** `d:\CodeSpace\interval-timer\main.js:391-393`
```js
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
```
This is registered *inside* the `.then(async () => {...})` callback of the startup chain, but it's its own independent async function — the outer `.catch(err => console.error(...))` (line 395) only covers the *startup* promise, not promises rejected later by this handler. If `createWindow()` throws here (e.g. the same load failure as the finding above, happening on a later activate rather than at boot), it becomes a second unhandled rejection with no logging at all.
**Fix:** wrap the body in its own `try/catch` (`.catch(err => console.error("Activate error:", err))`), consistent with the top-level pattern already used.

### [MEDIUM] `uncaughtException` is handled, `unhandledRejection` is not
**File:** `d:\CodeSpace\interval-timer\main.js:705-707`
Only `process.on("uncaughtException", ...)` is registered. Combined with the two findings above, any rejected promise that nothing awaits (main-process side) is invisible — no log line, nothing. Given Node's default behavior for unhandled rejections has changed across versions (warn-only in some, process-terminating in `--unhandled-rejections=strict`), this is worth closing regardless: `process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));`.

### [MEDIUM] Spotify login window hangs forever on load failure instead of rejecting
**File:** `d:\CodeSpace\interval-timer\main.js:602-610`
```js
authWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
  console.error(`Spotify auth window failed to load: ${errorDescription} (${validatedURL})`);
});
```
This only logs — it never calls `reject(...)` or closes the window. If the user's network is down (or `accounts.spotify.com` is blocked), the `spotify:login` IPC promise (awaited by `js/alarmModal.js:266`) simply never resolves; the "Connecting…" button (`alarmModal.js:264`) stays disabled forever, and the only way out is for the user to manually close the auth window, which then fires the generic `"Spotify login cancelled by user."` message (line 615) — actively misleading about what actually happened.
**Fix:** on `did-fail-load`, reject with the real error description and close the window, instead of relying on the `closed` handler's generic fallback message.

### [MEDIUM] No structured logging — `console.*` scattered with no verbosity control
**Files:** all of `main.js`, `js/alarm/*`, `js/presets.js`, `js/alarmModal.js`, etc.
Every layer logs directly to `console.log/warn/error` (e.g. `AlarmManager.js:101,119,281`, `main.js:107,119,146`), with no shared logger, no log levels, and no way to quiet diagnostic noise in a packaged build (a user running the shipped `.exe` still gets every `"AlarmManager: Loaded [...]"` line if they ever open DevTools to report a bug — there's no persisted log file to ask a non-technical user for either). This is fine for a project this size, but worth flagging under "production readiness": there is currently no way to get a log out of a user's machine after something goes wrong with, say, Spotify token refresh, short of walking them through opening DevTools.
**Fix (low effort):** a 10-line `logger.js` wrapper (prefix + level gate via `app.isPackaged` or an env var) would let you turn down noise in production while keeping it verbose in dev, and centralizes a spot to add file-based logging later if needed.

---

## 3. Memory Leaks / Resource Cleanup

### [MEDIUM] `registerCleanup`/`activeCleanup` in `renderer.js` is dead machinery — registered but never invoked
**Files:** `d:\CodeSpace\interval-timer\js\renderer.js:18-22`, called from `js/timer.js:48-55` and `js/intervalTimer.js:319-327`
```js
let activeCleanup = null;
export function registerCleanup(fn) { activeCleanup = fn; }
```
Both `timer.js` and `intervalTimer.js` call `registerCleanup(...)` with a function that stops the running timer/alarm and resets state — clearly built for "when we tear down/switch away from a tab, clean up." But `activeCleanup` is **never read or called anywhere** in the codebase (confirmed via full-repo grep — only the two assignment sites exist). Since `setupIntervalTimer()`/`setupTimer()` are each called exactly once at startup and `switchTab()` (`renderer.js:39-62`) does a pure show/hide with no re-render, this isn't causing a live bug today — but it's a half-built feature that looks load-bearing and isn't. A future contributor extending tab-switching to actually reset timers on switch (a very plausible ask) would reasonably assume this registry already wires that up, and be wrong.
**Fix:** either wire `switchTab()` to call `activeCleanup?.()` when leaving a tab (if that's the intended behavior), or delete the dead registry and the two call sites if it's not needed, so the code doesn't imply a guarantee it doesn't provide.

### [MEDIUM] `YouTubeAlarmProvider` never destroys the previous `YT.Player` instance
**File:** `d:\CodeSpace\interval-timer\js\alarm\providers\YouTubeAlarmProvider.js:274-291, 296-334`
`_setupContainer()` removes the old `#yt-alarm-container` *div* from the DOM (line 276) before creating a new one, but the previous `YT.Player` object itself is never explicitly torn down (no `this._player.destroy()`), and a brand-new `YouTubeAlarmProvider` + `YT.Player` is constructed by the factory every time the user loads a new YouTube alarm URL (`AlarmProviderFactory.createFromSource`, `AlarmManager.load`, line 109-112 — providers aren't reused). Removing the container div removes the iframe from the DOM, but the JS-side `YT.Player` instance and its internal listeners may still be retained until GC. Over a long session where a user tries several different YouTube alarm URLs (a realistic "let me find the right alarm sound" flow via `alarmModal.js`'s URL loader), this accumulates orphaned player objects.
**Fix:** track the previous provider instance in `AlarmManager` (or have `YouTubeAlarmProvider.load()` call `this._player?.destroy()` before creating a new one) so switching sources actually releases the prior player.

### [LOW] `preload.cjs` exposes one-way `on*` subscriptions with no matching `off*`
**File:** `d:\CodeSpace\interval-timer\preload.cjs:14-17`
`onMiniClosed`, `onTimerState`, `onMiniAction`, `onMiniReady` all call `ipcRenderer.on(...)` with no exposed way to remove a listener. Harmless today because each is subscribed exactly once at module load and never re-subscribed, but the API surface itself invites a leak if any future code path calls one of these more than once (e.g. if a modal or view is ever re-initialized dynamically). Consider exposing `removeAllListeners`/`off` counterparts alongside the existing `on*` methods for future-proofing.

---

## 4. Performance

No issues found in the 200ms tick loop or its DOM updates beyond what's already accounted for by design (elapsed-time correction, documented in `CLAUDE.md`). `timer.js`'s `onTick` (lines 147-163) and `intervalTimer.js`'s `onTick` (207-225) each recompute `mins`/`secs` twice per tick (once in `updateTimerDisplay`/`updateDisplay`, once again inline for the `broadcastTimerState` payload) — trivial duplicate work at 5Hz, not worth restructuring, but a one-line `formatMs(remainingMs)` helper shared by both call sites would remove the duplication called out in the next section for free.

---

## 5. Duplicate Code

### [SUGGESTION] `Timer.js` / `IntervalTimer.js` share significant tick-loop boilerplate, but the split is justified
**Files:** `js/logic/Timer.js`, `js/logic/IntervalTimer.js`
The `start()`/`_clearInterval()`/`getRemainingTime()` scaffolding (interval creation at 200ms, elapsed-time computation, `_stopped` guard against restart-after-stop) is nearly identical between the two classes. This is **not** flagged as a problem to fix by unifying — `IntervalTimer`'s phase-flip-on-completion and loop-continuation logic (`_tick()`, lines 34-49) is genuinely different behavior from `Timer`'s one-shot completion, and CLAUDE.md's rationale for the elapsed-time design applies to both. If it's ever revisited, the *only* safely-shareable part is the tiny interval-handle/elapsed-time scaffolding (`_intervalId`, `_clearInterval`, the `Date.now() - startTime` math) — perhaps a private `_TickLoop` mixin/base — but this is a nice-to-have, not a defect.

### [SUGGESTION] `timer.js` / `intervalTimer.js` duplicate `broadcast()`/`setStatus()`/mm:ss formatting shape
**Files:** `js/timer.js:15-26, 124-132`, `js/intervalTimer.js:68-107`
Both controllers independently implement: a `broadcast(overrides)` that spreads a base state object into `broadcastTimerState`, a `setStatus(status)` that updates a status label element and re-broadcasts, and mm:ss zero-padding formatting. Given each controller also has real, non-shared per-tab concerns (loop count, phase text, preset wiring for the interval tab), full unification isn't warranted, but the mm:ss formatting and the "broadcast shape + setStatus" pattern could be a ~15-line shared helper (`js/timerStateBroadcast.js`) to remove the fully-duplicated formatting logic called out in the Performance section above.

---

## 6. Dead Code (beyond the knip-reported `AlarmManager` export)

### [LOW] Commented-out CSP block left in `index.html`
**File:** `d:\CodeSpace\interval-timer\index.html:5-13`
An entire alternate `<meta http-equiv="Content-Security-Policy" ...>` block is commented out directly above the live one (lines 15-24), with no note explaining why it was superseded or whether it's safe to delete. It reads like an intermediate debugging step (a narrower CSP that didn't allow `accounts.spotify.com`/`i.scdn.co`/etc.) that was left in place. Low risk on its own, but commented-out security-relevant config sitting in a shipped HTML file is exactly the kind of thing that gets uncommented by accident during a future edit.
**Fix:** delete it, or replace with a one-line comment stating why the current policy needs the extra origins if that context is useful to keep.

---

## 7. HTML / CSS

### [MEDIUM] Specificity war in `css/styles.css`: 33 clustered `!important`s on button variants
**File:** `d:\CodeSpace\interval-timer\css/styles.css:759-782, 1082-1108` (of 33 total `!important`s in the file; 2 more are the legitimate `prefers-reduced-motion` overrides at 673-680/1311-1312, which are a reasonable use of `!important`)
```css
.btn-primary { border-color: var(--accent) !important; color: var(--accent) !important; font-weight: 700 !important; }
.btn-subtle { border-color: transparent !important; color: var(--ink-muted) !important; font-size: var(--text-xs) !important; }
.preset-item__btn--yes { color: #e05c5c !important; ... }
```
Every button "variant" class needs `!important` to win over the base `button`/`button:hover:not(:disabled)` rules (lines 487-529) even though a class selector already out-specifies a bare type selector — which suggests there's an even-higher-specificity rule elsewhere in the cascade these are actually fighting, or that `!important` was reached for reflexively rather than diagnosing the real conflict. Either way, this is now the established pattern for adding a new button variant, so every future one will need to add another `!important`, compounding the fragility.
**Fix:** identify what these variants are actually losing to (likely the ID selectors at `#startBtn, #startLoopBtn`, lines 532-544, or hover-state ordering) and resolve via selector adjustment/source order instead of `!important`, so future variants don't have to keep playing the same game.

### [MEDIUM] Design tokens have already drifted between `css/styles.css` and `css/mini.css`
**Files:** `d:\CodeSpace\interval-timer\css\styles.css:19-34`, `d:\CodeSpace\interval-timer\css\mini.css:15-27`
Both files independently define the same-named custom properties, and several no longer agree:

| Token | styles.css | mini.css |
|---|---|---|
| `--bg` | `#1e1e1e` | `#1a1a1a` |
| `--border` | `#ff7a1a33` | `#333` |
| `--ink-muted` | `#c8c8c8` | `#b0b0b0` |
| `--accent-dim` | `#ff7a1a22` | `rgba(255, 122, 26, 0.12)` |

Since the mini window and main window are meant to look like the same app (same accent orange, same dark theme), this means a deliberate palette tweak in one file silently does not apply to the other — which has apparently already happened at least once (the accessibility-motivated `--ink-muted` bump noted in the `styles.css:23` comment `/* ← #888'den yükseltildi, 5.2:1 */` for contrast ratio wasn't carried into `mini.css`, so the mini window's muted text may not meet the same contrast target the main window was just fixed to hit).
**Fix:** extract a shared `css/tokens.css` with the `:root` custom properties, imported by both `index.html` and `mini.html`, so a token change can't apply to only one window.

### [LOW] Duplicate `.mini-header` rule in `css/mini.css`
**File:** `d:\CodeSpace\interval-timer\css\mini.css:62-74` and `202-211`
`.mini-header` is defined twice with overlapping properties (`width`, `display`, `align-items`, `justify-content`, `padding-bottom`, `border-bottom`) — the second block (202-211) only adds a comment noting `cursor: grab` was intentionally removed in favor of native drag, but re-declares everything else redundantly instead of just removing the one property from the original block.
**Fix:** merge into the single original declaration and delete the `cursor: grab` line from it, dropping the second block entirely.

### [LOW] Two separate "Reduced motion" `@media` blocks in `css/styles.css`
**File:** `d:\CodeSpace\interval-timer\css\styles.css:668-682` and `1299-1314`
Both are headed by the identical `/* ── Reduced motion ─── */` comment but target different, non-overlapping selectors (global transitions/countdown pulse vs. preset dropdown/toast). Not a bug — browsers merge media queries fine — but having two identically-labeled sections ~600 lines apart makes it easy to miss one when auditing "did we cover motion-reduction for X" and easy to accidentally add a third instead of extending an existing block.
**Fix:** consolidate into one `@media (prefers-reduced-motion: reduce)` block, or at least differentiate the comments ("Reduced motion — core" / "Reduced motion — presets").

---

## 8. Folder Organization & Naming Consistency

Overall this is a strong point of the codebase: `js/logic/` (pure state machines), `js/views/` (render-only template functions), and `js/alarm/` (strategy/factory) are each internally consistent and match what `CLAUDE.md` documents. The one inconsistency is the flat `js/` root mixing DOM-facing controllers (`timer.js`, `intervalTimer.js`, `tabs.js`, `presets.js`, `mini.js`, `renderer.js`, `alarmModal.js`) with a generic DOM utility (`numberStepper.js`) — see the Architecture section above for the suggested `js/controllers/` grouping. This is a SUGGESTION, not a defect; nothing here caused a bug.

---

## 9. Large Files (over ~300 lines)

| File | Lines |
|---|---|
| `css/styles.css` | 1423 |
| `main.js` | 707 |
| `js/presets.js` | 417 |
| `js/alarm/AlarmManager.js` | 347 |
| `js/alarm/providers/YouTubeAlarmProvider.js` | 343 |
| `js/intervalTimer.js` | 328 |
| `js/alarmModal.js` | 312 |

`main.js` is the only one flagged as a genuine problem (Architecture section, HIGH). `presets.js`, `AlarmManager.js`, `YouTubeAlarmProvider.js`, `intervalTimer.js`, and `alarmModal.js` are all single-responsibility files that are long because the feature they implement (preset CRUD UI incl. inline delete-confirm and a full form overlay; Spotify-token-aware alarm playback; a full YouTube IFrame API integration; interval+loop timer control) is inherently that big — splitting them further would mostly just relocate code without reducing complexity.

---

## 10. Production Readiness Gaps (consolidated)

These are called out individually above; listed together here since this was one of the requested lenses:
1. Blank-screen-of-death on initial load failure (`main.js:251`, HIGH) — no user-visible error, no retry.
2. No renderer-crash recovery (`main.js`, HIGH) — dead window, no reload path.
3. Spotify login can hang indefinitely on network failure with a misleading eventual error message (`main.js:602-610`, MEDIUM).
4. No way to extract diagnostic logs from a user's machine after something breaks (MEDIUM) — every log is `console.*` with no persistence.
5. Window resize/minimize: not an issue — the elapsed-time timer design and DOM re-renders from state are resilient to this; no findings here.

---

## Files Read For This Review

`main.js`, `preload.cjs`, `index.html`, `mini.html`, `css/styles.css`, `css/mini.css`, `js/renderer.js`, `js/tabs.js`, `js/timer.js`, `js/intervalTimer.js`, `js/logic/Timer.js`, `js/logic/IntervalTimer.js`, `js/views/timerView.js`, `js/views/intervalTimerView.js`, `js/mini.js`, `js/numberStepper.js`, `js/presets.js`, `js/alarmModal.js`, `js/alarm/AlarmManager.js`, `js/alarm/AlarmProviderFactory.js`, `js/alarm/providers/BaseAlarmProvider.js`, `js/alarm/providers/LocalAlarmProvider.js`, `js/alarm/providers/YouTubeAlarmProvider.js`, `js/alarm/providers/SpotifyAlarmProvider.js`, `package.json`.
