# Alarm Sound Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Alarm Sound modal (`#alarmFolderModal`) into an accordion with real Spotify/YouTube brand icons, a drag-and-drop zone + recent-files list for local sources, and per-service URL fields that reject the wrong kind of link.

**Architecture:** `index.html`'s three flat `.alarm-section` blocks become three collapsible accordion sections (Local / YouTube / Spotify), only one open at a time. `js/alarmModal.js` gains accordion-toggle logic, per-section URL validation via the existing `AlarmProviderFactory.detect()`, and drag-and-drop wiring for local files. A new pure-logic module (`js/alarm/recentAlarms.js`) tracks the last 5 local file paths in `localStorage`. Two new main-process IPC handlers (`lib/localServer.js`) let the renderer check whether recent files still exist on disk and register a dropped/reselected path with the existing single-path allowlist that guards the local audio HTTP route.

**Tech Stack:** No new npm dependency. Electron's `webUtils.getPathForFile()` (available since Electron 32; this project is on ^41.10.1) for drop-path resolution. Real brand SVGs from Simple Icons (CC0) and a Lucide (ISC) folder glyph, both fetched and embedded directly in this plan — no placeholder icon content.

## Global Constraints

- No changes to `js/alarm/providers/*` or `AlarmProviderFactory` — this is a UI-layer restructuring; `detect()` is reused, not modified.
- Spotify/YouTube brand icons are shown at their official colors and never recolored/restyled per-theme, per Simple Icons' usage guidance and the existing documented convention that brand names aren't translated (`js/alarmModal.js:59`).
- Only one accordion section may be expanded at a time.
- Exactly 5 entries max in the local "Recent" list, newest first, deduped by path. The bundled default alarm (`assets/alarm.mp3`) is never a member of this list.
- All new user-facing strings go through the existing i18n system (`js/i18n/translations.js`, `t()`/`format()`/`applyTranslations()`), both `en` and `tr` blocks.
- This repo has no test runner (`npm test` is a stub) — verification is manual (run the app, check behavior) plus throwaway Node scripts for pure-logic functions, deleted after verifying.
- `preload.cjs` must stay `.cjs` (CommonJS) — see project README/CLAUDE.md; do not convert it to ESM.

---

### Task 1: Main-process IPC + preload bridge for local-file handling

**Files:**
- Modify: `lib/localServer.js:179-198` (extract shared allowlist-setter, add two new IPC handlers)
- Modify: `preload.cjs:1`, `preload.cjs:7-8` (add `webUtils`, add three bridge methods)

**Interfaces:**
- Produces (main process, internal): `setAllowedLocalAudioPath(filePath: string): void` — resolves and stores the path, extracted from the existing `get-file-path` handler.
- Produces (IPC): `alarm:check-paths-exist` (invoke, `paths: string[]`) → `boolean[]`, one entry per input path via `fs.existsSync`.
- Produces (IPC): `alarm:use-local-path` (invoke, `filePath: string`) → `{ path: string } | { error: string }`. Validates the extension against `LOCAL_AUDIO_EXTENSIONS` and that the file exists, then calls `setAllowedLocalAudioPath`.
- Produces (renderer-facing, via `window.electronAPI`): `getPathForFile(file: File): string`, `alarmCheckPathsExist(paths: string[]): Promise<boolean[]>`, `alarmUseLocalPath(path: string): Promise<{path: string}|{error: string}>`.

- [ ] **Step 1: Extract the shared allowlist-setter and add the two new IPC handlers in `lib/localServer.js`**

Find:

```js
// ── File picker IPC ───────────────────────────────────────────
// Lives here (rather than main.js) because it writes the one piece of state
// (`allowedLocalAudioPath`) that handleLocalAudioRequest's allowlist check
// above reads — keeping the writer and the security check in the same file.
export function registerLocalServerIpc() {
  ipcMain.handle("get-file-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    // Record this as the one path `/local-audio/` is allowed to serve — see
    // handleLocalAudioRequest. Persisted (not just in-memory) so the
    // previously-selected alarm still plays after an app restart.
    store.set("allowedLocalAudioPath", path.resolve(filePath));
    return filePath;
  });
}
```

Replace with:

```js
// ── File picker IPC ───────────────────────────────────────────
// Lives here (rather than main.js) because it writes the one piece of state
// (`allowedLocalAudioPath`) that handleLocalAudioRequest's allowlist check
// above reads — keeping the writer and the security check in the same file.
function setAllowedLocalAudioPath(filePath) {
  // Persisted (not just in-memory) so the previously-selected alarm still
  // plays after an app restart.
  store.set("allowedLocalAudioPath", path.resolve(filePath));
}

export function registerLocalServerIpc() {
  ipcMain.handle("get-file-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    setAllowedLocalAudioPath(filePath);
    return filePath;
  });

  // Lets the renderer gray out "Recent" entries whose file has moved or
  // been deleted, without ever granting those paths access to
  // `/local-audio/` — existence-checking is intentionally separate from
  // allowlisting (see alarm:use-local-path below).
  ipcMain.handle("alarm:check-paths-exist", (_event, paths) => {
    if (!Array.isArray(paths)) return [];
    return paths.map(p => typeof p === "string" && fs.existsSync(p));
  });

  // Used when the renderer already has a path in hand from something other
  // than the native file dialog (a drag-and-drop, or re-selecting a
  // "Recent" entry) — registers it with the same allowlist `get-file-path`
  // already writes to, after the same extension + existence checks
  // `handleLocalAudioRequest` and the dialog's own filter already enforce.
  ipcMain.handle("alarm:use-local-path", (_event, filePath) => {
    if (typeof filePath !== "string") {
      return { error: "Invalid path." };
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!LOCAL_AUDIO_EXTENSIONS.includes(ext)) {
      return { error: "Unsupported file type." };
    }
    if (!fs.existsSync(filePath)) {
      return { error: "File not found." };
    }
    setAllowedLocalAudioPath(filePath);
    return { path: filePath };
  });
}
```

- [ ] **Step 2: Add `webUtils` and the three bridge methods to `preload.cjs`**

Find:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  quitApp: () => ipcRenderer.invoke("app:quit"),

  // Dosya
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
```

Replace with:

```js
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  quitApp: () => ipcRenderer.invoke("app:quit"),

  // Dosya
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
  // Electron 32+ removed File.path for security — webUtils.getPathForFile
  // is the supported replacement for recovering a real path from a
  // drag-and-dropped File object under contextIsolation.
  getPathForFile: file => webUtils.getPathForFile(file),
  alarmCheckPathsExist: paths => ipcRenderer.invoke("alarm:check-paths-exist", paths),
  alarmUseLocalPath: path => ipcRenderer.invoke("alarm:use-local-path", path),
