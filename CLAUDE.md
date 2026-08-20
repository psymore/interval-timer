# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session continuity: the `FOLLOWUP` keyword

When the user's message is just `FOLLOWUP` (case-insensitive, nothing else needed), read `docs/superpowers/FOLLOWUP.md` in full and act on its "Where we left off" / "Likely next steps" sections immediately — don't ask what to do, pick up the work it describes. Treat that file as the authoritative session-handoff note, more current than anything else in this repo about "what's in progress right now."

Keep `docs/superpowers/FOLLOWUP.md` up to date: whenever the user asks for a followup/handoff summary, or a natural stopping point is reached after a substantial piece of work, overwrite it with a fresh summary, what's open, and likely next steps — don't append, replace the whole file each time so it never goes stale or grows unbounded.

## Commands

```bash
npm start          # Run the app (electron .)
npm run build       # Clean dist/ and package with electron-builder
npm run dist         # Clean dist/ and build a Windows x64 installer (nsis)
npm run clean        # Remove dist/
```

These commands are unchanged and still run from the repo root, but now delegate into `packages/electron` (an npm workspace) — `electron-builder`'s output lands in `packages/electron/dist/`, not a root `dist/` (no `directories.output` override was added, so it uses electron-builder's default of "relative to the package.json that defines the build config").

There is no test suite configured (`npm test` is a stub that exits with an error) and no lint script — don't assume either exists.

## Architecture

Electron desktop app **and** an installable PWA, sharing one
platform-agnostic renderer, in an npm-workspaces monorepo (vanilla JS ES
modules throughout — no framework, no bundler, no TypeScript). Every
`package.json` in this repo has `"type": "module"`, so every `.js` file is
ESM by default. See `packages/pwa/` below for what makes the PWA real
(manifest, service worker, `window.electronAPI` backed by
localStorage/IndexedDB) rather than just a static demo.

### Packages

- `packages/core/` — the platform-agnostic renderer: `index.html`, `js/**`,
  `css/**`, `assets/**`, and its own copy of `lib/logger.js`. Runs
  unmodified in Electron (served live by the local HTTP server), in the
  GitHub Pages demo (`docs/app/`, a generated copy), and in the deployed
  PWA (`docs/pwa/`, also a generated copy) — see "Sync scripts" below for
  how those copies stay in sync. Nothing in this package may import
  anything from `packages/electron`.
- `packages/electron/` — the Electron main process: `main.js`,
  `preload.cjs` (**must stay `.cjs`**: it needs `require("electron")`, and
  the repo-wide `"type": "module"` setting would otherwise force it to be
  parsed as ESM), `lib/` (main-process-only modules, plus its own
  independent copy of `lib/logger.js` — deliberately not shared with
  `packages/core`'s copy; a cross-package import here would resolve
  differently in dev vs. a packaged build, since packaging copies
  `packages/core` into a nested `core/` subfolder rather than leaving it as
  a sibling), `build/` (installer icon), and the gitignored
  `spotify-credentials.json`.
- `packages/pwa/` — a real, installable, persistent PWA sharing
  `packages/core`'s renderer: `manifest.json`, `service-worker.js`,
  `platform/` (its `window.electronAPI` implementation and local-alarm
  strategy — see the platform-detection and alarm-strategy notes below),
  `icons/`, and `scripts/build.mjs` (run via `npm run sync:pwa`, produces
  `docs/pwa/`, deployed to GitHub Pages alongside the demo). Unlike the
  `?demo=1` GitHub Pages demo, its `window.electronAPI` is real and
  persistent: presets/language survive reloads via `localStorage`, and
  local alarm files survive via IndexedDB blobs (see
  `platform/localBlobStrategy.js`). Spotify is out of scope — see the
  Spotify note below.

### Local HTTP server (main.js)

The renderer is served from `http://127.0.0.1:<dynamic-port>/index.html`,
not `file://`. This is required because the YouTube IFrame Player API uses
`postMessage` between the parent window and the iframe, which needs a real
HTTP origin — `file://` doesn't work as a postMessage origin.
`startLocalServer()` spins up a plain `http.createServer` on port 0
(OS-assigned) before `createWindow()` runs, serving `packages/core`
directly in dev. `main.js` computes this root (`coreRoot`) differently
depending on `app.isPackaged`: a sibling `../core` in dev, or a nested
`core/` subfolder in a packaged build (copied in by
`packages/electron/scripts/sync-core.mjs` before `electron-builder` runs,
since `electron-builder`'s file globbing can't reach a sibling package).

### Sync scripts

