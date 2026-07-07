# Real Quit Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible "Quit" button to the main window's top bar that fully exits the app, with a confirmation prompt if a timer is running or paused.

**Architecture:** A new `app:quit` IPC round-trip (renderer → main) reuses the exact same quit path the tray menu's "Quit" item already takes (`isQuitting = true; app.quit();`), extracted into a shared `quitApp()` function in `main.js`. The renderer checks both timer views' status text before calling it, gating on a native `window.confirm()` only when a timer is active.

**Tech Stack:** Electron IPC (`ipcMain.handle` / `contextBridge` / `ipcRenderer.invoke`), vanilla DOM, no test framework (this project has none — see Global Constraints).

## Global Constraints

- No automated test suite exists in this project (`npm test` is a stub — see `CLAUDE.md`). All verification steps in this plan are manual: run the app and observe behavior.
- **Sandbox trap:** `ELECTRON_RUN_AS_NODE=1` is set in this environment's shell. Launching the app for manual verification from a tool call MUST be prefixed with `env -u ELECTRON_RUN_AS_NODE`, e.g. `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .` — otherwise Electron boots as plain Node and `app`/`BrowserWindow` silently resolve to `undefined`.
- Before any manual launch, check `Get-Process -Name "interval-timer"` / `electron` and close any already-running instance first — a previous build's process can lock files or make it look like your change isn't taking effect.
- Match existing code style: no semicolon-less code, no added abstraction beyond what's specified below, Turkish inline comments are used throughout this codebase for non-obvious rationale (existing convention — new comments in this plan follow English per the file's most recent additions, either is acceptable, don't convert existing comments).

---

## File Structure

- **Modify `main.js`**: extract `quitApp()`, add `ipcMain.handle("app:quit", ...)`.
- **Modify `preload.cjs`**: expose `quitApp()` on `window.electronAPI`.
- **Modify `index.html`**: add `#quitAppBtn` button markup inside `.modal-buttons`.
- **Modify `css/styles.css`**: add `--danger`/`--danger-dim` tokens and `.quit-btn` styling.
- **Modify `js/renderer.js`**: wire `#quitAppBtn`'s click handler.

---

### Task 1: IPC plumbing — `quitApp()` in main, exposed via preload

**Files:**
- Modify: `main.js:343` (insert function before the `// ── Tray ──` comment), `main.js:364-370` (tray menu item), `main.js:420-421` (insert new IPC handler)
- Modify: `preload.cjs:3-4` (insert exposed method)

