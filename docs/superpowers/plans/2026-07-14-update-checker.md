# Update Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the user inside the app when a newer version has been published to GitHub Releases, without downloading or installing anything automatically.

**Architecture:** A new `lib/updateChecker.js` main-process module fetches `GET https://api.github.com/repos/psymore/interval-timer/releases/latest`, compares its `tag_name` against `app.getVersion()`, and either pushes an `updates:available` event to the main window on launch or answers a live `updates:check` IPC call from a manual "Check for updates" button in the settings modal. A dismissed version is persisted in the existing `electron-store` instance so the launch-time banner doesn't reappear for a version the user already saw.

**Tech Stack:** Electron main process (Node's built-in `fetch`, no new dependency), existing `electron-store`/IPC/i18n patterns already used throughout `lib/*Ipc.js` and `js/*.js`.

## Global Constraints

- No new npm dependency — use the global `fetch` already available in this Electron/Node version, not `electron-updater` or `node-fetch`.
- Notify-only: never download or execute an installer from this code. "Download" always means `shell.openExternal()` to the GitHub Releases page.
- The GitHub API call must run in the **main process only**. The renderer's CSP (`index.html`'s `connect-src`) does not include `api.github.com`/`github.com` and would silently block a renderer-side `fetch` — this is exactly why the design puts the check behind IPC rather than calling it from `js/`.
- `updates:open-releases` must only ever call `shell.openExternal()` on a `https://github.com/...` URL, even though the renderer only ever passes back a URL it got from `updates:check` — defense in depth against a compromised renderer.
- New persisted field: `dismissedUpdateVersion` (string or `null`), added to the existing `defaults` block in `main.js`'s `Store` constructor.
- New IPC channels are namespaced `updates:*`, matching the existing `settings:*`/`presets:*`/`spotify:*` convention.
- New UI strings go through the existing i18n system (`js/i18n/translations.js`, `t()`/`format()`), both `en` and `tr`.
- This repo has no test runner (`npm test` is a stub, no jest/mocha installed) — verification steps below are manual (run the app, check output) rather than automated tests. Don't add a test framework as part of this work.

---

### Task 1: Version comparison and GitHub fetch (pure logic)

**Files:**
- Create: `lib/updateChecker.js`

**Interfaces:**
- Produces: `compareVersions(a: string, b: string): number` — returns `-1` if `a < b`, `0` if equal, `1` if `a > b`, comparing dotted numeric version strings numerically per segment (not lexicographically).
- Produces (module-private, used by Task 2): `checkForUpdate(): Promise<{currentVersion: string, latestVersion: string, updateAvailable: boolean, releaseUrl: string}>`.

- [ ] **Step 1: Write `lib/updateChecker.js` with the comparator and fetch logic**

```js
import { app } from "electron";

import { createLogger } from "./logger.js";

const log = createLogger("update-checker");

const REPO = "psymore/interval-timer";
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * Compares two "X.Y.Z" version strings numerically, segment by segment.
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) return numA > numB ? 1 : -1;
  }
  return 0;
}

async function fetchLatestRelease() {
  const res = await fetch(RELEASES_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.tag_name !== "string" || typeof data.html_url !== "string") {
    throw new Error("Unexpected GitHub release response shape");
  }
  return { version: data.tag_name.replace(/^v/, ""), url: data.html_url };
}

export async function checkForUpdate() {
  const currentVersion = app.getVersion();
  const { version: latestVersion, url: releaseUrl } = await fetchLatestRelease();
  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
  return { currentVersion, latestVersion, updateAvailable, releaseUrl };
}
```

- [ ] **Step 2: Verify `compareVersions` with a throwaway script**

Create `verify-update-checker.mjs` in the repo root:

