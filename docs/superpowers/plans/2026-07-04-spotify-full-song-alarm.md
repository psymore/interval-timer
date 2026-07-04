# Spotify Full-Song Alarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selecting a Spotify track as an alarm source open the real Spotify desktop app and play the full track, with the app able to pause it later (on duration elapse or manual stop), replacing the current 30-second-preview/Client-Credentials implementation.

**Architecture:** `play()` calls a new main-process IPC handler (`spotify:open-track`) that does `shell.openExternal("spotify:track:<id>")`, launching/foregrounding the Spotify desktop app with no auth required. `stop()` calls Spotify's Web API pause endpoint directly from the renderer using a **user** OAuth access token (Authorization Code flow, already implemented in `main.js` but never wired up). The Client Credentials/preview code path is deleted outright. This is a vanilla-JS Electron app with **no test suite and no lint script configured** (confirmed in `CLAUDE.md` — `npm test` is a stub), so every task below ends in a manual verification via `npm start` instead of an automated test run.

**Tech Stack:** Electron (main + renderer, `contextBridge` preload), vanilla ES modules, `electron-store`, Spotify Web API / Accounts API, no bundler/framework.

## Global Constraints

- Client secret never leaves the main process (`main.js`) — already true today, must remain true.
- `stop()`'s pause call **requires Spotify Premium**; on Free accounts the pause request fails and is swallowed silently — the track keeps playing until the user pauses it by hand. This is expected, not a bug to fix.
- No track search/picker UI — track selection stays "paste a Spotify track URL/URI", unchanged.
- Detecting whether the Spotify desktop app is installed is out of scope — `shell.openExternal` failures are not handled specially.
- `AlarmManager` is the only import point for alarm behavior; `SpotifyAlarmProvider` must keep implementing the `BaseAlarmProvider` contract (`load`, `play`, `stop`, `isReady`) so `AlarmProviderFactory`/`AlarmManager` need no structural changes beyond the token-handling rewrite in Task 3.

---

### Task 1: Main-process IPC — open-track handler, playback-state scope, remove dead Client Credentials handler

**Files:**
- Modify: `main.js:3-13` (imports), `main.js:76-81` (`SPOTIFY_SCOPES`), `main.js:514-550` (replace `spotify:client-token` handler)
- Modify: `preload.cjs:23-27`

**Interfaces:**
- Produces: `window.electronAPI.spotifyOpenTrack(trackId: string) => Promise<void>` — invokes `spotify:open-track` IPC, resolves once `shell.openExternal` has been called (does not wait for Spotify to actually start playing).
- Removes: `window.electronAPI.spotifyClientToken()` and the `spotify:client-token` IPC handler — becomes dead code once Task 3 stops calling it, so it is deleted here rather than left to rot.

- [ ] **Step 1: Import `shell` in `main.js`**

In `main.js`, the import block currently reads:

```js
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  dialog,
  Tray,
  Menu,
  nativeImage,
  screen,
} from "electron";
```

Change it to:

```js
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  dialog,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell,
} from "electron";
```

- [ ] **Step 2: Add `user-read-playback-state` scope**

In `main.js`, `SPOTIFY_SCOPES` currently reads:

```js
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
].join(" ");
```

Change it to:

```js
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");
```

- [ ] **Step 3: Replace the `spotify:client-token` handler with `spotify:open-track`**

In `main.js`, find this block (the whole `spotify:client-token` handler, including its doc comment):

```js
/**
 * spotify:client-token
 * Client Credentials flow ile uygulama token'ı alır.
 * Preview modu için kullanılır — kullanıcı login'i gerekmez.
 */
ipcMain.handle("spotify:client-token", async () => {
  console.log("DEBUG — CLIENT_ID:", SPOTIFY_CLIENT_ID);
  console.log("DEBUG — CLIENT_ID length:", SPOTIFY_CLIENT_ID?.length);

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify credentials not configured in main.js.");
  }
  // ... geri kalanı aynı
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Spotify client token failed (${response.status}): ${text}`,
    );
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
});
```

Replace it with:

```js
/**
 * spotify:open-track
 * OS URI ile Spotify masaüstü uygulamasını açar, track'i tam olarak çalar.
 * Token gerekmez — shell.openExternal işletim sistemine devrediyor.
 */