**Interfaces:**
- Produces: `window.electronAPI.quitApp(): Promise<void>` — invoking it fully quits the app (same effect as today's tray "Quit").

- [ ] **Step 1: Extract `quitApp()` and reuse it from the tray menu**

In `main.js`, insert this function immediately before the `// ── Tray ──────...` comment currently at line 343:

```js
// ── Quit ──────────────────────────────────────────────────────
function quitApp() {
  isQuitting = true;
  app.quit();
}

```

Then replace the tray menu's inline "Quit" handler (`main.js:364-370`):

```js
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
```

with:

```js
    {
      label: "Quit",
      click: quitApp,
    },
```

- [ ] **Step 2: Add the `app:quit` IPC handler**

In `main.js`, immediately after the `get-file-path` handler block (ends at line 420 with `});`), before the `// ── Always on Top / Mini IPC ──` comment (line 422), insert:

```js

// ── Quit IPC ────────────────────────────────────────────────
ipcMain.handle("app:quit", () => quitApp());
```

- [ ] **Step 3: Expose `quitApp` in the preload bridge**

In `preload.cjs`, the file currently starts:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Dosya
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
```

Add a new entry right after `exposeInMainWorld("electronAPI", {`:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  quitApp: () => ipcRenderer.invoke("app:quit"),

  // Dosya
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
```

- [ ] **Step 4: Verify the IPC path manually, end to end, before wiring any UI**

First check nothing is already running (a locked previous build will make this test misleading):

Run: `Get-Process -Name "interval-timer" -ErrorAction SilentlyContinue`
Expected: no output (nothing running). If output appears, close it: `Get-Process -Name "interval-timer" | Stop-Process -Force`

Launch the app in dev mode:

Run: `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .`
Expected: the main window opens, tray icon appears.

With the window focused, open DevTools (`Ctrl+Shift+I` or `F12`), go to the Console tab, and run:

```js
window.electronAPI.quitApp
```

Expected: logs as a function (not `undefined`) — confirms `preload.cjs` exposed it correctly.

Then run:

```js
window.electronAPI.quitApp()
```

Expected: the main window closes, the tray icon disappears, and the process exits completely (confirm with `Get-Process -Name "interval-timer" -ErrorAction SilentlyContinue` in a terminal — no output). This is the same behavior as today's tray-menu "Quit", just triggered from the renderer instead.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.cjs
git commit -m "Add app:quit IPC handler, extract shared quitApp()"
```

---

### Task 2: Quit button markup and styling

**Files:**
- Modify: `index.html:48-50` (insert button after `alwaysOnTopBtn`)
- Modify: `css/styles.css:29` (insert danger color tokens), `css/styles.css:216` (insert `.quit-btn` rules after `.icon-btn:focus-visible`)

**Interfaces:**
- Produces: DOM element `#quitAppBtn` (a `<button>`, visually distinct, no click behavior yet — wired in Task 3).
- Consumes: existing `--sp-*`, `--text-sm`, `--font-ui`, `--border-hover`, `--dur-fast`, `--ease-out`, `--radius-sm` tokens already defined in `css/styles.css`.

- [ ] **Step 1: Add the button markup**

In `index.html`, the `.modal-buttons` div currently ends with:

```html
            <button id="alwaysOnTopBtn" class="icon-btn" aria-label="Pin window on top" aria-pressed="false">
                <img src="assets/pinned.png" alt="" class="icon-img" />
            </button>

        </div>
```

Change it to:

```html
            <button id="alwaysOnTopBtn" class="icon-btn" aria-label="Pin window on top" aria-pressed="false">
                <img src="assets/pinned.png" alt="" class="icon-img" />
            </button>
            <button id="quitAppBtn" class="icon-btn quit-btn" aria-label="Quit application">
                ⏻ Quit
            </button>

        </div>
```

(The `⏻ Quit` glyph-plus-label pattern matches the existing `▶ Preview` button in the alarm modal — no new image asset needed.)

- [ ] **Step 2: Add danger color tokens**

In `css/styles.css`, the `:root` block currently has, at line 29:

```css
  --accent-b: #ee0979;
```

Add right after it:

```css
  --accent-b: #ee0979;
  --danger: #ff4d4f;
  --danger-dim: #ff4d4f22;
```

- [ ] **Step 3: Style `.quit-btn` as visually distinct from the icon-btn cluster**

In `css/styles.css`, immediately after the `.icon-btn:focus-visible` block (currently lines 213-216):

```css
.icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

insert:

```css

.quit-btn {
  margin-left: var(--sp-3);
  padding-left: var(--sp-3);
  border-left: 1px solid #333;
  border-radius: 0;
  width: auto;
  gap: var(--sp-1);
  color: var(--danger);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 600;
}

.quit-btn:hover {
  color: var(--danger);
  background-color: var(--danger-dim);
  border-color: var(--border-hover);
}
```

- [ ] **Step 4: Verify visually**

Close any running instance first:

Run: `Get-Process -Name "interval-timer" -ErrorAction SilentlyContinue | Stop-Process -Force`

Launch the app:

Run: `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .`

Expected: a "⏻ Quit" button is visible at the far right of the top bar, separated from the settings/alarm/pin icon buttons by a thin vertical divider, rendered in red/danger color. Hovering it shows a red-tinted background. Clicking it does nothing yet (no handler wired until Task 3) — confirm it's inert at this point.

Close the app window via the tray icon's "Quit" (not the new button) when done checking.

- [ ] **Step 5: Commit**

```bash
git add index.html css/styles.css
git commit -m "Add quit button markup and danger styling to top bar"
```

---

### Task 3: Wire the click handler with the running-timer confirmation

**Files:**
- Modify: `js/renderer.js:145` (insert new block after the `aotBtn` always-on-top wiring, before the `// ── Timer state → mini window yayını ──` comment)

**Interfaces:**
- Consumes: `window.electronAPI.quitApp(): Promise<void>` (Task 1), `#quitAppBtn` (Task 2), `#intervalStatus` / `#timerStatus` elements (existing — text content set by `js/intervalTimer.js`'s and `js/timer.js`'s `setStatus()`, values `"Status: Ready"` / `"Status: Running"` / `"Status: Paused"` / `"Status: Completed"` / `"Status: Stopped"`).

- [ ] **Step 1: Add the click handler**

In `js/renderer.js`, the always-on-top block currently ends at line 145 with:

```js
const aotBtn = document.getElementById("alwaysOnTopBtn");
if (aotBtn) {
  aotBtn.addEventListener("click", () => {
    alwaysOnTop = !alwaysOnTop;
    window.electronAPI.setAlwaysOnTop(alwaysOnTop);
    aotBtn.classList.toggle("active", alwaysOnTop);
    aotBtn.setAttribute("aria-pressed", alwaysOnTop);
    aotBtn.setAttribute(
      "aria-label",
      alwaysOnTop ? "Unpin window" : "Pin window on top",
    );
  });
}
```

Insert immediately after that closing `}`:

```js

// ── Quit ───────────────────────────────────────────────────────
document.getElementById("quitAppBtn").onclick = () => {
  const intervalStatus =
    document.getElementById("intervalStatus")?.textContent ?? "";
  const timerStatus =
    document.getElementById("timerStatus")?.textContent ?? "";
  const isTimerActive = [intervalStatus, timerStatus].some(
    text => text.includes("Running") || text.includes("Paused"),
  );

  if (isTimerActive) {
    const confirmed = window.confirm(
      "A timer is currently running. Quit anyway?",
    );
    if (!confirmed) return;
  }

  window.electronAPI.quitApp();
};
```

- [ ] **Step 2: Verify — idle state quits immediately**

Close any running instance, then launch:

Run: `Get-Process -Name "interval-timer" -ErrorAction SilentlyContinue | Stop-Process -Force`
Run: `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .`

With both timers untouched (idle/"Ready" state, the default on launch), click the "⏻ Quit" button.

Expected: no dialog appears, the app closes immediately (window gone, tray icon gone).

- [ ] **Step 3: Verify — running interval timer prompts, Cancel keeps the app open**

Launch again: `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .`

On the "Interval Timer" tab, click "Start" (with default 25/5 minute values — no need to wait for it to actually elapse). Confirm the status shows "Status: Running". Click "⏻ Quit".

Expected: a native confirmation dialog appears with text "A timer is currently running. Quit anyway?". Click **Cancel**.

Expected: dialog closes, app window is still open, timer is still running.

- [ ] **Step 4: Verify — confirming the dialog quits**

With the same still-running app from Step 3, click "⏻ Quit" again, then click **OK** in the dialog.

Expected: the app closes completely (window gone, tray icon gone).

Run: `Get-Process -Name "interval-timer" -ErrorAction SilentlyContinue`
Expected: no output.

- [ ] **Step 5: Verify — paused countdown timer also prompts**

Launch again: `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" .`

Switch to the "Timer" tab, set a duration, click "Start", then click "Pause". Confirm status shows "Status: Paused". Click "⏻ Quit".

Expected: same confirmation dialog as Step 3 appears (paused counts as active, not just running). Click **OK** to close out.

- [ ] **Step 6: Commit**

```bash
git add js/renderer.js
git commit -m "Wire quit button with running-timer confirmation"
```

---

## Post-plan note

This plan does not rebuild the release installer or touch `dist/`. After these three tasks land, the existing `npm run dist` step (already documented in prior conversation) needs to be re-run before cutting the `v1.0.0` GitHub Release, so the shipped installer includes the quit button.
