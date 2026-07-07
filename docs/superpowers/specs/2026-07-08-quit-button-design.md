# Real quit button

## Problem

The main window's `[X]` close button doesn't quit the app — `mainWindow.on("close")`
intercepts it and hides to the tray instead (`main.js`, so the app can keep
ticking in the background). The only way to actually exit is the tray icon's
right-click → "Quit" menu item, which isn't discoverable from the main screen.

## Goal

Add a visible "Quit" affordance to the main window that fully exits the app —
same effect as the tray menu's existing Quit — with a confirmation prompt if a
timer is actively running or paused, so a stray click can't silently kill an
in-progress session.

## Design

### UI

A new button in `.top-bar`, appended inside `.modal-buttons` (visually
separated from the existing icon-button cluster via a left border/margin) so
it reads as a distinct, one-way action rather than another toggle. Styled
with a new danger color (red-tinted, hover state intensifies), showing an
icon + "Quit" label rather than an icon-only button like its neighbors.

### Running-timer check

Both the interval and countdown timer views exist in the DOM simultaneously
(`switchTab` only toggles a `hidden` class — see `js/renderer.js`), so the
click handler checks both `#intervalStatus` and `#timerStatus` text content
regardless of which tab is active. If either contains "Running" or "Paused",
a timer is considered active.

### Confirmation

If a timer is active, show a native `window.confirm("A timer is currently
running. Quit anyway?")` before proceeding. Native (not a themed modal
matching `settingsModal`/`alarmFolderModal`) because this fires rarely
(at most once per session) and doesn't justify a third modal's worth of
markup/CSS/focus-trap code — the native dialog's different look is
acceptable, arguably useful, for a rare, high-stakes action. If the user
cancels, do nothing. If no timer is active, or the user confirms, proceed
immediately with no dialog.

### Quitting

`main.js` currently quits only from the tray menu's inline click handler
(`isQuitting = true; app.quit();`). Extract that into a `quitApp()` function,
call it from both the tray menu and a new `ipcMain.handle("app:quit", quitApp)`
handler. `preload.cjs` exposes `quitApp: () => ipcRenderer.invoke("app:quit")`.
The renderer's click handler calls `window.electronAPI.quitApp()` after the
running-timer check passes — this goes through the app's normal quit path
(`before-quit` sets `isQuitting`, `window-all-closed` calls `app.quit()`,
local server/tray/mini window all torn down the same way a tray-menu quit
already works today).

## Files touched

- `index.html` — button markup in `.modal-buttons`
- `css/styles.css` — danger-button styling, divider from the icon-btn group
- `js/renderer.js` — click handler: status check → optional `confirm()` → `electronAPI.quitApp()`
- `preload.cjs` — expose `quitApp`
- `main.js` — extract `quitApp()`, add `ipcMain.handle("app:quit", quitApp)`, reuse from tray menu

## Out of scope

- Quit confirmation from the tray menu or mini window (unchanged, one-click as today).
- A themed/custom confirmation modal (native `confirm()` per above).
- Any change to the existing hide-to-tray behavior of the window's `[X]` button.