```js
import { compareVersions } from "./lib/updateChecker.js";

const cases = [
  [compareVersions("1.1.0", "1.0.0"), 1],
  [compareVersions("1.0.0", "1.0.0"), 0],
  [compareVersions("1.0.0", "1.1.0"), -1],
  [compareVersions("1.0.10", "1.0.9"), 1], // numeric, not lexicographic
  [compareVersions("1.2", "1.2.0"), 0], // missing segments treated as 0
];

let failed = false;
cases.forEach(([actual, expected], i) => {
  if (actual !== expected) {
    failed = true;
    console.error(`FAIL case ${i}: got ${actual}, expected ${expected}`);
  }
});
console.log(failed ? "compareVersions: FAILED" : "compareVersions: all cases passed");
```

Run: `node verify-update-checker.mjs`
Expected output: `compareVersions: all cases passed`

Since `app.getVersion()` requires a running Electron app, `checkForUpdate()` itself gets its end-to-end verification in Task 2 (where it runs inside the real app). This step only proves the comparator.

- [ ] **Step 3: Delete the throwaway script and commit**

```bash
rm verify-update-checker.mjs
git add lib/updateChecker.js
git commit -m "feat: add version comparison and GitHub release fetch"
```

---

### Task 2: Launch-time check and IPC handlers (main process wiring)

**Files:**
- Modify: `lib/updateChecker.js` (append to the file from Task 1)
- Modify: `main.js:29-68` (add `dismissedUpdateVersion` to store defaults), `main.js:20-22` (import), `main.js:85-89` (register), `main.js:102` (trigger launch check)

**Interfaces:**
- Consumes: `getMainWindow()` from `lib/windows.js` (returns `BrowserWindow | null`, already used by `lib/settingsIpc.js`).
- Consumes: `checkForUpdate()` from Task 1 (same file).
- Produces: `initUpdateChecker({ store }): void` — fires the launch-time check, sends `updates:available` over IPC if applicable.
- Produces: `registerUpdateIpc(store: Store): void` — registers `updates:check`, `updates:dismiss`, `updates:open-releases` handlers.

- [ ] **Step 1: Add `initUpdateChecker` and `registerUpdateIpc` to `lib/updateChecker.js`**

Append to the end of `lib/updateChecker.js`:

```js
import { ipcMain, shell } from "electron";
import { getMainWindow } from "./windows.js";

export function initUpdateChecker({ store }) {
  checkForUpdate()
    .then(result => {
      log.info(
        `Update check: current=${result.currentVersion} latest=${result.latestVersion} available=${result.updateAvailable}`,
      );
      if (!result.updateAvailable) return;
      if (result.latestVersion === store.get("dismissedUpdateVersion")) return;

      // By the time this fetch resolves, js/renderer.js (a small local
      // script) has certainly already run and registered its
      // onUpdateAvailable listener — the network round-trip here takes far
      // longer than the local page's load+parse.
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("updates:available", {
          version: result.latestVersion,
          url: result.releaseUrl,
        });
      }
    })
    .catch(e => log.warn("Launch-time update check failed:", e.message));
}

export function registerUpdateIpc(store) {
  ipcMain.handle("updates:check", async () => {
    try {
      return await checkForUpdate();
    } catch (e) {
      log.error("Manual update check failed:", e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle("updates:dismiss", (_event, version) => {
    store.set("dismissedUpdateVersion", version);
  });

  ipcMain.handle("updates:open-releases", (_event, url) => {
    if (typeof url === "string" && url.startsWith("https://github.com/")) {
      shell.openExternal(url);
    }
  });
}
```

Move the two new `import` lines (`ipcMain, shell` from `"electron"` and `getMainWindow` from `"./windows.js"`) up to the top of the file, merged with the existing `import { app } from "electron";` line so there's a single `electron` import:

```js
import { app, ipcMain, shell } from "electron";

import { createLogger } from "./logger.js";
import { getMainWindow } from "./windows.js";
```

- [ ] **Step 2: Add `dismissedUpdateVersion` to the store defaults in `main.js`**

In `main.js`, find:

```js
    activePresetId: "default-pomodoro",
    language: "en",
  },
});
```

Replace with:

```js
    activePresetId: "default-pomodoro",
    language: "en",
    dismissedUpdateVersion: null,
  },
});
```

