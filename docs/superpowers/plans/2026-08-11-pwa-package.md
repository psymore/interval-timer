# PWA Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/pwa` — a real, persistent, installable PWA build of Interval Timer, deployed to `docs/pwa/` alongside the untouched landing page and demo. **Prerequisite: `docs/superpowers/plans/2026-08-11-pwa-monorepo-restructure.md` must be complete** — this plan assumes `packages/core` and `packages/electron` already exist in their final form.

**Architecture:** `packages/pwa` contains only what's genuinely PWA-specific — `manifest.json`, `service-worker.js`, and a `platform/` directory with the real `window.electronAPI` implementation (localStorage-backed presets/language) plus IndexedDB-backed local alarm file storage. `packages/core`'s existing three-way runtime platform detection (`js/demo/loader.js`) gains its third branch. The one piece of genuine new shared logic is `js/alarm/localSourceAdapter.js` (new, in `packages/core`) — a strategy seam for "local file" alarm sources, needed because *two* places currently assume a real filesystem path (`js/alarmModal.js`'s UI flow, and `js/alarm/AlarmManager.js#initialize()`'s startup/preset-switch path), not just the one the design spec initially called out.

**Tech Stack:** No new runtime dependencies — plain IndexedDB (no `idb-keyval`), plain Service Worker API, plain Web Manifest.

## Global Constraints

- No new npm dependencies, no bundler, no build step for `packages/pwa` itself — it's copied into `docs/pwa/` as-is by `packages/pwa/scripts/build.mjs`, same pattern as `docs/app`.
- Spotify is out of scope for this v1 PWA (explicit decision — see the design spec). The PWA hides the Spotify section in the Alarm Sound modal rather than exposing a login flow that can't work (no main process to hold the client secret, no way to catch the OAuth loopback redirect).
- `packages/pwa/platform/electronAPI-web.js` must be a **classic script, not an ES module** — it has to run and set `window.electronAPI` before any `type="module"` script touches it (module scripts are always deferred until after parsing; a classic script inserted via `document.write` during parsing is what guarantees that ordering). This is exactly why `js/demo/electron-demo-shim.js` is a classic script too — don't "clean it up" into a module.
- `js/alarm/localSourceAdapter.js` (in `packages/core`, shared) must stay platform-agnostic itself — it never imports `packages/pwa`'s strategy statically (that would break `packages/core`'s standalone deployability to Electron/the demo, neither of which ever has a `platform/` directory). It loads the PWA strategy via a **root-relative dynamic `import()`**, guarded by checking `window.electronAPI?.__platform === "pwa"` first, so the import is never attempted outside the one deployment where `platform/localBlobStrategy.js` actually exists.
- Local alarm blobs in IndexedDB are keyed by **filename**, not a generated id — this isn't just convenience, it's what lets every existing `getFileName(value)` call site in `js/alarmModal.js` keep working unchanged for both platforms (a bare filename is already its own "file name"; re-uploading a same-named file intentionally overwrites the old blob, which is the expected behavior, not a bug).
- This repo has no test runner — verification is manual throughout, same as the restructure plan.

---

### Task 1: `packages/pwa` skeleton

**Files:**
- Create: `packages/pwa/package.json`
- Modify: `package.json` (root) — add `sync:pwa` script

- [ ] **Step 1: Create the package**

```bash
mkdir -p packages/pwa
```

```json
{
  "name": "@interval-timer/pwa",
  "version": "1.1.0",
  "private": true,
  "description": "Installable PWA build of Interval Timer."
}
```

- [ ] **Step 2: Add the root `sync:pwa` script**

In the root `package.json`'s `scripts` block, add (alongside the existing `sync:demo`):

```json
    "sync:pwa": "node packages/pwa/scripts/build.mjs"
```

(`packages/pwa/scripts/build.mjs` doesn't exist yet — written in Task 9. Don't run this script until then.)

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/package.json package.json
git commit -m "feat: add packages/pwa skeleton"
```

---

### Task 2: `js/alarm/localSourceAdapter.js` + `AlarmManager.js` integration

**Files:**
- Create: `packages/core/js/alarm/localSourceAdapter.js`
- Modify: `packages/core/js/alarm/AlarmManager.js`

**Interfaces:**
- Produces: `pickLocalSource(): Promise<string|null>`, `localSourceFromDroppedFile(file: File): Promise<string|null>`, `registerExistingLocalSource(value: string): Promise<boolean>`, `getPlayableUrl(value: string): Promise<string>`, `localSourceExists(value: string): Promise<boolean>` — all exported from `localSourceAdapter.js`. `value` is a filesystem path on Electron, a bare filename on the PWA; callers never need to know which.

- [ ] **Step 1: Write `localSourceAdapter.js`**

```js
// Strategy seam for "local file" alarm sources. Electron resolves a real
// filesystem path through the native file dialog and serves it via the
// local HTTP server's /local-audio/ route; the PWA has no filesystem
// access and instead stores the picked File as a Blob (keyed by filename)
// in IndexedDB, played back via an object URL. AlarmManager.initialize()
// (on every app launch/preset switch) and js/alarmModal.js (on every new
// user selection) both go through this one seam instead of branching on
// platform themselves.
//
// The PWA strategy lives in packages/pwa/platform/localBlobStrategy.js,
// deployed alongside this file as docs/pwa/platform/localBlobStrategy.js.
// It's loaded here via a root-relative dynamic import — never a static
// one — specifically so this file (and packages/core as a whole) stays
// deployable standalone to targets that never have a platform/ directory
// at all (real Electron, the ?demo=1 preview).