ipcMain.handle("spotify:open-track", async (_event, trackId) => {
  if (!trackId) {
    throw new Error("spotify:open-track: No track ID provided.");
  }
  await shell.openExternal(`spotify:track:${trackId}`);
});
```

- [ ] **Step 4: Update `preload.cjs`**

Current block:

```js
  // Spotify — client_secret hiçbir zaman renderer'a geçmez
  spotifyLogin: () => ipcRenderer.invoke("spotify:login"),
  spotifyRefresh: token => ipcRenderer.invoke("spotify:refresh", token),
  spotifyClientToken: () => ipcRenderer.invoke("spotify:client-token"),
```

Change to:

```js
  // Spotify — client_secret hiçbir zaman renderer'a geçmez
  spotifyLogin: () => ipcRenderer.invoke("spotify:login"),
  spotifyRefresh: token => ipcRenderer.invoke("spotify:refresh", token),
  spotifyOpenTrack: trackId => ipcRenderer.invoke("spotify:open-track", trackId),
```

- [ ] **Step 5: Manual verification**

Run: `npm start`

Once the app window is open, open DevTools (View menu or `Ctrl+Shift+I`) and in the console run:

```js
await window.electronAPI.spotifyOpenTrack("4uLU6hMCjMI75M1A2tKUQC")
```

Expected: no error is thrown, the promise resolves, and the Spotify desktop app opens/foregrounds and starts playing "Never Gonna Give You Up". (Skip this exact check if Spotify desktop isn't installed on the test machine — confirm instead that the call resolves without throwing and no console error appears.)

Also confirm the app still starts cleanly with no console errors from the import/scope changes, and that `window.electronAPI.spotifyClientToken` is now `undefined`.

- [ ] **Step 6: Commit**

```bash
git add main.js preload.cjs
git commit -m "Replace Spotify client-credentials IPC with OS URI track launcher"
```

---

### Task 2: Rewrite `SpotifyAlarmProvider` for full-track playback + Web API pause

**Files:**
- Modify: `js/alarm/providers/SpotifyAlarmProvider.js` (full rewrite)

**Interfaces:**
- Consumes: `window.electronAPI.spotifyOpenTrack(trackId)` (Task 1).
- Produces: `new SpotifyAlarmProvider({ accessToken })` — constructor now takes only `accessToken` (no more `clientId`/`clientSecret`). Implements `load(source)`, `play(duration)`, `stop()`, `isReady()` per `BaseAlarmProvider`, plus a new `setAccessToken(token)` used by `AlarmManager` in Task 3 to refresh the token this instance uses for the pause call without re-constructing the provider.

- [ ] **Step 1: Replace the full contents of `js/alarm/providers/SpotifyAlarmProvider.js`**

```js
import { BaseAlarmProvider } from "./BaseAlarmProvider.js";

/**
 * SpotifyAlarmProvider
 *
 * Sorumluluk: OS URI launch ile Spotify masaüstü uygulamasını açıp track'i
 * tam olarak çalar (shell.openExternal("spotify:track:<id>") — token
 * gerekmez). Durdurma işlemi Spotify Web API'nin pause endpoint'i ile
 * yapılır ve bu **Spotify Premium** gerektirir; free hesaplarda pause
 * çağrısı sessizce başarısız olur ve track manuel durdurulana kadar çalar.
 *
 * Renderer process'te yaşar.
 */
export class SpotifyAlarmProvider extends BaseAlarmProvider {
  constructor({ accessToken = null } = {}) {
    super();
    this._accessToken = accessToken;
    this._trackId = null;
    this._ready = false;
    this._timeoutId = null;
  }

  async load(source) {
    this._trackId = this._extractTrackId(source);
    if (!this._trackId) {
      throw new Error(
        `SpotifyAlarmProvider: Could not extract track ID from "${source}".`,
      );
    }

    if (!this._accessToken) {
      throw new Error(
        "SpotifyAlarmProvider: Access token required. Connect a Spotify account first.",
      );
    }

    this._ready = true;
  }

  async play(duration = 0) {
    if (!this._ready) {
      throw new Error("SpotifyAlarmProvider: Not ready. Call load() first.");
    }
    this._clearTimeout();

    await window.electronAPI.spotifyOpenTrack(this._trackId);

    if (duration > 0) {
      this._timeoutId = setTimeout(() => this.stop(), duration * 1000);
    }
  }

