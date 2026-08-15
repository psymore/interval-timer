# PWA + monorepo, phase 1

First slice of a larger goal: eventually ship this app as Electron desktop +
PWA + native mobile from one codebase. This spec covers only the monorepo
restructure and the PWA. Mobile is out of scope until the PWA has shipped.

## Current state

The renderer (`index.html`, `js/**`, `css/**`, `assets/**`) is already
platform-agnostic in practice — it runs unmodified in a plain browser tab
today via `js/demo/electron-demo-shim.js`, an in-memory fake of
`window.electronAPI` loaded only when `?demo=1` is present
(`js/demo/loader.js`). `scripts/sync-demo-app.mjs` copies that same file set
into `docs/app/` so GitHub Pages can serve it inside an iframe on the
landing page (`docs/index.html`). That demo is preview-only: no
persistence, Spotify/local-file features disabled, by design.

This spec turns that proof-of-concept into a second real platform — a
PWA with actual persistence, installable to a phone home screen — while
restructuring the repo into an npm-workspaces monorepo so Electron and the
PWA share one source of truth instead of two copies drifting apart.

**Correction to `CLAUDE.md`:** its Spotify section describes an old
Client-Credentials/30s-preview implementation. Current production Spotify
(`js/alarm/providers/SpotifyAlarmProvider.js`, `lib/spotifyAuth.js`) is a
full Authorization Code login (client secret in the main process, loopback
redirect, tokens encrypted via `safeStorage`) that launches the OS Spotify
desktop app via `shell.openExternal("spotify:track:<id>")` and syncs
pause/resume through the Web API (requires Premium). `CLAUDE.md` should be
updated to match as a follow-up — not part of this spec.

## Goals

- Real persistence: presets, active preset, language, and uploaded local
  alarm files survive a reload, matching desktop's `electron-store`-backed
  behavior.
- Installable: manifest + service worker, add-to-home-screen on a phone.
- Works offline for the app shell; alarm sources that need network
  (YouTube/Spotify) already have a graceful local fallback via
  `AlarmManager`.
- One source of truth for the shared renderer — a change to `js/timer.js`
  should not need to be hand-copied into a second package.
- Existing GitHub Pages landing page and demo (`docs/index.html`,
  `docs/app/`) keep working exactly as they do today, untouched.

## Package layout

```
interval-timer/
├── package.json              # workspace root: "workspaces": ["packages/*"]
├── packages/
│   ├── core/                  # moved from root: index.html, css/, js/, assets/
│   ├── electron/               # moved from root: main.js, preload.cjs, lib/, build/
│   │   └── package.json        # electron-builder config lives here now
│   └── pwa/                    # new
│       ├── manifest.json, service-worker.js
│       ├── platform/electronAPI-web.js    # real persistence adapter
│       ├── platform/blobStore.js          # small IndexedDB wrapper (alarm uploads)
│       ├── icons/                          # generated 192/512/maskable PNGs
│       └── scripts/build.mjs
├── docs/                       # GitHub Pages — unchanged
│   ├── index.html, app/        # existing landing page + demo mirror, untouched
│   └── pwa/                    # generated: PWA build output deploys here
```

`packages/core` contains nothing Electron- or web-specific: `logic/`,
`views/`, `alarm/` (providers + manager), `i18n/`, `presets.js`,
`renderer.js`, `timer.js`, `intervalTimer.js`, `alarmModal.js`,
`js/demo/**` (the existing demo shim moves here too — it's a preview
concern, not an Electron concern, and `docs/app` still needs it), `css/`,
`assets/`, `index.html`. `lib/logger.js` also moves into `packages/core`
(it's dual-environment-safe and imported directly by renderer code today —
see the existing comment in `scripts/sync-demo-app.mjs`).

`packages/electron` keeps everything main-process-only: `main.js`,
`preload.cjs`, the rest of `lib/` (`localServer.js`, `presetsIpc.js`,
`settingsIpc.js`, `spotifyAuth.js`, `updateChecker.js`, `windows.js`),
`build/icon.ico`.

`mini.html`, `js/mini.js`, and `css/mini.css` stay in `packages/core`
despite being Electron-only in practice (the always-on-top mini window has
no browser-tab equivalent). Two reasons: `mini.html` is loaded via
`BrowserWindow.loadFile()` (`lib/windows.js`), not through the local HTTP
server, so there's no serving conflict either way — but it pulls in
`css/tokens.css` and several shared icon/font assets via plain relative
paths, and splitting it into a sibling package would mean rewriting every
one of those into `../../core/...` chains purely for taxonomic purity, with
real risk of quietly breaking the mini window along the way. Shipping three
small unused files in the PWA/demo builds costs nothing — same tradeoff the
demo shim already makes with its unused Spotify stubs.
`js/timerStateBroadcast.js` stays in `packages/core` too — it's just a thin
wrapper around `electronAPI.sendTimerState()`, called from the shared
`renderer.js`, and already no-ops harmlessly under the demo/PWA shims.

## Code sharing

**Dev / desktop app**: `lib/localServer.js`'s static file server points at
`packages/core` directly (relative path from `packages/electron`) — no
copy step, so editing `packages/core/js/timer.js` takes effect on the next
`npm start` reload immediately, same as today.

**Packaging** (`npm run dist`/`npm run build`): electron-builder's `files`
globbing is scoped to a single package directory and doesn't cleanly
reach sibling packages. Rather than fighting that, a pre-package step
(`packages/electron/scripts/sync-core.mjs`, run before `electron-builder`
in the `build`/`dist` npm scripts) copies `packages/core` into a gitignored
`packages/electron/core/` — same copy-then-package shape the repo already
uses for `docs/app`, just applied to packaging instead of Pages. No
electron-builder config changes needed beyond pointing its existing `files`
patterns at that copied directory.