`packages/core` has no build step — it's plain static files — but three
things need their own real copy of it rather than a live reference:
`electron-builder` packaging (`packages/electron/core/`, gitignored,
regenerated by `packages/electron/scripts/sync-core.mjs` before every
`npm run build`/`npm run dist`), the GitHub Pages demo (`docs/app/`,
regenerated by `npm run sync:demo`), and the deployed PWA (`docs/pwa/`,
regenerated by `npm run sync:pwa`, which also copies
`packages/pwa`'s own `manifest.json`/`platform/`/`icons/` and writes a
build-stamped `service-worker.js` — see `packages/pwa/scripts/build.mjs`).
All three call the same `scripts/lib/syncCore.mjs#syncCoreInto(destDir)`
helper for the `packages/core` portion. None of the three destination
directories should ever be hand-edited — re-run the relevant sync command
instead.

`packages/pwa/scripts/build.mjs` deliberately does **not** copy
`service-worker.js` byte-for-byte: it stamps `CACHE_NAME` with the current
build timestamp before writing it to `docs/pwa/`. A literal copy would
never trip the browser's service-worker update check (same bytes in means
no `install`/`activate` re-fire, means the cache never gets purged), so
every deploy needs the file's bytes to actually change.

`docs/app/index.html` (the demo) has a `<link rel="manifest">` tag
pointing at a `manifest.json` that intentionally does not exist in
`docs/app/` — the browser 404s on it harmlessly. This is deliberate, not
an oversight: adding a real manifest there would make Chrome offer to
install the *demo* itself, and stripping the tag would require build-time
HTML templating, which this project's static-files-only design avoids. Do
not "fix" this by adding `docs/app/manifest.json`.

### Platform detection (`packages/core/js/demo/loader.js`)
A classic (non-module) script — not `type="module"`, and not inlined
either, since `index.html`'s CSP (`script-src 'self' ...`) has no
`'unsafe-inline'` — loaded before any `type="module"` script so
`window.electronAPI` exists by the time their init code touches it.
Branches on three cases, checked in order:
1. `window.electronAPI` already exists — the real `preload.cjs` already
   ran, so this is the real Electron app. Do nothing.
2. `?demo=1` in the URL — the GitHub Pages demo (`docs/app/`); loads
   `js/demo/electron-demo-shim.js`, an in-memory (non-persistent)
   `window.electronAPI` shim.
3. Neither — the deployed PWA (`docs/pwa/`), the only target that reaches
   this branch; loads `platform/electronAPI-web.js` (the real, persistent
   implementation — see the `packages/pwa/` bullet above) and registers
   `service-worker.js`.

`js/demo/isDemoMode.js` (`?demo=1` in the URL) and `js/demo/isPwaMode.js`
(`window.electronAPI?.__platform === "pwa"`, set by
`electronAPI-web.js`) let other renderer code query which of these three
targets it's running in, to hide/adjust native-window-only UI (see
"Adding a new alarm source" below for the analogous alarm-provider seam,
and grep either function's usages for current examples — the Alarm Sound
modal's Spotify section, the settings modal's update-check row, and the
quit/pin topbar buttons).

### Timer tick loop
Both `packages/core/js/logic/Timer.js` and `packages/core/js/logic/IntervalTimer.js` use `setInterval(..., 200)`, not `requestAnimationFrame`. rAF stops firing when the window is backgrounded/minimized, which froze the timer. This is paired with:
- `app.commandLine.appendSwitch("disable-background-timer-throttling")` / `"disable-renderer-backgrounding"` in `packages/electron/main.js`
- `backgroundThrottling: false` on every `BrowserWindow`'s `webPreferences`
- `powerSaveBlocker.start("prevent-app-suspension")` while the app is running

Each `logic/*.js` class is pure timer state machine (elapsed-time based, not tick-count based, so it self-corrects after throttling); the matching `packages/core/js/timer.js` / `packages/core/js/intervalTimer.js` is the DOM-facing controller that wires it to buttons and views.

### Alarm provider architecture (`packages/core/js/alarm/`)
Strategy/factory pattern so new sound sources can be added without touching callers:
- `providers/BaseAlarmProvider.js` — interface contract (`load`, `play`, `stop`, `isReady`)
- `providers/LocalAlarmProvider.js`, `YouTubeAlarmProvider.js`, `SpotifyAlarmProvider.js` — implementations
- `AlarmProviderFactory.js` — `detect(source)` sniffs local path vs YouTube URL/ID vs Spotify URI, `createFromSource()` builds the right provider
- `AlarmManager.js` — the only thing other code should import (`export const alarmManager`, singleton — never construct `new AlarmManager()` elsewhere). Handles fallback-to-local on provider load/play failure, and Spotify token refresh.

Call convention: `initialize()`/`load()` are setup-time only; `play(duration)` is the only thing phase-change handlers should call. Calling `load()`/`initialize()` from `onPhaseChange` re-triggers provider setup on every tick transition.