- [ ] **Step 3: Import and wire the new module in `main.js`**

Find:

```js
import { registerPresetsIpc } from "./lib/presetsIpc.js";
import { registerSettingsIpc } from "./lib/settingsIpc.js";
import { initSpotifyAuth, registerSpotifyIpc } from "./lib/spotifyAuth.js";
```

Replace with:

```js
import { registerPresetsIpc } from "./lib/presetsIpc.js";
import { registerSettingsIpc } from "./lib/settingsIpc.js";
import { initSpotifyAuth, registerSpotifyIpc } from "./lib/spotifyAuth.js";
import { initUpdateChecker, registerUpdateIpc } from "./lib/updateChecker.js";
```

Find:

```js
registerLocalServerIpc();
registerWindowIpc();
registerPresetsIpc(store);
registerSettingsIpc(store);
registerSpotifyIpc();
```

Replace with:

```js
registerLocalServerIpc();
registerWindowIpc();
registerPresetsIpc(store);
registerSettingsIpc(store);
registerSpotifyIpc();
registerUpdateIpc(store);
```

Find:

```js
    await createWindow(); // ← await eklendi
    createTray();
```

Replace with:

```js
    await createWindow(); // ← await eklendi
    initUpdateChecker({ store });
    createTray();
```

- [ ] **Step 4: Verify end-to-end against the real GitHub API**

Run: `npm start`

In the terminal running the app, confirm a log line appears within a few seconds of launch:

```
[update-checker] Update check: current=1.0.0 latest=1.0.0 available=false
```