**PWA and the legacy demo mirror**: both are static deploys (GitHub Pages
has no server-side logic), so both need real copied files. A single
generalized sync helper (extracted from today's `scripts/sync-demo-app.mjs`,
parameterized by target directory) is called by:
- the existing demo sync, now copying `packages/core` → `docs/app/`
  (behavior unchanged)
- `packages/pwa/scripts/build.mjs`, copying `packages/core` +
  `packages/pwa`'s own files (`manifest.json`, `service-worker.js`,
  `platform/`, `icons/`) → `docs/pwa/`

## Platform detection

No build-time HTML templating. `packages/core/index.html` and
`js/demo/loader.js` ship unmodified to all three targets; the same runtime
branch that exists today just gains a third case:

1. `window.electronAPI` already defined (real `preload.cjs` ran) → do
   nothing. Real Electron app.
2. `?demo=1` in the URL → load the existing in-memory demo shim. Legacy
   `docs/app` preview, unchanged.
3. Neither → load `platform/electronAPI-web.js` (new) and register the
   service worker. This is the PWA case — it's what's left over once
   neither of the other two applies, so `docs/pwa/`'s deploy needs no
   special query param or flag to identify itself.

## PWA persistence adapter

`packages/pwa/platform/electronAPI-web.js` implements the same
`window.electronAPI` surface the demo shim already fakes (presets CRUD,
language, updates, Spotify, local-file, mini/tray no-ops), but backed by
real storage instead of an in-memory object:

- Presets, active preset id, language, and the `last-session` preset →
  one JSON blob in `localStorage`, mirroring what `electron-store`'s
  `timer-config.json` holds today. Synchronous, no new dependency, plenty
  for this data's size.
- Local alarm file uploads → `platform/blobStore.js`, a small hand-rolled
  IndexedDB wrapper (store/fetch a `Blob` by id — not a general-purpose
  library, just enough for this one job, consistent with the project never
  having taken on a runtime frontend dependency before).
- Native chrome no-ops (`setAlwaysOnTop`, `quitApp`, mini IPC, update
  checker) copy the demo shim's existing no-op shapes verbatim — nothing
  new to design there.

**Local alarm files**: the "browse local file" UI, hidden in demo mode
today, is un-hidden specifically for the PWA build and wired to
`<input type="file" accept="audio/*">`. On selection, the file is stored
as a `Blob` in `blobStore`; playback gets `URL.createObjectURL(blob)`.
`LocalAlarmProvider` already just needs a playable source — no changes
needed inside it or `AlarmProviderFactory`.

**YouTube alarms**: unchanged. The iframe API already needs a real HTTP
origin, which GitHub Pages provides.

**Spotify alarms**: out of scope for this v1. The PWA build hides the
Spotify affordance in the Alarm Sound modal (mirroring how demo mode hides
the local-file affordance today) rather than exposing a login flow that
can't actually work — no main process to hold a client secret, no way to
catch the loopback OAuth redirect, and `shell.openExternal` has no direct
web equivalent. Revisit once the PWA itself has shipped.

**Offline**: no `AlarmManager` changes needed — it already falls back to
the local provider when a remote source (YouTube/Spotify) fails to load,
which covers "unreachable because offline" for free, provided the user has
uploaded a local alarm.

## Manifest, service worker, icons

`packages/pwa/manifest.json`: name "Interval Timer", `display: "standalone"`,
theme/background colors pulled from `css/tokens.css`, icon set at 192×192,
512×512, and a maskable variant. None of these exist yet at the right
sizes — `build/icon.ico` is Windows-only and `assets/icons/stopwatch-main.png`
is a UI glyph, not an app icon — so the icon set gets generated from
existing icon art as part of implementation.

`packages/pwa/service-worker.js`: cache-first for the app shell only
(`index.html`, `css/`, `js/`, `assets/`), versioned cache name bumped on
each PWA deploy so stale shells don't stick around. It deliberately does
not intercept YouTube iframe or Spotify API requests — those pass through
to the network and fail naturally offline, which `AlarmManager`'s existing
local-fallback already handles.

## Deployment

`npm run sync:pwa` (new, workspace-root script) runs
`packages/pwa/scripts/build.mjs`, producing `docs/pwa/`. Same manual,
committed-output model the repo already uses for `docs/app` (no CI here).
`docs/index.html` gets one small addition — a link to `docs/pwa/` ("Try the
full web app"). No other landing-page change.

## Testing / verification

No automated test suite exists in this repo (`npm test` is a stub). Same
as CLAUDE.md's standing guidance for UI work: verify manually. Serve
`packages/pwa`'s build output with a plain static server, exercise it in a
desktop browser (DevTools Application tab for manifest/service-worker/
storage inspection, offline toggle to confirm the fallback behavior), and
install it on an actual phone to confirm the home-screen install flow and
that presets/uploaded alarms survive a reload.

## Out of scope

- **Mobile app.** Explicitly phase 2+, not part of this spec.
- **Spotify in the PWA.** See above — revisit once the PWA has shipped.
- **`CLAUDE.md`'s stale Spotify description.** Flagged above; fixing it is
  a small independent doc change, not bundled into this restructure.
- **PKCE / Web Playback SDK.** Considered and explicitly declined for v1
  in favor of shipping without Spotify first.
- **Turborepo or other task-orchestration tooling.** npm workspaces alone
  is enough at 3 packages with no complex build pipeline; revisit only if
  that stops being true.