const electronStrategy = {
  async pick() {
    return window.electronAPI.getFilePath();
  },
  async fromDroppedFile(file) {
    return window.electronAPI.getPathForFile(file);
  },
  async registerExisting(value) {
    const result = await window.electronAPI.alarmUseLocalPath(value);
    return !result?.error;
  },
  async getPlayableUrl(value) {
    return `${window.location.origin}/local-audio/${encodeURIComponent(value)}`;
  },
  async exists(value) {
    const [ok] = await window.electronAPI.alarmCheckPathsExist([value]);
    return ok;
  },
};

let strategyPromise = null;

async function resolveStrategy() {
  if (window.electronAPI?.__platform === "pwa") {
    const { pwaLocalSourceStrategy } = await import("/platform/localBlobStrategy.js");
    return pwaLocalSourceStrategy;
  }
  return electronStrategy;
}

function getStrategy() {
  if (!strategyPromise) strategyPromise = resolveStrategy();
  return strategyPromise;
}

export async function pickLocalSource() {
  return (await getStrategy()).pick();
}

export async function localSourceFromDroppedFile(file) {
  return (await getStrategy()).fromDroppedFile(file);
}

export async function registerExistingLocalSource(value) {
  return (await getStrategy()).registerExisting(value);
}

export async function getPlayableUrl(value) {
  return (await getStrategy()).getPlayableUrl(value);
}

export async function localSourceExists(value) {
  return (await getStrategy()).exists(value);
}
```

- [ ] **Step 2: Wire it into `AlarmManager.js`**

Add the import (`packages/core/js/alarm/AlarmManager.js`, right after the existing two imports):

```js
import { AlarmProviderFactory } from "./AlarmProviderFactory.js";
import { createLogger } from "../../lib/logger.js";
import { getPlayableUrl } from "./localSourceAdapter.js";
```

Replace the local-source branch inside `initialize()`:

```js
    if (detectedType === "local") {
      // Sadece local dosyalar için file:// dönüşümü yap
      sourceToLoad = this._toFileUrl(savedSource);
    }
```

with:

```js
    if (detectedType === "local") {
      // Sadece local dosyalar için playable URL'e dönüştür
      sourceToLoad = await getPlayableUrl(savedSource);
    }
```

Delete the now-unused `_toFileUrl` method and its preceding comment entirely:

```js
  // Renderer http:// origin'inden yüklendiği için file:// kaynaklar artık
  // çalışmıyor — main.js'in /local-audio/ route'u üzerinden aynı origin'den
  // servis ediyoruz (bkz. alarmModal.js toFileUrl).
  _toFileUrl(filePath) {
    return `${window.location.origin}/local-audio/${encodeURIComponent(filePath)}`;
  }
```

- [ ] **Step 3: Verify syntax**

```bash
node --check packages/core/js/alarm/localSourceAdapter.js
node --check packages/core/js/alarm/AlarmManager.js
```

Expected: no output from either.

- [ ] **Step 4: Commit**

```bash
git add packages/core/js/alarm/localSourceAdapter.js packages/core/js/alarm/AlarmManager.js
git commit -m "$(cat <<'EOF'
feat: add localSourceAdapter strategy seam for local alarm files

