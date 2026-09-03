# Mini window (always-on-top)

Read this when: touching the always-on-top mini window or its IPC contract with the main renderer.

Frameless, non-resizable `BrowserWindow` (`packages/core/mini.html`/`packages/core/js/mini.js`) toggled via `set-always-on-top` IPC. Dragging uses native `-webkit-app-region: drag` (no JS drag handling). State flows one-way per direction:
- Renderer → mini: every `onTick`/`setStatus()` call in the active tab controller calls `broadcastTimerState()` (`packages/core/js/renderer.js`) → `timer-state` IPC → mini window.
- Mini → renderer: button clicks send `mini-action` IPC; `packages/core/js/renderer.js` maps the action to the currently active tab's button ID and clicks it (so mini never duplicates timer logic).
- On mini open, main window sends a state snapshot via the `request-interval-snapshot`/`request-timer-snapshot` custom events so the mini isn't blank until the next tick.