**Local-file strategy seam** (`packages/core/js/alarm/localSourceAdapter.js`):
Electron resolves a real filesystem path through the native file dialog
and serves it via the local HTTP server's `/local-audio/` route; the PWA
has no filesystem access, so it stores the picked `File` as a Blob (keyed
by filename) in IndexedDB and plays it back via an object URL instead
(`packages/pwa/platform/localBlobStrategy.js`, dynamically imported —
never statically — so `packages/core` stays deployable standalone to
targets with no `platform/` directory at all). `AlarmManager.initialize()`
and `js/alarmModal.js` both go through this one seam rather than
branching on platform themselves. Because the PWA strategy touches
IndexedDB, its calls can reject/throw in ways the old Electron-only code
never could (a missing blob, a quota error) — callers on this seam need
real try/catch around it, not just around the parts that were fallible
before the PWA existed.

**Spotify**: a full Authorization Code login
(`packages/electron/lib/spotifyAuth.js`) — client secret held in the main
process, loopback redirect (`http://127.0.0.1:8888/callback`), tokens
encrypted at rest via `safeStorage`. Playback launches the OS Spotify
desktop app via `shell.openExternal("spotify:track:<id>")` (full track,
not a preview) and syncs pause/resume through the Web API
(`SpotifyAlarmProvider.js`) — pausing requires Spotify **Premium**; free
accounts silently fail to pause and the track plays until manually
stopped. Client ID/secret are loaded from the gitignored
`packages/electron/spotify-credentials.json` (see
`packages/electron/spotify-credentials.example.json` for the shape); the
secret is never sent to the renderer. Spotify is out of scope for the PWA
(`packages/pwa/`) — there's no main process there to hold a client secret
or broker OAuth; `electronAPI-web.js`'s `spotifyLogin`/`spotifyRefresh`
reject with an explanatory error, and `alarmModal.js` hides the Spotify
section entirely when `isPwaMode()` is true.

### Mini window (always-on-top)
Frameless, non-resizable `BrowserWindow` (`packages/core/mini.html`/`packages/core/js/mini.js`) toggled via `set-always-on-top` IPC. Dragging uses native `-webkit-app-region: drag` (no JS drag handling). State flows one-way per direction:
- Renderer → mini: every `onTick`/`setStatus()` call in the active tab controller calls `broadcastTimerState()` (`packages/core/js/renderer.js`) → `timer-state` IPC → mini window.
- Mini → renderer: button clicks send `mini-action` IPC; `packages/core/js/renderer.js` maps the action to the currently active tab's button ID and clicks it (so mini never duplicates timer logic).
- On mini open, main window sends a state snapshot via the `request-interval-snapshot`/`request-timer-snapshot` custom events so the mini isn't blank until the next tick.

### Presets
Persisted with `electron-store` (`timer-config.json`), not localStorage — main process owns the data, IPC-only access (`presets:get-all/get-active/save/delete/set-active`). The three seeded default presets are ordinary presets — editable and deletable like any other; presets capped at `MAX_PRESETS = 20` (enforced in `packages/electron/lib/presetsIpc.js`, not the renderer). The preset trigger shows "+ Add Preset" when the list is empty. UI is a floating dropdown (`packages/core/js/presets.js`) rather than being inlined into the settings modal, so it doesn't inflate the main container. Any real edit to the timer fields auto-forks the active preset into a dedicated `last-session` preset (`packages/core/js/intervalTimer.js`'s `syncLastSessionPreset()`), debounced so unsaved changes are never lost. A `preset-data-changed` window event (distinct from `preset-activated`) tells the preset list/trigger to re-render without switching the active preset or reloading the timer fields — fired whenever preset data changes but nothing should visibly "activate".

### Alarm link health (`packages/core/js/alarm/linkHealth.js`)
Badges a preset's saved YouTube/Spotify link as broken (drives `preset-alarm-health-badge` on the preset picker and the Alarm Sound modal's saved-link lists) by checking the YouTube oEmbed endpoint or the Spotify tracks API. **Local files are not covered** — a preset whose local alarm file has been deleted/moved shows no warning on the preset trigger or picker; the only place it surfaces is the Alarm Sound modal's "Recent" list (`alarmRecentList`), which does its own separate existence check (`alarm:check-paths-exist` IPC) and is easy to miss since it's a few clicks deep. If this needs fixing, extend the same existence check to the active preset's `alarmSource` when it's a local path, not just the Recent list entries.

### Adding a new alarm source
1. New file in `packages/core/js/alarm/providers/` implementing the `BaseAlarmProvider` contract.
2. Register it in `AlarmProviderFactory._registry` and extend `detect()`.
3. Nothing else changes — `AlarmManager` is source-agnostic.