  async stop() {
    this._clearTimeout();
    if (!this._accessToken) return;

    try {
      await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { Authorization: `Bearer ${this._accessToken}` },
      });
    } catch (e) {
      // Free hesap / aktif cihaz yok / token süresi dolmuş — sessizce yut,
      // AlarmManager._stopCurrent() zaten provider stop() hatalarını yutuyor.
    }
  }

  isReady() {
    return this._ready;
  }

  /**
   * AlarmManager, play() öncesi token'ı refresh ettiğinde bu instance'ın
   * accessToken'ını günceller — provider load() sırasında yakaladığı token
   * saatler sonra çalınca (alarm tetiklendiğinde) süresi dolmuş olabilir.
   */
  setAccessToken(token) {
    this._accessToken = token;
  }

  // ── Helpers ────────────────────────────────────────────────
  _extractTrackId(source) {
    if (!source) return null;
    if (/^[a-zA-Z0-9]{22}$/.test(source)) return source;
    const uriMatch = source.match(/spotify:track:([a-zA-Z0-9]{22})/);
    if (uriMatch) return uriMatch[1];
    try {
      const url = new URL(source);
      const segments = url.pathname.split("/");
      const idx = segments.indexOf("track");
      if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
    } catch {}
    return null;
  }

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
```

- [ ] **Step 2: Manual verification**

Run: `npm start`, open DevTools console, and get a real user token without needing the UI (Task 4 wires the button, but the underlying IPC already works):

```js
const tokens = await window.electronAPI.spotifyLogin(); // complete the login popup
localStorage.setItem("spotify_access_token", tokens.accessToken);
```

Then exercise the provider directly:

```js
const { SpotifyAlarmProvider } = await import("./js/alarm/providers/SpotifyAlarmProvider.js");
const p = new SpotifyAlarmProvider({ accessToken: tokens.accessToken });
await p.load("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
await p.play(5); // full track should start in the Spotify desktop app
```

Expected: track starts playing immediately in the Spotify desktop app. After 5 seconds, on a Premium account, the track pauses on its own; on a Free account, the pause call fails silently (check DevTools console — no uncaught error) and the track keeps playing.

Also verify the error path: `new SpotifyAlarmProvider({}).load("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")` rejects with `"SpotifyAlarmProvider: Access token required. Connect a Spotify account first."`.

- [ ] **Step 3: Commit**

```bash
git add js/alarm/providers/SpotifyAlarmProvider.js
git commit -m "Rewrite SpotifyAlarmProvider for full-track OS launch + Web API pause"
```

---

### Task 3: Rewire `AlarmManager` to require a user Spotify token (drop Client Credentials)

**Files:**
- Modify: `js/alarm/AlarmManager.js`

**Interfaces:**
- Consumes: `SpotifyAlarmProvider.setAccessToken(token)` (Task 2).
- Produces: `AlarmManager._buildSpotifyOpts() => Promise<{ accessToken: string }>` — throws if no valid/refreshable session exists, which is caught by the existing non-local-provider fallback path in `load()`. No other public method signatures change.

- [ ] **Step 1: Replace the commented-out block and `_buildSpotifyOpts()`**

In `js/alarm/AlarmManager.js`, find this entire block (the large commented-out function plus the live client-credentials version directly below it):

```js
  /**
   * Spotify için geçerli bir accessToken içeren opts objesi döner.
   * Önce localStorage'a bakar. Token dolmuşsa refresh eder.
   * Hiç token yoksa client credentials flow'u dener (preview için).
   */
  // async _buildSpotifyOpts() {
  //   const refreshToken = localStorage.getItem("spotify_refresh_token");
  //   const expiresAt = parseInt(
  //     localStorage.getItem("spotify_expires_at") ?? "0",
  //     10,
  //   );
  //   const accessToken = localStorage.getItem("spotify_access_token");

  //   // Kullanıcı login olmuşsa (gerçek user token'ı varsa) full mode dene
  //   if (accessToken && Date.now() < expiresAt) {
  //     return { accessToken, mode: "full" }; // ← geri "full" yapıldı
  //   }

  //   if (refreshToken) {
  //     try {
  //       const tokens = await window.electronAPI.spotifyRefresh(refreshToken);
  //       this._saveSpotifyTokens(tokens);
  //       return { accessToken: tokens.accessToken, mode: "full" }; // ← geri "full"
  //     } catch (e) {
  //       console.warn("AlarmManager: Refresh token failed:", e.message);
  //       this._clearSpotifyTokens();
  //     }
  //   }

  //   // Login yoksa client credentials ile preview moduna düş
  //   try {
  //     const result = await window.electronAPI.spotifyClientToken();
  //     return { accessToken: result.accessToken, mode: "preview" };
  //   } catch (e) {
  //     throw new Error(
  //       "SpotifyAlarmProvider: Could not obtain any Spotify token.",
  //     );
  //   }
  // }

  async _buildSpotifyOpts() {
    // Web Playback SDK kaldırıldığı için kullanıcı login'i artık gerekmiyor.
    // Her zaman client credentials ile preview token alınır.
    try {
      const result = await window.electronAPI.spotifyClientToken();
      return { accessToken: result.accessToken };
    } catch (e) {
      throw new Error(
        "SpotifyAlarmProvider: Could not obtain Spotify token. " +
          "Configure credentials in main.js.",
      );
    }
  }
```

Replace it with:

```js
  /**
   * Spotify için geçerli bir kullanıcı accessToken'ı içeren opts döner.
   * Önce localStorage'a bakar. Token süresi dolmuşsa/dolmak üzereyse
   * refresh eder. Ne geçerli token ne de refresh token varsa fırlatır —
   * bu, load()'daki mevcut non-local-provider catch bloğunu tetikleyip
   * local alarm fallback'ine düşürür.
   */
  async _buildSpotifyOpts() {
    const refreshToken = localStorage.getItem("spotify_refresh_token");
    const expiresAt = parseInt(
      localStorage.getItem("spotify_expires_at") ?? "0",
      10,
    );
    const accessToken = localStorage.getItem("spotify_access_token");

    if (accessToken && Date.now() < expiresAt) {
      return { accessToken };
    }

    if (refreshToken) {
      try {
        const tokens = await window.electronAPI.spotifyRefresh(refreshToken);
        this._saveSpotifyTokens(tokens);
        return { accessToken: tokens.accessToken };
      } catch (e) {
        console.warn("AlarmManager: Refresh token failed:", e.message);
        this._clearSpotifyTokens();
      }
    }

    throw new Error(
      "AlarmManager: No Spotify session. Connect a Spotify account first.",
    );
  }
```

- [ ] **Step 2: Drop the `mode` field from the opts-prepared log line**

Find, in `load()`:

```js
      try {
        const spotifyOpts = await this._buildSpotifyOpts();
        opts = { ...spotifyOpts, ...opts };
        console.log("AlarmManager: Spotify opts prepared:", {
          hasToken: !!opts.accessToken,
          mode: opts.mode,
        });
      } catch (e) {
```

Change to:

```js
      try {
        const spotifyOpts = await this._buildSpotifyOpts();
        opts = { ...spotifyOpts, ...opts };
        console.log("AlarmManager: Spotify opts prepared:", {
          hasToken: !!opts.accessToken,
        });
      } catch (e) {
```

- [ ] **Step 3: Refresh the live provider's token before every Spotify play()**

`_refreshSpotifyTokenIfNeeded()` already updates `localStorage` before every `play()`, but a `SpotifyAlarmProvider` instance is normally created once at `load()` time (e.g. at app startup) and reused for many `play()` calls potentially hours apart — its captured `_accessToken` would go stale between loads. Find, in `play()`:

```js
    // Spotify token süresi dolmuş olabilir — çalmadan önce kontrol et
    if (this._providerType === "spotify") {
      try {
        await this._refreshSpotifyTokenIfNeeded();
      } catch (e) {
        console.warn("AlarmManager: Spotify token refresh failed:", e.message);
      }
    }
```

Change to:

```js
    // Spotify token süresi dolmuş olabilir — çalmadan önce kontrol et
    if (this._providerType === "spotify") {
      try {
        await this._refreshSpotifyTokenIfNeeded();
        this._provider.setAccessToken(
          localStorage.getItem("spotify_access_token"),
        );
      } catch (e) {
        console.warn("AlarmManager: Spotify token refresh failed:", e.message);
      }
    }
```

- [ ] **Step 4: Manual verification**

Run: `npm start`, open DevTools console.

With no Spotify session (clear any leftover keys first: `localStorage.removeItem("spotify_access_token"); localStorage.removeItem("spotify_refresh_token");`):

```js
import("./js/alarm/AlarmManager.js").then(async ({ alarmManager }) => {
  const result = await alarmManager.load("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  console.log(result); // expect { type: "local", usedFallback: true }
});
```

Expected: falls back to the local alarm, console shows `AlarmManager: [spotify] load failed` followed by the fallback warning — no client-credentials call is attempted anywhere.

With a valid session (log in first via `await window.electronAPI.spotifyLogin()` and save the tokens through `alarmManager._saveSpotifyTokens(tokens)`):

```js
await alarmManager.load("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
await alarmManager.play(5);
```

Expected: `{ type: "spotify", usedFallback: false }` from `load()`, and the Spotify desktop app opens and plays the track, auto-stopping after 5s on Premium accounts.

- [ ] **Step 5: Commit**

```bash
git add js/alarm/AlarmManager.js
git commit -m "Require user Spotify token for alarm playback, drop client-credentials path"
```

---

### Task 4: UI — Connect Spotify button + auth-state toggle

**Files:**
- Modify: `index.html:98-120` (`#spotifyStatusRow`, alarm-url-hint copy)
- Modify: `js/alarmModal.js`

**Interfaces:**
- Consumes: `window.electronAPI.spotifyLogin()` (existing), `alarmManager._saveSpotifyTokens(tokens)` (existing, called directly per design).
- Produces: none consumed by other tasks — this is the last task in the chain.

- [ ] **Step 1: Update `index.html`**

Find:

```html
                <p class="alarm-url-hint">
                    Paste a YouTube video or Spotify track URL.
                    If unavailable, local alarm will be used as fallback.
                </p>
```

Change to:

```html
                <p class="alarm-url-hint">
                    Paste a YouTube video or Spotify track URL. Spotify links
                    require connecting your account and play through the real
                    Spotify app (not an in-app preview).
                    If unavailable, local alarm will be used as fallback.
                </p>
```

Find:

```html
                <!-- Spotify bağlıysa görünür -->
                <div class="alarm-spotify-status hidden" id="spotifyStatusRow">
                    <span class="alarm-section-label">Spotify</span>
                    <span id="spotifyStatusLabel">Connected</span>
                    <button id="spotifyLogoutBtn" class="btn-subtle">Disconnect</button>
                </div>
```

Change to:

```html
                <div class="alarm-spotify-status" id="spotifyStatusRow">
                    <span class="alarm-section-label">Spotify</span>
                    <span id="spotifyStatusLabel">Not connected</span>
                    <button id="spotifyConnectBtn" class="btn-subtle">Connect Spotify</button>
                    <button id="spotifyLogoutBtn" class="btn-subtle hidden">Disconnect</button>
                </div>
```

- [ ] **Step 2: Add auth-state toggle helper and wire the Connect button in `js/alarmModal.js`**

Find:

```js
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmFeedback = document.getElementById("alarmFeedback");
  const urlInput = document.getElementById("alarmUrlInput");
  const urlLoadBtn = document.getElementById("alarmUrlLoadBtn");
  const urlProviderTag = document.getElementById("alarmProviderTag");
```

Change to:

```js
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmFeedback = document.getElementById("alarmFeedback");
  const urlInput = document.getElementById("alarmUrlInput");
  const urlLoadBtn = document.getElementById("alarmUrlLoadBtn");
  const urlProviderTag = document.getElementById("alarmProviderTag");
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");
```

Find (a few lines down, the now-duplicate declaration to remove):

```js
  // ── Spotify logout (opsiyonel — ileride eklenebilir) ──────
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");
  if (spotifyLogoutBtn) {
    spotifyLogoutBtn.addEventListener("click", () => {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("spotify_expires_at");
      showFeedback("Spotify disconnected.", "success");
      updateProviderTag("local");
    });
  }
});
```

Change to:

```js
  // ── Spotify auth UI ────────────────────────────────────────
  function hasSpotifySession() {
    return Boolean(
      localStorage.getItem("spotify_access_token") ||
        localStorage.getItem("spotify_refresh_token"),
    );
  }

  function updateSpotifyAuthUI() {
    const connected = hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected ? "Connected" : "Not connected";
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
  }

  if (spotifyConnectBtn) {
    spotifyConnectBtn.addEventListener("click", async () => {
      spotifyConnectBtn.disabled = true;
      spotifyConnectBtn.textContent = "Connecting…";
      try {
        const tokens = await window.electronAPI.spotifyLogin();
        alarmManager._saveSpotifyTokens(tokens);
        updateSpotifyAuthUI();
        showFeedback("Spotify connected.", "success");
      } catch (err) {
        console.error("Spotify login error:", err);
        showFeedback(
          `Spotify connection failed: ${err.message ?? "Unknown error"}`,
          "error",
        );
      } finally {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.textContent = "Connect Spotify";
      }
    });
  }

  if (spotifyLogoutBtn) {
    spotifyLogoutBtn.addEventListener("click", () => {
      localStorage.removeItem("spotify_access_token");
      localStorage.removeItem("spotify_refresh_token");
      localStorage.removeItem("spotify_expires_at");
      showFeedback("Spotify disconnected.", "success");
      updateProviderTag("local");
      updateSpotifyAuthUI();
    });
  }

  updateSpotifyAuthUI();
});
```

- [ ] **Step 3: Call the toggle once at modal init, right after `alarmManager.initialize()`**

Find:

```js
  // ── Başlangıç yükleme ─────────────────────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);

  const savedSource = localStorage.getItem("selectedAlarmPath");
```

Change to:

```js
  // ── Başlangıç yükleme ─────────────────────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);
  updateSpotifyAuthUI();

  const savedSource = localStorage.getItem("selectedAlarmPath");
```

(The call added at the bottom of Step 2 covers the case where the DOM listeners are attached after init; this one ensures the label is correct immediately after `initialize()` even if Step 2's trailing call were ever removed. Both calls are cheap and idempotent.)

- [ ] **Step 4: Disable the Preview button when the loaded source is Spotify**

Preview playback for Spotify now opens the real Spotify desktop app rather than playing an in-app clip, so the "▶ Preview" button should be disabled (not clickable) whenever the currently loaded source is Spotify, and re-enabled for local/YouTube sources.

Find, in `js/alarmModal.js`:

```js
  function updateProviderTag(type) {
    if (!urlProviderTag) return;
    const labels = { youtube: "YouTube", spotify: "Spotify" };
    const label = labels[type];
    if (label) {
      urlProviderTag.textContent = label;
      urlProviderTag.classList.remove("hidden");
    } else {
      urlProviderTag.classList.add("hidden");
    }
  }
```

Change to:

```js
  function updateProviderTag(type) {
    if (urlProviderTag) {
      const labels = { youtube: "YouTube", spotify: "Spotify" };
      const label = labels[type];
      if (label) {
        urlProviderTag.textContent = label;
        urlProviderTag.classList.remove("hidden");
      } else {
        urlProviderTag.classList.add("hidden");
      }
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? "Preview isn't available for Spotify — playing opens the Spotify app directly."
        : "";
    }
  }
```

`updateProviderTag(type)` is already the single choke point called on every provider-type transition (modal init, after choosing a local file, after a URL load succeeds or falls back, and on Spotify disconnect — see Task 4 Step 2 above), so no new call sites are needed: Preview is disabled exactly when the loaded source is Spotify and re-enabled everywhere else.

- [ ] **Step 5: Manual verification**

Run: `npm start`, open the alarm sound modal (🔔 icon).

With no Spotify session: confirm the row shows "Not connected" and only the "Connect Spotify" button is visible (Disconnect is hidden).

Click "Connect Spotify": confirm the button shows "Connecting…" and is disabled, the OAuth popup opens, and after completing login the row flips to "Connected" with only "Disconnect" visible, and a success toast appears.

Click "Disconnect": confirm the row flips back to "Not connected" / "Connect Spotify" and a toast confirms disconnection.

Paste a Spotify track URL into the alarm URL field and click "Load" while connected: confirm it loads successfully (`"Spotify alarm loaded."` toast) instead of falling back to local, and that the "▶ Preview" button becomes disabled with a tooltip explaining why. Then choose a local file: confirm "▶ Preview" becomes enabled again.

- [ ] **Step 6: Commit**

```bash
git add index.html js/alarmModal.js
git commit -m "Add Connect Spotify button and auth-state toggle to alarm modal"
```

---

## Self-Review Notes

- **Spec coverage:** OS URI launch (Task 1+2), Web API pause + Premium caveat (Task 2), `play(duration)` arm/no-arm semantics (Task 2), token flow rewrite + scope addition (Task 1+3), UI Connect/Disconnect toggle + copy update (Task 4), components-touched table fully covered across the four tasks. Out-of-scope items (track picker UI, install detection, proactive Free/Premium detection) are untouched by design.
- **Token staleness gap not in the original spec table:** added `SpotifyAlarmProvider.setAccessToken()` (Task 2) and the corresponding call in `AlarmManager.play()` (Task 3, Step 3) because a provider loaded once at startup and played hours later would otherwise carry a dead access token into the pause call, silently breaking auto-stop for every session longer than the token lifetime (~1 hour) — this is a correctness fix implied by the spec's own goal ("alarm duration feature should control the playback length of the song"), not new scope.
- **No test suite:** per `CLAUDE.md`, `npm test` is a stub and there's no lint script, so every task substitutes a manual `npm start` + DevTools-console verification for the usual automated test step.
