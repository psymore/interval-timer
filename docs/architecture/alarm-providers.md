# Alarm providers

Read this when: touching alarm sources (local file, YouTube, Spotify), the alarm provider factory/manager, or alarm link-health checks.

## Alarm provider architecture (`packages/core/js/alarm/`)

Strategy/factory pattern so new sound sources can be added without touching callers:
- `providers/BaseAlarmProvider.js` — interface contract (`load`, `play`, `stop`, `isReady`)
- `providers/LocalAlarmProvider.js`, `YouTubeAlarmProvider.js`, `SpotifyAlarmProvider.js` — implementations
- `AlarmProviderFactory.js` — `detect(source)` sniffs local path vs YouTube URL/ID vs Spotify URI, `createFromSource()` builds the right provider
- `AlarmManager.js` — the only thing other code should import (`export const alarmManager`, singleton — never construct `new AlarmManager()` elsewhere). Handles fallback-to-local on provider load/play failure, and Spotify token refresh.

Call convention: `initialize()`/`load()` are setup-time only; `play(duration)` is the only thing phase-change handlers should call. Calling `load()`/`initialize()` from `onPhaseChange` re-triggers provider setup on every tick transition.

## Local-file strategy seam (`packages/core/js/alarm/localSourceAdapter.js`)

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

## Spotify

A full Authorization Code login
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

## Alarm link health (`packages/core/js/alarm/linkHealth.js`)

Badges a preset's saved YouTube/Spotify link as broken (drives `preset-alarm-health-badge` on the preset picker and the Alarm Sound modal's saved-link lists) by checking the YouTube oEmbed endpoint or the Spotify tracks API. **Local files are not covered** — a preset whose local alarm file has been deleted/moved shows no warning on the preset trigger or picker; the only place it surfaces is the Alarm Sound modal's "Recent" list (`alarmRecentList`), which does its own separate existence check (`alarm:check-paths-exist` IPC) and is easy to miss since it's a few clicks deep. If this needs fixing, extend the same existence check to the active preset's `alarmSource` when it's a local path, not just the Recent list entries.

## Adding a new alarm source

1. New file in `packages/core/js/alarm/providers/` implementing the `BaseAlarmProvider` contract.
2. Register it in `AlarmProviderFactory._registry` and extend `detect()`.
3. Nothing else changes — `AlarmManager` is source-agnostic.