```

- [ ] **Step 3: Verify via devtools**

Run: `npm start` (from the repo root; if running inside a sandboxed shell where `ELECTRON_RUN_AS_NODE` is set, prefix with `env -u ELECTRON_RUN_AS_NODE` or it will boot as plain Node instead of Electron).

Open the main window's devtools (Ctrl+Shift+I) and run in the console:

```js
await window.electronAPI.alarmCheckPathsExist(["C:\\Windows\\win.ini", "C:\\nonexistent\\path\\file.mp3"])
```

Expected: `[true, false]`.

```js
await window.electronAPI.alarmUseLocalPath("C:\\Windows\\win.ini")
```

Expected: `{error: "Unsupported file type."}` (wrong extension, proves the guard runs before touching the allowlist).

```js
await window.electronAPI.alarmUseLocalPath("d:\\CodeSpace\\interval-timer\\assets\\alarm.mp3")
```

Expected: `{path: "d:\\CodeSpace\\interval-timer\\assets\\alarm.mp3"}` (adjust the drive/path if your checkout lives elsewhere).

Close the app.

- [ ] **Step 4: Commit**

```bash
git add lib/localServer.js preload.cjs
git commit -m "feat: add IPC handlers for recent-file existence checks and local path registration"
```

---

### Task 2: Recent-alarms pure logic module

**Files:**
- Create: `js/alarm/recentAlarms.js`

**Interfaces:**
- Produces: `addRecentPath(recentPaths: string[], newPath: string): string[]` — dedupes `newPath` out of the array, unshifts it to the front, trims to 5.
- Produces: `loadRecentPaths(): string[]` — reads and parses `localStorage["recentAlarmPaths"]`, returns `[]` on missing/invalid data.
- Produces: `saveRecentPaths(paths: string[]): void` — writes `localStorage["recentAlarmPaths"]`.

- [ ] **Step 1: Write `js/alarm/recentAlarms.js`**

```js
const STORAGE_KEY = "recentAlarmPaths";
const MAX_RECENT = 5;

export function addRecentPath(recentPaths, newPath) {
  const withoutDup = recentPaths.filter(p => p !== newPath);
  return [newPath, ...withoutDup].slice(0, MAX_RECENT);
}

export function loadRecentPaths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentPaths(paths) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}
```

- [ ] **Step 2: Verify `addRecentPath` with a throwaway script**

Create `verify-recent-alarms.mjs` in the repo root:

```js
import { addRecentPath } from "./js/alarm/recentAlarms.js";

const cases = [
  [addRecentPath([], "a.mp3"), ["a.mp3"]],
  [addRecentPath(["a.mp3", "b.mp3"], "c.mp3"), ["c.mp3", "a.mp3", "b.mp3"]],
  [addRecentPath(["a.mp3", "b.mp3"], "a.mp3"), ["a.mp3", "b.mp3"]], // dedup, stays at front
  [addRecentPath(["a", "b", "c", "d", "e"], "f"), ["f", "a", "b", "c", "d"]], // trimmed to 5
];