(`available=false` is expected and correct right now — v1.0.0 is both the installed and the latest published version. This step is proving the mechanism runs and reaches GitHub, not that a banner appears; that's Task 4.)

Close the app.

- [ ] **Step 5: Commit**

```bash
git add lib/updateChecker.js main.js
git commit -m "feat: wire launch-time update check and updates:* IPC handlers"
```

---

### Task 3: preload.cjs bridge

**Files:**
- Modify: `preload.cjs:36-42`

**Interfaces:**
- Produces (renderer-facing, via `window.electronAPI`): `updatesCheck(): Promise<{currentVersion, latestVersion, updateAvailable, releaseUrl} | {error: string}>`, `updatesDismiss(version: string): Promise<void>`, `updatesOpenReleases(url: string): Promise<void>`, `onUpdateAvailable(cb: (info: {version: string, url: string}) => void): void`.

- [ ] **Step 1: Add the four bridge entries**

Find:

```js
  // Language
  languageGet: () => ipcRenderer.invoke("settings:get-language"),
  languageSet: lang => ipcRenderer.invoke("settings:set-language", lang),
  onLanguageChanged: cb =>
    ipcRenderer.on("language-changed", (_e, lang) => cb(lang)),
});
```

Replace with:

```js
  // Language
  languageGet: () => ipcRenderer.invoke("settings:get-language"),
  languageSet: lang => ipcRenderer.invoke("settings:set-language", lang),
  onLanguageChanged: cb =>
    ipcRenderer.on("language-changed", (_e, lang) => cb(lang)),

  // Updates
  updatesCheck: () => ipcRenderer.invoke("updates:check"),
  updatesDismiss: version => ipcRenderer.invoke("updates:dismiss", version),
  updatesOpenReleases: url => ipcRenderer.invoke("updates:open-releases", url),
  onUpdateAvailable: cb =>
    ipcRenderer.on("updates:available", (_e, info) => cb(info)),
});
```

- [ ] **Step 2: Verify via devtools**

Run: `npm start`, open devtools in the main window (Ctrl+Shift+I), and in the console run:

```js
await window.electronAPI.updatesCheck()
```

Expected: a resolved object shaped like `{currentVersion: "1.0.0", latestVersion: "1.0.0", updateAvailable: false, releaseUrl: "https://github.com/psymore/interval-timer/releases/tag/v1.0.0"}`.

Close the app.

- [ ] **Step 3: Commit**

```bash
git add preload.cjs
git commit -m "feat: expose updates:* IPC bridge to the renderer"
```

---

### Task 4: Launch-time banner in the renderer

**Files:**
- Create: `js/updates.js`
- Modify: `index.html:53-55` (banner mount point)
- Modify: `js/renderer.js:1-9` (import + init call)
- Modify: `css/styles.css` (append banner styles)
- Modify: `js/i18n/translations.js:127-128` and `:254-255` (new keys, en + tr)

**Interfaces:**
- Consumes: `window.electronAPI.onUpdateAvailable`, `.updatesOpenReleases`, `.updatesDismiss` (Task 3).
- Consumes: `t(key)`, `format(str, vars)`, `onLanguageChange(cb)` from `js/i18n/i18n.js` (existing).
- Produces: `setupUpdateChecker(): void`, exported from `js/updates.js` — called once from `js/renderer.js`. (Task 5 extends this same function; don't consider its shape final until Task 5.)

- [ ] **Step 1: Add the banner mount point to `index.html`**

Find:

```html
        </div>
    </div>

    <div id="app"></div>
```

Replace with:

```html
        </div>
    </div>

    <div id="updateBanner" class="update-banner hidden" role="status" aria-live="polite"></div>

    <div id="app"></div>
```

- [ ] **Step 2: Add the new i18n keys**

In `js/i18n/translations.js`, find (inside the `en` block):

```js
    "confirm.quitRunning": "A timer is currently running. Quit anyway?",
  },
```

Replace with:

```js
    "confirm.quitRunning": "A timer is currently running. Quit anyway?",
    "updates.banner.message": "A new version is available ({version})",
    "updates.banner.download": "Download",
    "updates.banner.dismiss.ariaLabel": "Dismiss update notification",
  },
```

Find (inside the `tr` block):

```js
    "confirm.quitRunning": "Şu anda bir sayaç çalışıyor. Yine de çıkılsın mı?",
```

Replace with:

```js
    "confirm.quitRunning": "Şu anda bir sayaç çalışıyor. Yine de çıkılsın mı?",
    "updates.banner.message": "Yeni bir sürüm mevcut ({version})",
    "updates.banner.download": "İndir",
    "updates.banner.dismiss.ariaLabel": "Güncelleme bildirimini kapat",
```

- [ ] **Step 3: Create `js/updates.js`**

```js
import { t, format, onLanguageChange } from "./i18n/i18n.js";

let currentUpdate = null;

function renderBanner() {
  const banner = document.getElementById("updateBanner");
  if (!banner) return;

  if (!currentUpdate) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  banner.classList.remove("hidden");
  banner.innerHTML = `
    <span class="update-banner__text">${format(t("updates.banner.message"), { version: currentUpdate.version })}</span>
    <button type="button" class="update-banner__download">${t("updates.banner.download")}</button>
    <button type="button" class="update-banner__dismiss" aria-label="${t("updates.banner.dismiss.ariaLabel")}">&times;</button>
  `;

  banner.querySelector(".update-banner__download").addEventListener("click", () => {
    window.electronAPI.updatesOpenReleases(currentUpdate.url);
  });

  banner.querySelector(".update-banner__dismiss").addEventListener("click", () => {
    window.electronAPI.updatesDismiss(currentUpdate.version);
    currentUpdate = null;
    renderBanner();
  });
}

export function setupUpdateChecker() {
  window.electronAPI.onUpdateAvailable(info => {
    currentUpdate = info;
    renderBanner();
  });
  onLanguageChange(renderBanner);
}
```

- [ ] **Step 4: Wire it into `js/renderer.js`**

Find:

```js
import { setupTabListeners, switchTab } from "./tabs.js";
import { enhanceNumberInputs } from "./numberStepper.js";
import { initLanguage, setLanguage, getLanguage, t, onLanguageChange } from "./i18n/i18n.js";
```

Replace with:

```js
import { setupTabListeners, switchTab } from "./tabs.js";
import { enhanceNumberInputs } from "./numberStepper.js";
import { initLanguage, setLanguage, getLanguage, t, onLanguageChange } from "./i18n/i18n.js";
import { setupUpdateChecker } from "./updates.js";
```

Find:

```js
// ── Language ───────────────────────────────────────────────────
const languageBtn = document.getElementById("languageBtn");
```

Replace with:

```js
// ── Updates ────────────────────────────────────────────────────
setupUpdateChecker();

// ── Language ───────────────────────────────────────────────────
const languageBtn = document.getElementById("languageBtn");
```

- [ ] **Step 5: Add banner styles to `css/styles.css`**

Append to the end of the file:

```css
/* ── Update banner ───────────────────────────────────────────── */
.update-banner {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  z-index: var(--z-toast);
}

.update-banner.hidden {
  display: none;
}

.update-banner__text {
  flex: 1;
  min-width: 0;
}

.update-banner__download {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
  min-width: auto;
  padding: var(--sp-1) var(--sp-4);
}

.update-banner__download:hover:not(:disabled) {
  background-color: var(--accent);
  color: #111;
}

.update-banner__dismiss {
  min-width: auto;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
  border-color: transparent;
}

.update-banner__dismiss:hover:not(:disabled) {
  background-color: var(--danger-dim);
  border-color: var(--danger);
  color: var(--danger);
}
```

- [ ] **Step 6: Verify the banner appears, and that dismissal persists**

Temporarily edit `package.json`'s `"version"` field from `"1.0.0"` to `"0.0.1"`.

Run: `npm start`

Expected: within a few seconds, a banner appears above the app reading "A new version is available (1.0.0)" with a "Download" button and a "×" button.

Click "×". Expected: the banner disappears immediately.

Close and restart the app (`npm start` again). Expected: the banner does **not** reappear (dismissal persisted to `electron-store`).

Revert `package.json`'s `"version"` back to `"1.0.0"`.

- [ ] **Step 7: Commit**

```bash
git add js/updates.js index.html js/renderer.js css/styles.css js/i18n/translations.js
git commit -m "feat: show a dismissible in-app banner when a new version ships"
```

---

### Task 5: Manual "Check for updates" button in settings

**Files:**
- Modify: `index.html:76-77` (new settings-group)
- Modify: `js/updates.js` (extend `setupUpdateChecker`)
- Modify: `css/styles.css` (append settings-row styles)
- Modify: `js/i18n/translations.js` (new keys, en + tr)

**Interfaces:**
- Consumes: `window.electronAPI.updatesCheck()` (Task 3).
- No new exports — this task completes `setupUpdateChecker()` from Task 4.

- [ ] **Step 1: Add the settings-modal row to `index.html`**

Find:

```html
            <div id="intervalSettings" class="settings-group hidden">
                <label for="workAlarmLength">
                    <span data-i18n="settings.workAlarmLength">Work Alarm (seconds)</span>
                    <input type="number" id="workAlarmLength" min="1" value="5" />
                </label>
                <label for="breakAlarmLength">
                    <span data-i18n="settings.breakAlarmLength">Break Alarm (seconds)</span>
                    <input type="number" id="breakAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div class="button-group">
```

Replace with:

```html
            <div id="intervalSettings" class="settings-group hidden">
                <label for="workAlarmLength">
                    <span data-i18n="settings.workAlarmLength">Work Alarm (seconds)</span>
                    <input type="number" id="workAlarmLength" min="1" value="5" />
                </label>
                <label for="breakAlarmLength">
                    <span data-i18n="settings.breakAlarmLength">Break Alarm (seconds)</span>
                    <input type="number" id="breakAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div class="settings-group update-check-row">
                <span data-i18n="settings.updates.label">Updates</span>
                <button type="button" id="checkUpdatesBtn" data-i18n="settings.updates.checkBtn">Check for updates</button>
            </div>
            <p id="updateCheckStatus" class="update-check-status" aria-live="polite"></p>
            <div class="button-group">
```

- [ ] **Step 2: Add the new i18n keys**

In `js/i18n/translations.js`, find (inside the `en` block, the lines added in Task 4):

```js
    "updates.banner.message": "A new version is available ({version})",
    "updates.banner.download": "Download",
    "updates.banner.dismiss.ariaLabel": "Dismiss update notification",
  },
```

Replace with:

```js
    "updates.banner.message": "A new version is available ({version})",
    "updates.banner.download": "Download",
    "updates.banner.dismiss.ariaLabel": "Dismiss update notification",
    "settings.updates.label": "Updates",
    "settings.updates.checkBtn": "Check for updates",
    "settings.updates.upToDate": "You're up to date ({version})",
    "settings.updates.error": "Couldn't check for updates",
  },
```

Find (inside the `tr` block):

```js
    "updates.banner.message": "Yeni bir sürüm mevcut ({version})",
    "updates.banner.download": "İndir",
    "updates.banner.dismiss.ariaLabel": "Güncelleme bildirimini kapat",
```

Replace with:

```js
    "updates.banner.message": "Yeni bir sürüm mevcut ({version})",
    "updates.banner.download": "İndir",
    "updates.banner.dismiss.ariaLabel": "Güncelleme bildirimini kapat",
    "settings.updates.label": "Güncellemeler",
    "settings.updates.checkBtn": "Güncellemeleri kontrol et",
    "settings.updates.upToDate": "Güncelsiniz ({version})",
    "settings.updates.error": "Güncellemeler kontrol edilemedi",
```

- [ ] **Step 3: Extend `setupUpdateChecker()` in `js/updates.js`**

Find:

```js
export function setupUpdateChecker() {
  window.electronAPI.onUpdateAvailable(info => {
    currentUpdate = info;
    renderBanner();
  });
  onLanguageChange(renderBanner);
}
```

Replace with:

```js
export function setupUpdateChecker() {
  window.electronAPI.onUpdateAvailable(info => {
    currentUpdate = info;
    renderBanner();
  });
  onLanguageChange(renderBanner);

  const checkBtn = document.getElementById("checkUpdatesBtn");
  const statusEl = document.getElementById("updateCheckStatus");
  if (!checkBtn || !statusEl) return;

  checkBtn.addEventListener("click", async () => {
    checkBtn.disabled = true;
    statusEl.textContent = "";

    const result = await window.electronAPI.updatesCheck();

    checkBtn.disabled = false;

    if (result.error) {
      statusEl.textContent = t("settings.updates.error");
      return;
    }

    if (result.updateAvailable) {
      currentUpdate = { version: result.latestVersion, url: result.releaseUrl };
      renderBanner();
      statusEl.textContent = "";
    } else {
      statusEl.textContent = format(t("settings.updates.upToDate"), {
        version: result.currentVersion,
      });
    }
  });
}
```

- [ ] **Step 4: Add settings-row styles to `css/styles.css`**

Append to the end of the file:

```css
/* ── Update check row (settings modal) ──────────────────────── */
.update-check-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--ink-muted);
}

.update-check-row button {
  min-width: auto;
}

.update-check-status {
  margin: calc(-1 * var(--sp-2)) 0 0;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  min-height: 1em;
}
```

- [ ] **Step 5: Verify both the success and failure paths, including the silent launch-time failure**

Run: `npm start`, open Settings.

Click "Check for updates" while online. Expected: status text reads "You're up to date (1.0.0)" (since the installed version matches the real latest release).

Close the app. Disconnect the network (turn off Wi-Fi or unplug ethernet). Run `npm start` again. Expected: the app launches normally, no banner appears, no crash, and the terminal shows the `Launch-time update check failed:` warning from Task 2 — the failure stays invisible to the user.

With the network still off, open Settings and click "Check for updates". Expected: status text reads "Couldn't check for updates", and the button re-enables (isn't stuck in a disabled/loading state) — a failure the user triggered on purpose is surfaced, unlike the silent launch-time one.

Reconnect the network. Close the app.

- [ ] **Step 6: Commit**

```bash
git add index.html js/updates.js css/styles.css js/i18n/translations.js
git commit -m "feat: add manual check-for-updates button to settings"
```
