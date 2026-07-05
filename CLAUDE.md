# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the app (electron .)
npm run build       # Clean dist/ and package with electron-builder
npm run dist         # Clean dist/ and build a Windows x64 installer (nsis)
npm run clean        # Remove dist/
```

There is no test suite configured (`npm test` is a stub that exits with an error) and no lint script — don't assume either exists.

## Architecture

Electron desktop app, vanilla JS ES modules throughout (no framework, no bundler, no TypeScript). `package.json` has `"type": "module"`, so every `.js` file is ESM by default.

### Process split
- `main.js` — Electron main process (Node.js). Owns windows, tray, electron-store, the local HTTP server, and all Spotify OAuth/token exchange (client secret never leaves this process).
- `preload.cjs` — contextBridge bridge, exposes `window.electronAPI`. **Must stay `.cjs`**: it needs `require("electron")`, and the `type: module` setting in package.json would otherwise force it to be parsed as ESM.
- `js/` — renderer code (runs in Chromium, loaded via `index.html`/`mini.html`).

### Local HTTP server (main.js)
The renderer is served from `http://127.0.0.1:<dynamic-port>/index.html`, not `file://`. This is required because the YouTube IFrame Player API uses `postMessage` between the parent window and the iframe, which needs a real HTTP origin — `file://` doesn't work as a postMessage origin. `startLocalServer()` spins up a plain `http.createServer` on port 0 (OS-assigned) before `createWindow()` runs.

### Timer tick loop
Both `js/logic/Timer.js` and `js/logic/IntervalTimer.js` use `setInterval(..., 200)`, not `requestAnimationFrame`. rAF stops firing when the window is backgrounded/minimized, which froze the timer. This is paired with:
- `app.commandLine.appendSwitch("disable-background-timer-throttling")` / `"disable-renderer-backgrounding"` in `main.js`
- `backgroundThrottling: false` on every `BrowserWindow`'s `webPreferences`
- `powerSaveBlocker.start("prevent-app-suspension")` while the app is running

Each `logic/*.js` class is pure timer state machine (elapsed-time based, not tick-count based, so it self-corrects after throttling); the matching `js/timer.js` / `js/intervalTimer.js` is the DOM-facing controller that wires it to buttons and views.

### Alarm provider architecture (`js/alarm/`)
Strategy/factory pattern so new sound sources can be added without touching callers:
- `providers/BaseAlarmProvider.js` — interface contract (`load`, `play`, `stop`, `isReady`)
- `providers/LocalAlarmProvider.js`, `YouTubeAlarmProvider.js`, `SpotifyAlarmProvider.js` — implementations
- `AlarmProviderFactory.js` — `detect(source)` sniffs local path vs YouTube URL/ID vs Spotify URI, `createFromSource()` builds the right provider
- `AlarmManager.js` — the only thing other code should import (`export const alarmManager`, singleton — never construct `new AlarmManager()` elsewhere). Handles fallback-to-local on provider load/play failure, and Spotify token refresh.

Call convention: `initialize()`/`load()` are setup-time only; `play(duration)` is the only thing phase-change handlers should call. Calling `load()`/`initialize()` from `onPhaseChange` re-triggers provider setup on every tick transition.

**Spotify status**: Web Playback SDK does not work in stock Electron (no Widevine CDM → "no supported keysystem"), so full-track playback is disabled — `AlarmManager._buildSpotifyOpts()` always requests a Client Credentials token and only ever gets 30s preview clips (and many tracks have no `preview_url`, so this is unreliable). The user-login Authorization Code flow (`spotify:login`/`spotify:refresh` IPC handlers, full main.js implementation) exists and issues real tokens, but `AlarmManager` doesn't currently ask for them — that code path is commented out in `AlarmManager.js`. Client ID/secret are loaded from the gitignored `spotify-credentials.json` (see `spotify-credentials.example.json` for the shape); the secret is never sent to the renderer.

### Mini window (always-on-top)
Frameless, non-resizable `BrowserWindow` (`mini.html`/`js/mini.js`) toggled via `set-always-on-top` IPC. Dragging uses native `-webkit-app-region: drag` (no JS drag handling). State flows one-way per direction:
- Renderer → mini: every `onTick`/`setStatus()` call in the active tab controller calls `broadcastTimerState()` (`js/renderer.js`) → `timer-state` IPC → mini window.
- Mini → renderer: button clicks send `mini-action` IPC; `js/renderer.js` maps the action to the currently active tab's button ID and clicks it (so mini never duplicates timer logic).
- On mini open, main window sends a state snapshot via the `request-interval-snapshot`/`request-timer-snapshot` custom events so the mini isn't blank until the next tick.

### Presets
Persisted with `electron-store` (`timer-config.json`), not localStorage — main process owns the data, IPC-only access (`presets:get-all/get-active/save/delete/set-active`). Three seeded default presets are not deletable by convention; user presets capped at `MAX_PRESETS = 20` (enforced in `main.js`, not the renderer). UI is a floating dropdown (`js/presets.js`) rather than being inlined into the settings modal, so it doesn't inflate the main container.

### Adding a new alarm source
1. New file in `js/alarm/providers/` implementing the `BaseAlarmProvider` contract.
2. Register it in `AlarmProviderFactory._registry` and extend `detect()`.
3. Nothing else changes — `AlarmManager` is source-agnostic.