AlarmManager.initialize() resolves a saved local alarm source's
playable URL through this seam now instead of an inline
Electron-only path-to-URL conversion — needed so the PWA (no
filesystem access) can supply its own blob-backed strategy without
AlarmManager needing to know which platform it's running on.
EOF
)"
```

---

### Task 3: `packages/pwa/platform/blobStore.js` + `localBlobStrategy.js`

**Files:**
- Create: `packages/pwa/platform/blobStore.js`
- Create: `packages/pwa/platform/localBlobStrategy.js`

**Interfaces:**
- Produces: `putBlob(key: string, blob: Blob): Promise<void>`, `getBlob(key: string): Promise<Blob|null>` from `blobStore.js`. `pwaLocalSourceStrategy` object from `localBlobStrategy.js`, matching the strategy shape `localSourceAdapter.js` (Task 2) expects: `{ pick, fromDroppedFile, registerExisting, getPlayableUrl, exists }`.

- [ ] **Step 1: Write `blobStore.js`**

```js
// Small IndexedDB wrapper for the PWA's uploaded local alarm files — not a
// general-purpose library, just enough to store/fetch a Blob by filename
// (no filesystem access exists in a browser tab, unlike Electron's native
// file dialog + local HTTP server route). Keyed by filename rather than a
// generated id so js/alarmModal.js's existing getFileName()-based display
// logic works unchanged for both platforms — re-uploading a file with the
// same name overwrites the previous blob, which is the expected/desired
// behavior here, not a bug.
const DB_NAME = "interval-timer-pwa";
const DB_VERSION = 1;
const STORE_NAME = "alarmBlobs";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putBlob(key, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 2: Write `localBlobStrategy.js`**

```js
// The PWA's implementation of js/alarm/localSourceAdapter.js's strategy
// interface — see that file for the contract and why it exists.
import { putBlob, getBlob } from "./blobStore.js";

async function storeFile(file) {
  await putBlob(file.name, file);
  return file.name;
}

export const pwaLocalSourceStrategy = {
  async pick() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*,.mp3,.wav,.ogg";
      input.addEventListener(
        "change",
        async () => {
          const file = input.files?.[0];
          resolve(file ? await storeFile(file) : null);
        },
        { once: true },
      );
      input.click();
    });
  },
  async fromDroppedFile(file) {
    return storeFile(file);
  },
  async registerExisting(value) {
    return Boolean(await getBlob(value));
  },
  async getPlayableUrl(value) {
    const blob = await getBlob(value);
    if (!blob) throw new Error(`Local alarm file not found: ${value}`);
    return URL.createObjectURL(blob);
  },
  async exists(value) {
    return Boolean(await getBlob(value));
  },
};
```

(Extension filtering — `.mp3`/`.wav`/`.ogg` — deliberately isn't done here; it's added once in `js/alarmModal.js` in Task 5 so both platforms share exactly one place that decides "unsupported file type" and shows the same feedback message.)

- [ ] **Step 3: Verify syntax**

```bash
node --check packages/pwa/platform/blobStore.js
node --check packages/pwa/platform/localBlobStrategy.js
```

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/platform/blobStore.js packages/pwa/platform/localBlobStrategy.js
git commit -m "feat: add IndexedDB-backed local alarm file storage for the PWA"
```

---

### Task 4: `packages/pwa/platform/electronAPI-web.js`

**Files:**
- Create: `packages/pwa/platform/electronAPI-web.js`

**Interfaces:**
- Consumes: nothing (classic script, no imports — see Global Constraints on why).
- Produces: `window.electronAPI` with `__platform: "pwa"` set, full contract surface matching `js/demo/electron-demo-shim.js`'s method list but backed by real `localStorage` persistence for presets/language.

- [ ] **Step 1: Write the file**

```js
// Only ever loaded when js/demo/loader.js finds neither a real
// preload.cjs (Electron) nor ?demo=1 (the GitHub Pages demo) — i.e. only
// in the deployed PWA (docs/pwa/). Classic (non-module) script, same as
// js/demo/electron-demo-shim.js and for the same reason: it must run and
// set window.electronAPI before any type="module" script (renderer.js,
// alarmModal.js) touches it, and module scripts are always deferred until
// after parsing — a classic script inserted via document.write during
// parsing is what guarantees that ordering.
//
// Real (persistent) implementation of the window.electronAPI contract:
// presets/language persist to localStorage. Local alarm file uploads are
// handled separately by js/alarm/localSourceAdapter.js, which checks the
// __platform marker set below and dynamically loads
// platform/localBlobStrategy.js — this file doesn't need to know about
// that. Native-window chrome (mini/tray/quit/updates) and Spotify stay as
// no-ops/rejections, matching electron-demo-shim.js's shapes.
(function () {
  const STORAGE_KEY = "interval-timer-pwa-state";
  const MAX_PRESETS = 20;

  const DEFAULT_STATE = {
    presets: [
      {
        id: "default-pomodoro",
        name: "Pomodoro",
        workMinutes: 25,
        workSeconds: 0,
        breakMinutes: 5,
        breakSeconds: 0,
        loops: 4,
        isDefault: true,
      },
      {
        id: "default-short",
        name: "Short Focus",
        workMinutes: 15,
        workSeconds: 0,
        breakMinutes: 3,
        breakSeconds: 0,
        loops: 6,
        isDefault: false,
      },
      {
        id: "default-long",
        name: "Deep Work",
        workMinutes: 50,
        workSeconds: 0,
        breakMinutes: 10,
        breakSeconds: 0,
        loops: 2,
        isDefault: false,
      },
    ],
    activePresetId: "default-pomodoro",
    language: "en",
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const parsed = JSON.parse(raw);
      return {
        presets: Array.isArray(parsed.presets) ? parsed.presets : DEFAULT_STATE.presets,
        activePresetId: parsed.activePresetId ?? DEFAULT_STATE.activePresetId,
        language: parsed.language ?? DEFAULT_STATE.language,
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const SPOTIFY_UNAVAILABLE_ERROR =
    "Spotify isn't available in the web app yet — use the desktop app, or a local/YouTube alarm here.";

  window.electronAPI = {
    __platform: "pwa",

    presetsGetAll: async () => state.presets.map(p => ({ ...p })),
    presetsGetActive: async () =>
      state.presets.find(p => p.id === state.activePresetId) ?? state.presets[0] ?? null,
    presetsSave: async preset => {
      const index = state.presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
        state.presets[index] = preset;
      } else {
        if (state.presets.length >= MAX_PRESETS) {
          return { error: `Maximum ${MAX_PRESETS} presets allowed.` };
        }
        state.presets.push(preset);
      }
      saveState();
      return { presets: state.presets.map(p => ({ ...p })) };
    },
    presetsDelete: async id => {
      state.presets = state.presets.filter(p => p.id !== id);
      if (state.activePresetId === id) {
        state.activePresetId = state.presets[0]?.id ?? null;
      }
      saveState();
      return { presets: state.presets.map(p => ({ ...p })) };
    },
    presetsSetActive: async id => {
      state.activePresetId = id;
      saveState();
      return { id };
    },

    sendTimerState: () => {},

    isWindowsStoreBuild: false,
    onUpdateAvailable: () => {},
    updatesCheck: async () => ({
      currentVersion: "0.0.0-pwa",
      latestVersion: "0.0.0-pwa",
      updateAvailable: false,
      releaseUrl: "",
    }),
    updatesDismiss: () => {},
    updatesOpenReleases: () => {},

    languageGet: async () => state.language,
    languageSet: async lang => {
      state.language = lang;
      saveState();
    },
    onLanguageChanged: () => {},

    setAlwaysOnTop: () => {},
    quitApp: () => {},
    onMiniAction: () => {},
    onMiniReady: () => {},
    onMiniClosed: () => {},

    // Real support lives in js/alarm/localSourceAdapter.js's PWA strategy
    // (platform/localBlobStrategy.js) — these stay as safe fallbacks in
    // case anything reaches them directly instead of through the adapter,
    // same defense-in-depth precedent as the demo shim.
    alarmCheckPathsExist: async paths => paths.map(() => false),
    alarmUseLocalPath: async () => ({ error: "Not available in the web app." }),
    getFilePath: async () => null,
    getPathForFile: () => null,

    spotifyGetTokens: async () => null,
    spotifyLogin: async () => {
      throw new Error(SPOTIFY_UNAVAILABLE_ERROR);
    },
    spotifyRefresh: async () => {
      throw new Error(SPOTIFY_UNAVAILABLE_ERROR);
    },
    spotifySaveTokens: async () => {},
    spotifyClearTokens: async () => {},
    spotifyOpenTrack: async () => {},
  };
})();
```

- [ ] **Step 2: Verify syntax**

```bash
node --check packages/pwa/platform/electronAPI-web.js
```

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/platform/electronAPI-web.js
git commit -m "feat: add the PWA's real (persistent) window.electronAPI implementation"
```

---

### Task 5: `js/alarmModal.js` integration

**Files:**
- Modify: `packages/core/js/alarmModal.js`
- Modify: `packages/core/js/intervalTimer.js` (remove a now-dead import)
- Create: `packages/core/js/demo/isPwaMode.js`

**Interfaces:**
- Consumes: `pickLocalSource`, `localSourceFromDroppedFile`, `registerExistingLocalSource`, `getPlayableUrl`, `localSourceExists` from Task 2's `./alarm/localSourceAdapter.js`.
- Produces: `isPwaMode(): boolean` from `isPwaMode.js`.

- [ ] **Step 1: Write `js/demo/isPwaMode.js`**

```js
export function isPwaMode() {
  return window.electronAPI?.__platform === "pwa";
}
```

- [ ] **Step 2: Remove the dead `toFileUrl` import from `intervalTimer.js`**

`packages/core/js/intervalTimer.js` imports `toFileUrl` from `./alarmModal.js` but never actually calls it (confirmed by grep — it's dead code left over from an earlier refactor). Delete the line:

```js
import { toFileUrl } from "./alarmModal.js";
```

(This must happen in the same commit as Step 3 below, which removes `toFileUrl`'s export from `alarmModal.js` — leaving this import in place after that would break the whole renderer's module graph at load time.)

- [ ] **Step 3: Update `alarmModal.js`'s imports**

Replace:

```js
import { createLogger } from "../lib/logger.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";
import { isDemoMode } from "./demo/isDemoMode.js";
```

with:

```js
import { createLogger } from "../lib/logger.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";
import { isDemoMode } from "./demo/isDemoMode.js";
import { isPwaMode } from "./demo/isPwaMode.js";
import {
  pickLocalSource,
  localSourceFromDroppedFile,
  registerExistingLocalSource,
  getPlayableUrl,
  localSourceExists,
} from "./alarm/localSourceAdapter.js";
```

- [ ] **Step 4: Remove the `toFileUrl` export**

Delete this whole block (the `SUPPORTED_LOCAL_EXTENSIONS` constant right below it stays — it's still used by the drop handler in Step 8):

```js
// ── Path helpers ──────────────────────────────────────────────
// Renderer http:// origin'inden yüklendiği için file:// kaynaklar artık
// çalışmıyor (bkz. main.js handleLocalAudioRequest) — bunun yerine local
// server'ın /local-audio/ route'u üzerinden aynı origin'den servis ediyoruz.
export function toFileUrl(filePath) {
  return `${window.location.origin}/local-audio/${encodeURIComponent(filePath)}`;
}
```

- [ ] **Step 5: Add the PWA Spotify-hiding block**

Right after the existing `isDemoMode()` block inside the `DOMContentLoaded` handler (the one that hides the local-file section and adds the demo hint), add its mirror:

```js
  if (isPwaMode()) {
    document
      .querySelector('.alarm-section[data-section="spotify"]')
      ?.classList.add("hidden");
  }
```

- [ ] **Step 6: Update `updateAlarmHealthBadge`'s local-file check**

Replace:

```js
    let broken = false;
    if (alarmSource.type === "local") {
      const [exists] = await window.electronAPI.alarmCheckPathsExist([
        alarmSource.value,
      ]);
      broken = !exists;
    } else if (alarmSource.type === "youtube") {
```

with:

```js
    let broken = false;
    if (alarmSource.type === "local") {
      broken = !(await localSourceExists(alarmSource.value));
    } else if (alarmSource.type === "youtube") {
```

- [ ] **Step 7: Update `applyLocalFile`**

Replace the whole function:

```js
  async function applyLocalFile(filePath) {
    const result = await window.electronAPI.alarmUseLocalPath(filePath);
    if (result?.error) {
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
      return false;
    }

    const url = toFileUrl(filePath);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", filePath);
    const savedPreset = await saveActivePreset({
      alarmSource: { type: "local", value: filePath },
    });
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
    window.dispatchEvent(new CustomEvent("preset-data-changed"));

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
    return true;
  }
```

with:

```js
  async function applyLocalFile(value) {
    const ok = await registerExistingLocalSource(value);
    if (!ok) {
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
      return false;
    }

    const url = await getPlayableUrl(value);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", value);
    const savedPreset = await saveActivePreset({
      alarmSource: { type: "local", value },
    });
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
    window.dispatchEvent(new CustomEvent("preset-data-changed"));

    recentPaths = addRecentPath(recentPaths, value);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(value));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
    return true;
  }
```

(`getFileName(value)` needs no changes — for Electron `value` is a full path and `getFileName` strips it down as before; for the PWA `value` is already a bare filename, so `getFileName` is a harmless identity pass-through.)

- [ ] **Step 8: Update `renderRecentList`'s existence check**

Replace:

```js
    const existsResults =
      await window.electronAPI.alarmCheckPathsExist(recentPaths);
```

with:

```js
    const existsResults = await Promise.all(
      recentPaths.map(p => localSourceExists(p)),
    );
```

- [ ] **Step 9: Update the `chooseAlarmBtn` handler**

Replace:

```js
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        showFeedback(t("alarm.feedback.noFileSelected"), "error");
        return;
      }

      const applied = await applyLocalFile(filePath);
      if (applied) {
        showFeedback(
          format(t("alarm.feedback.fileLoaded"), {
            name: getFileName(filePath),
          }),
          "success",
        );
      }
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
    }
  });
```

with:

```js
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const value = await pickLocalSource();
      if (!value) {
        showFeedback(t("alarm.feedback.noFileSelected"), "error");
        return;
      }

      const ext = "." + (value.split(".").pop() || "").toLowerCase();
      if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
        showFeedback(t("alarm.feedback.unsupportedFile"), "error");
        return;
      }

      const applied = await applyLocalFile(value);
      if (applied) {
        showFeedback(
          format(t("alarm.feedback.fileLoaded"), {
            name: getFileName(value),
          }),
          "success",
        );
      }
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
    }
  });
```

(The extension check is new here — on Electron the native dialog's own filter already restricts selection, so this is redundant-but-harmless there; on the PWA the `<input accept>` hint isn't reliably enforced by every browser, so this is where it actually matters. One check, both platforms.)

- [ ] **Step 10: Update the drop handler**

Replace:

```js
      try {
        const filePath = window.electronAPI.getPathForFile(file);
        const ext = "." + (filePath.split(".").pop() || "").toLowerCase();
        if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
          showFeedback(t("alarm.feedback.unsupportedFile"), "error");
          return;
        }

        const applied = await applyLocalFile(filePath);
        if (applied) {
          showFeedback(
            format(t("alarm.feedback.fileLoaded"), {
              name: getFileName(filePath),
            }),
            "success",
          );
        }
      } catch (err) {
        log.error("File drop error:", err);
        showFeedback(t("alarm.feedback.fileLoadError"), "error");
      }
```

with:

```js
      try {
        const value = await localSourceFromDroppedFile(file);
        if (!value) {
          showFeedback(t("alarm.feedback.fileLoadError"), "error");
          return;
        }
        const ext = "." + (value.split(".").pop() || "").toLowerCase();
        if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
          showFeedback(t("alarm.feedback.unsupportedFile"), "error");
          return;
        }

        const applied = await applyLocalFile(value);
        if (applied) {
          showFeedback(
            format(t("alarm.feedback.fileLoaded"), {
              name: getFileName(value),
            }),
            "success",
          );
        }
      } catch (err) {
        log.error("File drop error:", err);
        showFeedback(t("alarm.feedback.fileLoadError"), "error");
      }
```

- [ ] **Step 11: Verify syntax**

```bash
node --check packages/core/js/alarmModal.js
node --check packages/core/js/intervalTimer.js
node --check packages/core/js/demo/isPwaMode.js
```

- [ ] **Step 12: Commit**

```bash
git add packages/core/js/alarmModal.js packages/core/js/intervalTimer.js packages/core/js/demo/isPwaMode.js
git commit -m "$(cat <<'EOF'
feat: route alarmModal.js's local-file flow through localSourceAdapter

chooseAlarmBtn, the drop handler, applyLocalFile, renderRecentList,
and updateAlarmHealthBadge now go through the shared adapter instead
of calling window.electronAPI's path-based methods directly, so the
PWA's blob-backed strategy works without any platform branching in
this file itself. Also hides the Spotify section in PWA mode (out of
scope for v1 — see design spec) and removes toFileUrl, which is no
longer needed now that getPlayableUrl covers the same job for both
platforms (its one importer, intervalTimer.js, never actually called
it — dead import, removed too).
EOF
)"
```

---

### Task 6: Platform detection — `loader.js` + manifest link

**Files:**
- Modify: `packages/core/js/demo/loader.js`
- Modify: `packages/core/index.html`

- [ ] **Step 1: Add the third branch to `loader.js`**

Replace the whole file:

```js
// Classic (non-module) script, loaded as an external file — not inlined —
// because index.html's CSP is `script-src 'self' ...` with no
// 'unsafe-inline', which silently blocks inline <script> blocks. As a
// same-origin external file this is allowed, and it runs before the
// type="module" scripts below it, so window.electronAPI exists by the
// time their init code touches it.
//
// Three cases, checked in order:
//   1. Real preload.cjs already ran (window.electronAPI exists) — real
//      Electron app, do nothing.
//   2. ?demo=1 in the URL — the GitHub Pages demo (docs/app/); loads the
//      in-memory electron-demo-shim.js. See js/demo/electron-demo-shim.js.
//   3. Neither — this is the deployed PWA (docs/pwa/), the only target
//      that reaches this branch at all; loads the real, persistent
//      electronAPI-web.js and registers the service worker.
if (new URLSearchParams(location.search).get("demo") === "1") {
  document.write('<script src="js/demo/electron-demo-shim.js"><\/script>');
} else if (!window.electronAPI) {
  document.write('<script src="platform/electronAPI-web.js"><\/script>');
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
}
```

- [ ] **Step 2: Add the manifest link to `index.html`**

In the `<head>`, right after the existing stylesheet links:

```html
    <link rel="stylesheet" href="css/tokens.css" />
    <link rel="stylesheet" href="css/styles.css" />
    <link rel="manifest" href="manifest.json" />
```

(This 404s harmlessly in Electron and the demo — neither has a `manifest.json` — browsers silently ignore a missing manifest fetch; only `docs/pwa/index.html` actually has one, added in Task 7.)

- [ ] **Step 3: Verify syntax**

```bash
node --check packages/core/js/demo/loader.js
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/js/demo/loader.js packages/core/index.html
git commit -m "feat: add the PWA branch to the runtime platform-detection loader"
```

---

### Task 7: `manifest.json` + icons

**Files:**
- Create: `packages/pwa/manifest.json`
- Create: `packages/pwa/icons/icon-192.png`, `packages/pwa/icons/icon-512.png`

No image-resizing tool is available in this environment (no ImageMagick/sharp), and `packages/core/assets/icons/stopwatch-main.png` is already a 512×512 PNG — both manifest sizes reuse that same file rather than generating true multi-resolution variants. This is a reasonable v1 tradeoff (browsers downscale a raster PNG fine for display); revisit only if it looks visibly soft on a real device.

- [ ] **Step 1: Copy the icon**

```bash
mkdir -p packages/pwa/icons
cp packages/core/assets/icons/stopwatch-main.png packages/pwa/icons/icon-192.png
cp packages/core/assets/icons/stopwatch-main.png packages/pwa/icons/icon-512.png
```

- [ ] **Step 2: Write `manifest.json`**

Colors match `packages/core/css/tokens.css`'s `--bg` (`#1e1e1e`).

```json
{
  "name": "Interval Timer",
  "short_name": "Interval Timer",
  "description": "Work/break interval timer and plain countdown timer.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#1e1e1e",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Verify it's valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/pwa/manifest.json')); console.log('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/manifest.json packages/pwa/icons
git commit -m "feat: add PWA manifest and icons"
```

---

### Task 8: `service-worker.js`

**Files:**
- Create: `packages/pwa/service-worker.js`

- [ ] **Step 1: Write the file**

Cache-first for same-origin GET requests, populated as files are actually requested rather than an exhaustive hardcoded precache list (there's no bundler to generate an asset manifest from, and a hand-maintained list would silently go stale). Cross-origin requests (YouTube iframe embeds) pass through untouched — `AlarmManager` already falls back to a local alarm when a remote source is unreachable, so this doesn't need its own offline handling.

```js
const CACHE_NAME = "interval-timer-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check packages/pwa/service-worker.js
```

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/service-worker.js
git commit -m "feat: add the PWA's offline-caching service worker"
```

---

### Task 9: `packages/pwa/scripts/build.mjs` — deploy to `docs/pwa/`

**Files:**
- Create: `packages/pwa/scripts/build.mjs`
- Modify: `.gitignore` (docs/pwa is a generated, committed mirror like docs/app — no ignore needed, but confirm nothing already ignores it)

**Interfaces:**
- Consumes: `syncCoreInto(destDir)` from `scripts/lib/syncCore.mjs` (restructure plan, Task 5).

- [ ] **Step 1: Write the build script**

```js
// Produces docs/pwa/ — packages/core's servable files plus this package's
// own manifest.json, service-worker.js, platform/, and icons/. Run via
// "npm run sync:pwa" from the repo root (or `node
// packages/pwa/scripts/build.mjs` directly). docs/pwa/ is a generated
// mirror — never hand-edit it, re-run this script instead.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "../../../scripts/lib/syncCore.mjs";

const pwaDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(pwaDir));
const destDir = path.join(repoRoot, "docs", "pwa");

syncCoreInto(destDir);

const PWA_ENTRIES = ["manifest.json", "service-worker.js", "platform", "icons"];
for (const entry of PWA_ENTRIES) {
  const src = path.join(pwaDir, entry);
  if (existsSync(src)) {
    cpSync(src, path.join(destDir, entry), { recursive: true });
  }
}

console.log(`Synced ${PWA_ENTRIES.join(", ")} from packages/pwa -> ${destDir}`);
```

- [ ] **Step 2: Run it**

```bash
npm run sync:pwa
```

Expected: prints two `Synced ...` lines (one from `syncCoreInto`, one from this script's own loop); `docs/pwa/index.html`, `docs/pwa/manifest.json`, `docs/pwa/service-worker.js`, `docs/pwa/platform/electronAPI-web.js`, `docs/pwa/platform/localBlobStrategy.js`, `docs/pwa/platform/blobStore.js`, `docs/pwa/icons/icon-192.png`/`icon-512.png` all now exist.

- [ ] **Step 3: Confirm `docs/pwa` isn't gitignored**

```bash
git check-ignore -v docs/pwa/index.html
```

Expected: no output (not ignored) and exit code 1. If it prints a matching `.gitignore` rule, that rule needs narrowing — `docs/pwa` is meant to be committed, same as `docs/app`.

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/scripts/build.mjs docs/pwa
git commit -m "feat: add packages/pwa's build script and deploy docs/pwa"
```

---

### Task 10: Link from the landing page

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/assets/i18n.js`

**Interfaces:**
- Consumes: `docs/assets/i18n.js`'s existing `data-i18n` translation-key convention (`en`/`tr` dictionaries, applied to elements via `data-i18n="key"`).

- [ ] **Step 1: Add translation keys**

In `docs/assets/i18n.js`, in the `en` dictionary, right after the existing `"hero.releases": "See all releases",` line:

```js
    "hero.tryPwa": "Try the full web app",
```

In the `tr` dictionary, right after `"hero.releases": "Tüm sürümleri gör",`:

```js
    "hero.tryPwa": "Tam web uygulamasını dene",
```

- [ ] **Step 2: Add the link to the CTA row**

In `docs/index.html`, the existing CTA row (around line 1017) is:

```html
    <div class="cta-row">
      <a class="btn-download" href="https://github.com/psymore/interval-timer/releases/latest"
        data-i18n="hero.download">
        ⬇ Download for Windows
      </a>
      <a class="btn-secondary" href="https://github.com/psymore/interval-timer/releases" data-i18n="hero.releases">
        See all releases
      </a>
    </div>
```

Add a third link, matching the existing `btn-secondary` style:

```html
    <div class="cta-row">
      <a class="btn-download" href="https://github.com/psymore/interval-timer/releases/latest"
        data-i18n="hero.download">
        ⬇ Download for Windows
      </a>
      <a class="btn-secondary" href="https://github.com/psymore/interval-timer/releases" data-i18n="hero.releases">
        See all releases
      </a>
      <a class="btn-secondary" href="pwa/index.html" data-i18n="hero.tryPwa">
        Try the full web app
      </a>
    </div>
```

- [ ] **Step 3: Manually verify the link**

Serve `docs/` locally and click through:

```bash
npx serve docs
```

Expected: the new link navigates to the PWA and it loads.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/assets/i18n.js
git commit -m "feat: link the landing page to the installable PWA"
```

---

### Task 11: Full manual verification

**Files:** none — verification only; fix-and-recommit if something's broken.

- [ ] **Step 1: Serve the PWA build and do a cold-start check**

```bash
npx serve docs/pwa
```

Open it in a desktop browser. Verify:
- The app loads with the three default presets (Pomodoro/Short Focus/Deep Work).
- DevTools → Application tab → Manifest shows "Interval Timer" with both icon sizes, no errors.
- DevTools → Application tab → Service Workers shows it registered and activated.

- [ ] **Step 2: Persistence across reload**

- Edit a preset's work/break minutes, switch tabs, reload the page. Expected: the edit persisted (it auto-forked into `last-session` per the existing preset-sync behavior, same as desktop).
- Create a new preset, reload. Expected: still there.
- Switch language, reload. Expected: language choice persisted.

- [ ] **Step 3: Local alarm upload**

- Open the Alarm Sound modal. Expected: Spotify section is hidden; Local and YouTube sections both show.
- Choose a local `.mp3`/`.wav`/`.ogg` file via "Choose file…". Expected: it becomes the current alarm, appears in "Recent", Preview plays it.
- Reload the page, reopen the modal. Expected: the same file is still shown as current/in Recent, and still plays (confirms the IndexedDB blob survived the reload, unlike `docs/app`'s demo which is intentionally non-persistent).
- Drag-and-drop a different audio file onto the dropzone. Expected: same result as the picker.
- Try dragging in a non-audio file (e.g. a `.txt`). Expected: "unsupported file type" feedback, nothing applied.

- [ ] **Step 4: Offline fallback**

With a local alarm already selected and applied (from Step 3), DevTools → Network → "Offline", then reload. Expected: the app shell still loads (served from the service worker cache) and the previously-applied local alarm still plays on Preview. Load a YouTube alarm URL while offline. Expected: it fails to load and `AlarmManager` falls back to the local alarm, showing the existing "Spotify unavailable, using local alarm"-style fallback feedback (reusing the same fallback message path production already has for a failed remote source — not a new message).

- [ ] **Step 5: Install flow**

If a phone is available on the same network: serve `docs/pwa` with a tool reachable from the phone (e.g. `npx serve docs/pwa --listen 0.0.0.0:3000` and browse to the machine's LAN IP), open it in the phone's browser, use "Add to Home Screen", confirm it launches full-screen without browser chrome and the app works normally. If no phone is available for this session, note that explicitly rather than claiming it was verified — this is the one check that can't be done from DevTools alone.

- [ ] **Step 6: Confirm the Electron app and `docs/app` demo are both unaffected**

```bash
npm start
```

Spot-check the desktop app still works normally (presets, timer, mini window, alarm modal with all three sections — including Spotify, which should be visible again here since `isPwaMode()` only hides it in the PWA build).

```bash
npm run sync:demo
git status docs/app
```

Expected: no changes (the `js/alarmModal.js`/`localSourceAdapter.js` edits in this plan are additive/branch-dependent — demo mode's own behavior, gated by `isDemoMode()`, is untouched).

- [ ] **Step 7: Final commit if anything needed fixing**

Same as the restructure plan's final task — if any of Steps 1–6 required a fix, commit it now with a description of what was wrong.