let failed = false;
cases.forEach(([actual, expected], i) => {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (!match) {
    failed = true;
    console.error(`FAIL case ${i}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
});
console.log(failed ? "addRecentPath: FAILED" : "addRecentPath: all cases passed");
```

Run: `node verify-recent-alarms.mjs`
Expected output: `addRecentPath: all cases passed`

- [ ] **Step 3: Delete the throwaway script and commit**

```bash
rm verify-recent-alarms.mjs
git add js/alarm/recentAlarms.js
git commit -m "feat: add pure logic for tracking recent local alarm files"
```

---

### Task 3: Accordion restructure with brand icons and per-service URL fields

**Files:**
- Modify: `index.html:91-147` (replace the three flat sections with an accordion; split the shared URL field)
- Create: `assets/icons/spotify.svg`, `assets/icons/youtube.svg`
- Modify: `js/alarmModal.js` (accordion toggle logic, consolidated current-source icon, per-field validation, replace `updateProviderTag`)
- Modify: `css/styles.css` (replace/extend the `/* ── Alarm section ── */` and `/* ── Provider tag ── */` blocks from `css/styles.css:1318-1391`)
- Modify: `js/i18n/translations.js` (new/changed keys, `en` + `tr`)

**Interfaces:**
- Consumes: `AlarmProviderFactory.detect(url): "local"|"youtube"|"spotify"` (existing, unchanged).
- Produces: no new exports — this task's changes are internal to `js/alarmModal.js`'s `DOMContentLoaded` closure.

- [ ] **Step 1: Create the brand icon assets**

Create `assets/icons/spotify.svg`:

```svg
<svg fill="#1DB954" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Spotify</title><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
```

Create `assets/icons/youtube.svg`:

```svg
<svg fill="#FF0000" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
```

Both are Simple Icons' official CC0-licensed marks (`https://cdn.simpleicons.org/spotify/1DB954` and `.../youtube/FF0000`), colored to each brand's own official hex, unmodified.

- [ ] **Step 2: Replace the alarm modal markup in `index.html`**

Find (the full block, `index.html:91-147`):

```html
    <!-- Alarm File Modal -->
    <div id="alarmFolderModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="alarmTitle">
        <div class="modal-content">
            <h2 id="alarmTitle" data-i18n="alarm.title">Alarm Sound</h2>

            <!-- Mevcut kaynak -->
            <div class="alarm-current">
                <span class="alarm-current-label" data-i18n="alarm.current">Current</span>
                <span class="alarm-current-file" id="alarmCurrentFile">alarm.mp3 (default)</span>
                <span class="alarm-provider-tag hidden" id="alarmProviderTag"></span>
            </div>

            <!-- Local dosya seçimi -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.localSectionLabel">Local file</p>
                <button type="button" id="chooseAlarmBtn" class="btn-primary" data-i18n="alarm.chooseFile">Choose file…</button>
            </div>

            <!-- URL ile yükleme -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.urlSectionLabel">YouTube or Spotify URL</p>
                <div class="alarm-url-row">
                    <input id="alarmUrlInput" type="url" placeholder="https://youtube.com/watch?v=… or spotify link"
                        data-i18n-placeholder="alarm.urlPlaceholder"
                        autocomplete="off" spellcheck="false" />
                    <button type="button" id="alarmUrlLoadBtn" data-i18n="alarm.urlLoad">Load</button>
                </div>
                <p class="alarm-url-hint" data-i18n="alarm.urlHint">
                    Paste a YouTube video or Spotify track URL. Spotify links
                    require connecting your account and play through the real
                    Spotify app (not an in-app preview).
                    If unavailable, local alarm will be used as fallback.
                </p>
            </div>

            <!-- Spotify account -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.spotifySectionLabel">Spotify</p>
                <div class="alarm-spotify-status" id="spotifyStatusRow">
                    <span id="spotifyStatusLabel">Not connected</span>
                    <button type="button" id="spotifyConnectBtn" class="btn-subtle" data-i18n="alarm.spotifyConnect">Connect Spotify</button>
                    <button type="button" id="spotifyLogoutBtn" class="btn-subtle hidden" data-i18n="alarm.spotifyDisconnect">Disconnect</button>
                </div>
            </div>

            <!-- Preview -->
            <div class="alarm-actions">
                <button type="button" id="previewAlarmBtn" aria-label="Preview alarm sound" data-i18n-aria-label="alarm.previewAriaLabel">
                    ▶ Preview
                </button>
                <button type="button" id="closeAlarmFolderBtn" class="btn-subtle" data-i18n="alarm.done">Done</button>
            </div>

            <!-- Feedback -->
            <p class="alarm-feedback hidden" id="alarmFeedback"></p>
        </div>
    </div>
```

Replace with:

```html
    <!-- Alarm File Modal -->
    <div id="alarmFolderModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="alarmTitle">
        <div class="modal-content">
            <h2 id="alarmTitle" data-i18n="alarm.title">Alarm Sound</h2>

            <!-- Mevcut kaynak -->
            <div class="alarm-current">
                <span class="alarm-current-icon" id="alarmCurrentIcon" aria-hidden="true"></span>
                <span class="alarm-current-label" data-i18n="alarm.current">Current</span>
                <span class="alarm-current-file" id="alarmCurrentFile">alarm.mp3 (default)</span>
            </div>

            <!-- Accordion: Local / YouTube / Spotify -->
            <div class="alarm-accordion" id="alarmAccordion">

                <!-- Local -->
                <div class="alarm-section" data-section="local">
                    <button type="button" class="alarm-section-toggle" id="localSectionToggle"
                        aria-expanded="true" aria-controls="localSectionBody">
                        <span class="alarm-section-icon" id="localSectionIcon" aria-hidden="true"></span>
                        <span class="alarm-section-title" data-i18n="alarm.localSectionLabel">Local file</span>
                        <span class="alarm-section-chevron" aria-hidden="true">⌄</span>
                    </button>
                    <div class="alarm-section-body" id="localSectionBody">
                        <button type="button" id="chooseAlarmBtn" class="btn-primary" data-i18n="alarm.chooseFile">Choose file…</button>
                    </div>
                </div>

                <!-- YouTube -->
                <div class="alarm-section" data-section="youtube">
                    <button type="button" class="alarm-section-toggle" id="youtubeSectionToggle"
                        aria-expanded="false" aria-controls="youtubeSectionBody">
                        <span class="alarm-section-icon" aria-hidden="true"><img src="assets/icons/youtube.svg" alt="" /></span>
                        <span class="alarm-section-title" data-i18n="alarm.youtubeSectionLabel">YouTube</span>
                        <span class="alarm-section-chevron" aria-hidden="true">⌄</span>
                    </button>
                    <div class="alarm-section-body hidden" id="youtubeSectionBody">
                        <div class="alarm-url-row">
                            <input id="youtubeUrlInput" type="url" placeholder="https://youtube.com/watch?v=…"
                                data-i18n-placeholder="alarm.youtubeUrlPlaceholder"
                                autocomplete="off" spellcheck="false" />
                            <button type="button" id="youtubeUrlLoadBtn" data-i18n="alarm.urlLoad">Load</button>
                        </div>
                        <p class="alarm-url-hint" data-i18n="alarm.youtubeUrlHint">
                            Paste a YouTube video URL. If unavailable, local alarm will be used as fallback.
                        </p>
                    </div>
                </div>

                <!-- Spotify -->
                <div class="alarm-section" data-section="spotify">
                    <button type="button" class="alarm-section-toggle" id="spotifySectionToggle"
                        aria-expanded="false" aria-controls="spotifySectionBody">
                        <span class="alarm-section-icon" aria-hidden="true"><img src="assets/icons/spotify.svg" alt="" /></span>
                        <span class="alarm-section-title" data-i18n="alarm.spotifySectionLabel">Spotify</span>
                        <span class="alarm-section-status" id="spotifyStatusLabel">Not connected</span>
                        <span class="alarm-section-chevron" aria-hidden="true">⌄</span>
                    </button>
                    <div class="alarm-section-body hidden" id="spotifySectionBody">
                        <div class="alarm-spotify-status" id="spotifyStatusRow">
                            <button type="button" id="spotifyConnectBtn" class="btn-subtle" data-i18n="alarm.spotifyConnect">Connect Spotify</button>
                            <button type="button" id="spotifyLogoutBtn" class="btn-subtle hidden" data-i18n="alarm.spotifyDisconnect">Disconnect</button>
                        </div>
                        <div class="alarm-url-row hidden" id="spotifyUrlRow">
                            <input id="spotifyUrlInput" type="url" placeholder="https://open.spotify.com/track/…"
                                data-i18n-placeholder="alarm.spotifyUrlPlaceholder"
                                autocomplete="off" spellcheck="false" />
                            <button type="button" id="spotifyUrlLoadBtn" data-i18n="alarm.urlLoad">Load</button>
                        </div>
                        <p class="alarm-url-hint" data-i18n="alarm.spotifyUrlHint">
                            Connect your account, then paste a Spotify track URL. Plays through the real
                            Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.
                        </p>
                    </div>
                </div>

            </div>

            <!-- Preview -->
            <div class="alarm-actions">
                <button type="button" id="previewAlarmBtn" aria-label="Preview alarm sound" data-i18n-aria-label="alarm.previewAriaLabel">
                    ▶ Preview
                </button>
                <button type="button" id="closeAlarmFolderBtn" class="btn-subtle" data-i18n="alarm.done">Done</button>
            </div>

            <!-- Feedback -->
            <p class="alarm-feedback hidden" id="alarmFeedback"></p>
        </div>
    </div>
```

Note `#spotifyStatusLabel` moved from the status row into the section header — `js/alarmModal.js`'s existing `updateSpotifyAuthUI()` only calls `getElementById("spotifyStatusLabel")` and sets `.textContent`, so it keeps working unchanged regardless of where the element lives in the DOM.

- [ ] **Step 3: Rewrite the top of `js/alarmModal.js`'s `DOMContentLoaded` handler — element lookups and the folder icon constant**

Find:

```js
const DEFAULT_ALARM = "assets/alarm.mp3";

// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
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

  if (!chooseAlarmBtn) {
    log.error("alarmModal: #chooseAlarmBtn not found.");
    return;
  }
```

Replace with:

```js
const DEFAULT_ALARM = "assets/alarm.mp3";

// Lucide "folder-open" (ISC license) — no brand mark exists for "local
// file", so this is a generic glyph using currentColor to match whichever
// element it's dropped into (unlike the Spotify/YouTube <img> icons, which
// carry their own fixed brand color and must never be recolored).
const FOLDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;

// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmCurrentIcon = document.getElementById("alarmCurrentIcon");
  const localSectionIcon = document.getElementById("localSectionIcon");
  const alarmFeedback = document.getElementById("alarmFeedback");
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const youtubeUrlLoadBtn = document.getElementById("youtubeUrlLoadBtn");
  const spotifyUrlInput = document.getElementById("spotifyUrlInput");
  const spotifyUrlLoadBtn = document.getElementById("spotifyUrlLoadBtn");
  const spotifyUrlRow = document.getElementById("spotifyUrlRow");
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");

  if (!chooseAlarmBtn) {
    log.error("alarmModal: #chooseAlarmBtn not found.");
    return;
  }

  if (localSectionIcon) localSectionIcon.innerHTML = FOLDER_ICON_SVG;
```

- [ ] **Step 4: Replace `updateProviderTag` with `updateCurrentIcon`, and wire the accordion toggle**

Find:

```js
  function updateProviderTag(type) {
    if (urlProviderTag) {
      // Provider brand names — not translated (see design spec).
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
        ? t("alarm.previewDisabledTitle")
        : "";
    }
  }
```

Replace with:

```js
  function updateCurrentIcon(type) {
    if (alarmCurrentIcon) {
      const markup = {
        local: FOLDER_ICON_SVG,
        youtube: '<img src="assets/icons/youtube.svg" alt="" />',
        spotify: '<img src="assets/icons/spotify.svg" alt="" />',
      };
      alarmCurrentIcon.innerHTML = markup[type] || markup.local;
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? t("alarm.previewDisabledTitle")
        : "";
    }
  }

  // ── Accordion: only one section open at a time ────────────
  function setupAccordion() {
    const toggles = document.querySelectorAll(".alarm-section-toggle");
    toggles.forEach(toggle => {
      toggle.addEventListener("click", () => {
        if (toggle.getAttribute("aria-expanded") === "true") return;

        toggles.forEach(t => {
          t.setAttribute("aria-expanded", "false");
          const body = document.getElementById(t.getAttribute("aria-controls"));
          if (body) body.classList.add("hidden");
        });

        toggle.setAttribute("aria-expanded", "true");
        const body = document.getElementById(toggle.getAttribute("aria-controls"));
        if (body) body.classList.remove("hidden");
      });
    });
  }
  setupAccordion();
```

Every existing call site of `updateProviderTag(...)` in this file is renamed to `updateCurrentIcon(...)` in the remaining steps below — same signature, same call sites, just the new name and behavior.

- [ ] **Step 5: Update the initial-load block to use `updateCurrentIcon`**

Find:

```js
  const savedSource = localStorage.getItem("selectedAlarmPath");
  if (savedSource) {
    const type = AlarmProviderFactory.detect(savedSource);
    if (type === "local") {
      updateCurrentFile(getFileName(savedSource));
    } else {
      const label =
        savedSource.length > 40 ? savedSource.slice(0, 37) + "…" : savedSource;
      updateCurrentFile(label);
      // alarmManager.initialize() may have silently fallen back to local
      // (e.g. no Spotify session) — reflect what actually loaded, not the
      // raw saved string, so the tag/Preview-disable state stays accurate.
      updateProviderTag(alarmManager.getProviderType());
    }
  } else {
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
  }
```

Replace with:

```js
  const savedSource = localStorage.getItem("selectedAlarmPath");
  if (savedSource) {
    const type = AlarmProviderFactory.detect(savedSource);
    if (type === "local") {
      updateCurrentFile(getFileName(savedSource));
      updateCurrentIcon("local");
    } else {
      const label =
        savedSource.length > 40 ? savedSource.slice(0, 37) + "…" : savedSource;
      updateCurrentFile(label);
      // alarmManager.initialize() may have silently fallen back to local
      // (e.g. no Spotify session) — reflect what actually loaded, not the
      // raw saved string, so the icon/Preview-disable state stays accurate.
      updateCurrentIcon(alarmManager.getProviderType());
    }
  } else {
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
  }
```

- [ ] **Step 6: Update the local-file-picker handler**

Find:

```js
      usingDefaultAlarm = false;
      updateCurrentFile(getFileName(filePath));
      updateProviderTag("local");
      resetPreviewBtn();
      showFeedback(
        format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
        "success",
      );
```

Replace with:

```js
      usingDefaultAlarm = false;
      updateCurrentFile(getFileName(filePath));
      updateCurrentIcon("local");
      resetPreviewBtn();
      showFeedback(
        format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
        "success",
      );
```

- [ ] **Step 7: Split the shared URL-load handler into per-service handlers with wrong-box validation**

Find:

```js
  // ── URL ile yükleme (YouTube / Spotify) ───────────────────
  urlLoadBtn.addEventListener("click", async () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      showFeedback(t("alarm.feedback.enterUrl"), "error");
      urlInput.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback(t("alarm.feedback.invalidUrl"), "error");
      return;
    }

    setUrlLoadBtnState(true);

    try {
      const result = await alarmManager.load(rawUrl);

      if (result.usedFallback) {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          format(t("alarm.feedback.providerFallback"), { provider: providerLabel }),
          "error",
        );
        updateProviderTag("local");
        updateCurrentFile(t("alarm.fallbackFile"));
      } else {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), { provider: providerLabel }),
          "success",
        );
        updateProviderTag(detectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      urlInput.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        format(t("alarm.feedback.loadFailed"), { message: err.message ?? "Unknown error" }),
        "error",
      );
    } finally {
      setUrlLoadBtnState(false);
    }
  });
```

Replace with:

```js
  // ── URL ile yükleme (YouTube / Spotify, ayrı kutular) ─────
  function setUrlLoadBtnState(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? t("alarm.urlLoading") : t("alarm.urlLoad");
  }

  async function handleUrlLoad({ expectedType, input, loadBtn }) {
    const rawUrl = input.value.trim();
    if (!rawUrl) {
      showFeedback(t("alarm.feedback.enterUrl"), "error");
      input.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback(t("alarm.feedback.invalidUrl"), "error");
      return;
    }
    if (detectedType !== expectedType) {
      const providerLabel = detectedType === "youtube" ? "YouTube" : "Spotify";
      showFeedback(
        format(t("alarm.feedback.wrongServiceLink"), { provider: providerLabel }),
        "error",
      );
      return;
    }

    setUrlLoadBtnState(loadBtn, true);

    try {
      const result = await alarmManager.load(rawUrl);
      const providerLabel = expectedType === "youtube" ? "YouTube" : "Spotify";

      if (result.usedFallback) {
        showFeedback(
          format(t("alarm.feedback.providerFallback"), { provider: providerLabel }),
          "error",
        );
        updateCurrentIcon("local");
        updateCurrentFile(t("alarm.fallbackFile"));
      } else {
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), { provider: providerLabel }),
          "success",
        );
        updateCurrentIcon(expectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      input.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        format(t("alarm.feedback.loadFailed"), { message: err.message ?? "Unknown error" }),
        "error",
      );
    } finally {
      setUrlLoadBtnState(loadBtn, false);
    }
  }

  youtubeUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({ expectedType: "youtube", input: youtubeUrlInput, loadBtn: youtubeUrlLoadBtn }),
  );
  spotifyUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({ expectedType: "spotify", input: spotifyUrlInput, loadBtn: spotifyUrlLoadBtn }),
  );
```

This removes the module's original standalone `setUrlLoadBtnState(loading)` (which took no button argument, since there used to be only one). Delete that original definition — find:

```js
  function setUrlLoadBtnState(loading) {
    if (!urlLoadBtn) return;
    urlLoadBtn.disabled = loading;
    urlLoadBtn.textContent = loading ? t("alarm.urlLoading") : t("alarm.urlLoad");
  }
```

and remove it entirely (Step 7 above already defines the replacement, which takes a `btn` parameter).

- [ ] **Step 8: Update the Spotify auth UI to show/hide its URL row, and the disconnect handler's icon call**

Find:

```js
  async function updateSpotifyAuthUI() {
    const connected = await hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected
        ? t("alarm.spotifyConnected")
        : t("alarm.spotifyNotConnected");
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
  }
```

Replace with:

```js
  async function updateSpotifyAuthUI() {
    const connected = await hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected
        ? t("alarm.spotifyConnected")
        : t("alarm.spotifyNotConnected");
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
    if (spotifyUrlRow) spotifyUrlRow.classList.toggle("hidden", !connected);
  }
```

Find (in the disconnect handler):

```js
      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateProviderTag("local");
      await updateSpotifyAuthUI();
```

Replace with:

```js
      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateCurrentIcon("local");
      await updateSpotifyAuthUI();
```

And in the fallback callback near the top of the file, find:

```js
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(t("alarm.feedback.fallback"), "error");
      updateProviderTag("local");
    },
```

Replace with:

```js
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(t("alarm.feedback.fallback"), "error");
      updateCurrentIcon("local");
    },
```

- [ ] **Step 9: Update `css/styles.css` — replace the old section/provider-tag rules with accordion + icon rules**

Find (`css/styles.css:1318-1391`, everything from the `/* ── Alarm section ── */` header through the end of the `/* ── Provider tag ── */` block):

```css
/* ── Alarm section ───────────────────────────────────────────── */
.alarm-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.alarm-section-label {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* ── URL row ─────────────────────────────────────────────────── */
.alarm-url-row {
  display: flex;
  gap: var(--sp-2);
}

.alarm-url-row input[type="url"] {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid #383838;
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  color: var(--ink);
  width: auto;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.alarm-url-row input[type="url"]:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.alarm-url-row input[type="url"]::placeholder {
  color: #555;
  font-size: 0.68rem;
}

.alarm-url-row button {
  flex-shrink: 0;
  min-width: 60px;
}

.alarm-url-hint {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  line-height: 1.5;
  opacity: 0.7;
}

/* ── Provider tag ────────────────────────────────────────────── */
.alarm-provider-tag {
  font-family: var(--font-ui);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #111;
  background: var(--accent);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
```

Replace with:

```css
/* ── Alarm accordion ─────────────────────────────────────────── */
.alarm-accordion {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.alarm-section {
  border: 1px solid var(--modal-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.alarm-section-toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  background: var(--input-bg);
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.alarm-section-toggle:hover {
  background: var(--surface-alt);
}

.alarm-section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ink-muted);
}

.alarm-section-icon svg,
.alarm-section-icon img {
  width: 16px;
  height: 16px;
  display: block;
}

.alarm-section-title {
  flex: 1;
}

.alarm-section-status {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--ink-muted);
}

.alarm-section-chevron {
  color: var(--ink-muted);
  transition: transform var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}

.alarm-section-toggle[aria-expanded="true"] .alarm-section-chevron {
  transform: rotate(180deg);
}

.alarm-section-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-top: 1px solid var(--modal-border);
}

/* ── URL row ─────────────────────────────────────────────────── */
.alarm-url-row {
  display: flex;
  gap: var(--sp-2);
}

.alarm-url-row input[type="url"] {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--modal-border);
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  color: var(--ink);
  width: auto;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.alarm-url-row input[type="url"]:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.alarm-url-row input[type="url"]::placeholder {
  color: #555;
  font-size: 0.68rem;
}

.alarm-url-row button {
  flex-shrink: 0;
  min-width: 60px;
}

.alarm-url-hint {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  line-height: 1.5;
  opacity: 0.7;
}

/* ── Current-alarm icon ──────────────────────────────────────── */
.alarm-current-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ink-muted);
}

.alarm-current-icon svg,
.alarm-current-icon img {
  width: 16px;
  height: 16px;
  display: block;
}
```

(The `.alarm-spotify-status` and `.alarm-feedback` blocks elsewhere in the file are untouched — they still apply to the same class names, just nested one level deeper in the DOM now.)

- [ ] **Step 10: Add/replace i18n keys in `js/i18n/translations.js`**

In the `en` block, find:

```js
    "alarm.localSectionLabel": "Local file",
    "alarm.chooseFile": "Choose file…",
    "alarm.urlSectionLabel": "YouTube or Spotify URL",
    "alarm.urlPlaceholder": "https://youtube.com/watch?v=… or spotify link",
    "alarm.urlLoad": "Load",
    "alarm.urlLoading": "Loading…",
    "alarm.urlHint": "Paste a YouTube video or Spotify track URL. Spotify links require connecting your account and play through the real Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.",
    "alarm.spotifySectionLabel": "Spotify",
```

Replace with:

```js
    "alarm.localSectionLabel": "Local file",
    "alarm.chooseFile": "Choose file…",
    "alarm.youtubeSectionLabel": "YouTube",
    "alarm.youtubeUrlPlaceholder": "https://youtube.com/watch?v=…",
    "alarm.youtubeUrlHint": "Paste a YouTube video URL. If unavailable, local alarm will be used as fallback.",
    "alarm.spotifyUrlPlaceholder": "https://open.spotify.com/track/…",
    "alarm.spotifyUrlHint": "Connect your account, then paste a Spotify track URL. Plays through the real Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.",
    "alarm.urlLoad": "Load",
    "alarm.urlLoading": "Loading…",
    "alarm.spotifySectionLabel": "Spotify",
```

Find (still in `en`):

```js
    "alarm.feedback.enterUrl": "Please enter a YouTube or Spotify URL.",
    "alarm.feedback.invalidUrl": "Please enter a valid YouTube or Spotify URL.",
    "alarm.feedback.providerFallback": "{provider} unavailable. Using local alarm as fallback.",
```

Replace with:

```js
    "alarm.feedback.enterUrl": "Please enter a URL.",
    "alarm.feedback.invalidUrl": "That doesn't look like a valid link.",
    "alarm.feedback.wrongServiceLink": "That looks like a {provider} link — use the {provider} section instead.",
    "alarm.feedback.providerFallback": "{provider} unavailable. Using local alarm as fallback.",
```

Now the `tr` block. Find:

```js
    "alarm.localSectionLabel": "Yerel dosya",
    "alarm.chooseFile": "Dosya seç…",
    "alarm.urlSectionLabel": "YouTube veya Spotify bağlantısı",
    "alarm.urlPlaceholder": "https://youtube.com/watch?v=… ya da spotify bağlantısı",
    "alarm.urlLoad": "Yükle",
    "alarm.urlLoading": "Yükleniyor…",
    "alarm.urlHint": "Bir YouTube videosu ya da Spotify parça bağlantısı yapıştırın. Spotify bağlantıları hesabınızı bağlamanızı gerektirir ve gerçek Spotify uygulaması üzerinden çalar (uygulama içi önizleme değil). Kullanılamıyorsa yedek olarak yerel alarm devreye girer.",
    "alarm.spotifySectionLabel": "Spotify",
```

Replace with:

```js
    "alarm.localSectionLabel": "Yerel dosya",
    "alarm.chooseFile": "Dosya seç…",
    "alarm.youtubeSectionLabel": "YouTube",
    "alarm.youtubeUrlPlaceholder": "https://youtube.com/watch?v=…",
    "alarm.youtubeUrlHint": "Bir YouTube videosu bağlantısı yapıştırın. Kullanılamıyorsa yedek olarak yerel alarm devreye girer.",
    "alarm.spotifyUrlPlaceholder": "https://open.spotify.com/track/…",
    "alarm.spotifyUrlHint": "Önce hesabınızı bağlayın, ardından bir Spotify parça bağlantısı yapıştırın. Gerçek Spotify uygulaması üzerinden çalar (uygulama içi önizleme değil). Kullanılamıyorsa yedek olarak yerel alarm devreye girer.",
    "alarm.urlLoad": "Yükle",
    "alarm.urlLoading": "Yükleniyor…",
    "alarm.spotifySectionLabel": "Spotify",
```

Find (`js/i18n/translations.js:181-183`, the `tr` counterpart of the earlier `en` find):

```js
    "alarm.feedback.enterUrl": "Lütfen bir YouTube ya da Spotify bağlantısı girin.",
    "alarm.feedback.invalidUrl": "Lütfen geçerli bir YouTube ya da Spotify bağlantısı girin.",
    "alarm.feedback.providerFallback": "{provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor.",
```

Replace with:

```js
    "alarm.feedback.enterUrl": "Lütfen bir bağlantı girin.",
    "alarm.feedback.invalidUrl": "Bu geçerli bir bağlantıya benzemiyor.",
    "alarm.feedback.wrongServiceLink": "Bu bir {provider} bağlantısına benziyor — bunun yerine {provider} bölümünü kullanın.",
    "alarm.feedback.providerFallback": "{provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor.",
```

If the exact surrounding lines in the `tr` block don't match verbatim (translations may have drifted slightly from the `en` wording this plan assumes), locate the same four keys by name (`alarm.localSectionLabel` through `alarm.spotifySectionLabel`, and separately `alarm.feedback.enterUrl` through `alarm.feedback.providerFallback`) and apply the equivalent edit — the key names and structure are what matters, not exact whitespace.

- [ ] **Step 11: Verify manually**

Run: `npm start`. Open the Alarm Sound modal.

1. Confirm three collapsible sections (Local / YouTube / Spotify), each with an icon — Local shows the folder glyph, YouTube shows the real red YouTube mark, Spotify shows the real green Spotify mark.
2. Confirm Local is open by default; clicking YouTube's header opens it and closes Local; clicking the already-open section's header does nothing (doesn't collapse to zero open sections).
3. Paste a YouTube link into the Spotify section's URL box. Expected: inline error "That looks like a YouTube link — use the YouTube section instead." and no load attempt.
4. Paste a real YouTube link into the YouTube box. Expected: loads successfully, the current-alarm row at the top shows the YouTube icon.
5. Choose a local file via "Choose file…". Expected: current-alarm row shows the folder icon.
6. With no Spotify session, confirm the Spotify section shows only "Connect Spotify" — no URL box. Connect, confirm the URL box appears.
7. Switch the app language (if a language toggle is present) and confirm the new section labels/hints translate correctly in both `en` and `tr`.

- [ ] **Step 12: Commit**

```bash
git add index.html assets/icons/spotify.svg assets/icons/youtube.svg js/alarmModal.js css/styles.css js/i18n/translations.js
git commit -m "feat: restructure Alarm Sound modal into an accordion with brand icons and per-service URL fields"
```

---

### Task 4: Local section — drag-and-drop zone and recent-files list

**Files:**
- Modify: `index.html` (Local section body from Task 3)
- Modify: `js/alarmModal.js` (drop handlers, recent-list rendering, reset-to-default)
- Modify: `css/styles.css` (dropzone + recent-list styles)
- Modify: `js/i18n/translations.js` (new keys, `en` + `tr`)

**Interfaces:**
- Consumes: `addRecentPath`, `loadRecentPaths`, `saveRecentPaths` from `js/alarm/recentAlarms.js` (Task 2).
- Consumes: `window.electronAPI.getPathForFile`, `.alarmCheckPathsExist`, `.alarmUseLocalPath` (Task 1).
- Produces: no new exports — internal to `js/alarmModal.js`.

- [ ] **Step 1: Add the drop zone and recent list to the Local section body in `index.html`**

Find:

```html
                <div class="alarm-section-body" id="localSectionBody">
                    <button type="button" id="chooseAlarmBtn" class="btn-primary" data-i18n="alarm.chooseFile">Choose file…</button>
                </div>
```

Replace with:

```html
                <div class="alarm-section-body" id="localSectionBody">
                    <div class="alarm-dropzone" id="alarmDropzone">
                        <span data-i18n="alarm.dropHint">Drag an audio file here, or</span>
                        <button type="button" id="chooseAlarmBtn" class="btn-primary" data-i18n="alarm.chooseFile">Choose file…</button>
                    </div>
                    <p class="alarm-section-label" data-i18n="alarm.recentLabel">Recent</p>
                    <ul class="alarm-recent-list" id="alarmRecentList"></ul>
                    <button type="button" class="btn-subtle alarm-reset-default" id="alarmResetDefaultBtn" data-i18n="alarm.resetDefault">Reset to default</button>
                </div>
```

- [ ] **Step 2: Import the recent-alarms module and add renderer state in `js/alarmModal.js`**

Find:

```js
import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import { createLogger } from "../lib/logger.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";
```

Replace with:

```js
import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import { addRecentPath, loadRecentPaths, saveRecentPaths } from "./alarm/recentAlarms.js";
import { createLogger } from "../lib/logger.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";
```

Find:

```js
const DEFAULT_ALARM = "assets/alarm.mp3";
```

Replace with:

```js
const DEFAULT_ALARM = "assets/alarm.mp3";
// Mirrors LOCAL_AUDIO_EXTENSIONS in lib/localServer.js — duplicated because
// the renderer can't import a main-process module; keep both lists in sync
// if the supported formats ever change.
const SUPPORTED_LOCAL_EXTENSIONS = [".mp3", ".wav", ".ogg"];
```

Find (inside the `DOMContentLoaded` handler, after the `localSectionIcon` lookup added in Task 3):

```js
  if (localSectionIcon) localSectionIcon.innerHTML = FOLDER_ICON_SVG;
```

Replace with:

```js
  if (localSectionIcon) localSectionIcon.innerHTML = FOLDER_ICON_SVG;

  const alarmDropzone = document.getElementById("alarmDropzone");
  const alarmRecentList = document.getElementById("alarmRecentList");
  const alarmResetDefaultBtn = document.getElementById("alarmResetDefaultBtn");

  let recentPaths = loadRecentPaths();
```

- [ ] **Step 3: Add `applyLocalFile`, `renderRecentList`, and `resetToDefault`**

Find (this is the local-file-picker click handler, already touched in Task 3 Step 6 — find it by its full current body):

```js
  // ── Local dosya seç ───────────────────────────────────────
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        showFeedback(t("alarm.feedback.noFileSelected"), "error");
        return;
      }

      const url = toFileUrl(filePath);

      await alarmManager.load(url);
      alarmManager.setFallbackSource(url);

      // Ham path'i kaydet (file:// olmadan) — initialize doğru tespit etsin
      localStorage.setItem("selectedAlarmPath", filePath);

      usingDefaultAlarm = false;
      updateCurrentFile(getFileName(filePath));
      updateCurrentIcon("local");
      resetPreviewBtn();
      showFeedback(
        format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
        "success",
      );
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
    }
  });
```

Replace with:

```js
  // ── Local dosya: paylaşılan uygulama mantığı ──────────────
  // Used by the file-picker button, drag-and-drop, and clicking a "Recent"
  // entry — all three converge here so allowlist registration, current-file
  // display, and the recent-list update stay in exactly one place.
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

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    return true;
  }

  async function renderRecentList() {
    if (!alarmRecentList) return;

    if (recentPaths.length === 0) {
      alarmRecentList.innerHTML = "";
      return;
    }

    const existsResults = await window.electronAPI.alarmCheckPathsExist(recentPaths);
    const currentPath = localStorage.getItem("selectedAlarmPath");

    alarmRecentList.innerHTML = recentPaths
      .map((p, i) => {
        const exists = existsResults[i];
        const isActive = p === currentPath;
        const classes = ["alarm-recent-item"];
        if (!exists) classes.push("missing");
        if (isActive) classes.push("active");
        const tag = !exists
          ? `<span class="alarm-recent-tag missing">${t("alarm.recentMissing")}</span>`
          : isActive
            ? `<span class="alarm-recent-tag">${t("alarm.recentActive")}</span>`
            : "";
        return `<li class="${classes.join(" ")}" data-path="${encodeURIComponent(p)}">
          <span class="alarm-recent-name">${getFileName(p)}</span>
          ${tag}
        </li>`;
      })
      .join("");

    alarmRecentList.querySelectorAll(".alarm-recent-item:not(.missing)").forEach(item => {
      item.addEventListener("click", () => {
        applyLocalFile(decodeURIComponent(item.dataset.path));
      });
    });
  }

  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
  }

  // ── Local dosya seç ───────────────────────────────────────
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
          format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
          "success",
        );
      }
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
    }
  });

  if (alarmResetDefaultBtn) {
    alarmResetDefaultBtn.addEventListener("click", resetToDefault);
  }

  if (alarmDropzone) {
    alarmDropzone.addEventListener("dragover", e => {
      e.preventDefault();
      alarmDropzone.classList.add("dragover");
    });

    alarmDropzone.addEventListener("dragleave", () => {
      alarmDropzone.classList.remove("dragover");
    });

    alarmDropzone.addEventListener("drop", async e => {
      e.preventDefault();
      alarmDropzone.classList.remove("dragover");

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const filePath = window.electronAPI.getPathForFile(file);
      const ext = "." + (filePath.split(".").pop() || "").toLowerCase();
      if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
        showFeedback(t("alarm.feedback.unsupportedFile"), "error");
        return;
      }

      const applied = await applyLocalFile(filePath);
      if (applied) {
        showFeedback(
          format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
          "success",
        );
      }
    });
  }

  await renderRecentList();
```

Note the `get-file-path` dialog handler (main process, Task 1) already filters to `.mp3`/`.wav`/`.ogg` via its `dialog.showOpenDialog` `filters` option, so `chooseAlarmBtn`'s path never needs the client-side extension check the drop handler needs — a dropped file has no such filter applied by the OS.

- [ ] **Step 4: Re-render the recent list on language change**

Find:

```js
  onLanguageChange(() => {
    if (!isPreviewing) resetPreviewBtn();
    updateSpotifyAuthUI();
    if (usingDefaultAlarm) updateCurrentFile(t("alarm.defaultFile"));
  });
```

Replace with:

```js
  onLanguageChange(() => {
    if (!isPreviewing) resetPreviewBtn();
    updateSpotifyAuthUI();
    if (usingDefaultAlarm) updateCurrentFile(t("alarm.defaultFile"));
    renderRecentList();
  });
```

- [ ] **Step 5: Add dropzone/recent-list styles to `css/styles.css`**

Append to the end of the file:

```css
/* ── Local alarm: drop zone + recent list ───────────────────── */
.alarm-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  padding: var(--sp-4);
  border: 1px dashed var(--modal-border);
  border-radius: var(--radius-sm);
  text-align: center;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}

.alarm-dropzone.dragover {
  border-color: var(--accent);
  background: var(--accent-dim);
}

.alarm-recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.alarm-recent-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  transition: background-color var(--dur-fast) var(--ease-out);
}

.alarm-recent-item:hover {
  background: var(--surface-alt);
}

.alarm-recent-item.missing {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.alarm-recent-item.active {
  border-color: var(--accent);
}

.alarm-recent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: var(--ink);
}

.alarm-recent-tag {
  font-family: var(--font-ui);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  flex-shrink: 0;
}

.alarm-recent-tag.missing {
  color: var(--danger);
}

.alarm-reset-default {
  align-self: flex-start;
}
```

- [ ] **Step 6: Add i18n keys**

In `js/i18n/translations.js`, `en` block, find (the keys added in Task 3, Step 10):

```js
    "alarm.feedback.wrongServiceLink": "That looks like a {provider} link — use the {provider} section instead.",
    "alarm.feedback.providerFallback": "{provider} unavailable. Using local alarm as fallback.",
```

Replace with:

```js
    "alarm.feedback.wrongServiceLink": "That looks like a {provider} link — use the {provider} section instead.",
    "alarm.feedback.unsupportedFile": "That file type isn't supported. Use .mp3, .wav, or .ogg.",
    "alarm.feedback.providerFallback": "{provider} unavailable. Using local alarm as fallback.",
```

Find:

```js
    "alarm.chooseFile": "Choose file…",
    "alarm.youtubeSectionLabel": "YouTube",
```

Replace with:

```js
    "alarm.chooseFile": "Choose file…",
    "alarm.dropHint": "Drag an audio file here, or",
    "alarm.recentLabel": "Recent",
    "alarm.recentActive": "active",
    "alarm.recentMissing": "missing",
    "alarm.resetDefault": "Reset to default",
    "alarm.youtubeSectionLabel": "YouTube",
```

Now the `tr` block. Find:

```js
    "alarm.feedback.wrongServiceLink": "Bu bir {provider} bağlantısına benziyor — bunun yerine {provider} bölümünü kullanın.",
    "alarm.feedback.providerFallback": "{provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor.",
```

Replace with:

```js
    "alarm.feedback.wrongServiceLink": "Bu bir {provider} bağlantısına benziyor — bunun yerine {provider} bölümünü kullanın.",
    "alarm.feedback.unsupportedFile": "Bu dosya türü desteklenmiyor. .mp3, .wav veya .ogg kullanın.",
    "alarm.feedback.providerFallback": "{provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor.",
```

Find:

```js
    "alarm.chooseFile": "Dosya seç…",
    "alarm.youtubeSectionLabel": "YouTube",
```

Replace with:

```js
    "alarm.chooseFile": "Dosya seç…",
    "alarm.dropHint": "Bir ses dosyasını buraya sürükleyin veya",
    "alarm.recentLabel": "Son kullanılanlar",
    "alarm.recentActive": "aktif",
    "alarm.recentMissing": "eksik",
    "alarm.resetDefault": "Varsayılana döndür",
    "alarm.youtubeSectionLabel": "YouTube",
```

As in Task 3 Step 10, if the `tr` block's surrounding lines don't match verbatim, locate by key name instead.

- [ ] **Step 7: Verify manually**

Run: `npm start`. Open the Alarm Sound modal, Local section (open by default).

1. Choose a file via "Choose file…". Confirm it appears at the top of "Recent" marked "active".
2. Choose a second, different file. Confirm "Recent" now has 2 entries, newest first.
3. Drag an audio file from Explorer onto the drop zone. Confirm it loads and appears in "Recent" (converges on the same logic as the button).
4. Click an older "Recent" entry. Confirm it becomes the current alarm again (no file-picker dialog), and its own "active" tag moves to it.
5. In Explorer, rename or delete a file that's in "Recent". Close and reopen the modal. Confirm that entry is grayed out with a "missing" tag and clicking it does nothing.
6. Click "Reset to default". Confirm the current alarm becomes `alarm.mp3 (default)` and no new "default" entry appears in "Recent".
7. Repeat step 1 six times with six different files. Confirm the list never exceeds 5 entries (the oldest drops off).
8. Drag a non-audio file (e.g. a `.txt`) onto the drop zone. Confirm an inline error and no load attempt.

- [ ] **Step 8: Commit**

```bash
git add index.html js/alarmModal.js js/alarm/recentAlarms.js css/styles.css js/i18n/translations.js
git commit -m "feat: add drag-and-drop and a recent-files list to the Local alarm section"
```
