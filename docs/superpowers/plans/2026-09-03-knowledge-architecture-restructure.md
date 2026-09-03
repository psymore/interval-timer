# Knowledge Architecture Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `CLAUDE.md`'s subsystem-specific implementation detail into five domain docs under `docs/architecture/`, leaving `CLAUDE.md` as a small router (governance + a routing table), with zero knowledge lost.

**Architecture:** Docs-only migration. Five new markdown files, one index file, one rewritten `CLAUDE.md`. Content moves out of `CLAUDE.md` largely verbatim (cross-references updated to point across files where a referenced section moved to a different doc than the one making the reference). No application code touched.

**Tech Stack:** Markdown only.

**Spec:** `docs/superpowers/specs/2026-09-03-knowledge-architecture-design.md`

## Global Constraints

- Content is **moved**, not rewritten from scratch — copy the existing prose verbatim except where a cross-reference needs to point at a different file after the split (this plan specifies every such change explicitly).
- No application code (anything under `packages/`) is touched.
- New files live only under `docs/architecture/`.
- `CLAUDE.md`'s `FOLLOWUP` keyword section and `Commands` section are untouched — only the `## Architecture` section (and everything after it) is replaced.
- No new governance, policies, or facts are invented — every sentence in a new doc must trace back to the original `CLAUDE.md`.

---

### Task 1: `docs/architecture/monorepo-and-sync.md`

**Files:**
- Create: `docs/architecture/monorepo-and-sync.md`

**Interfaces:**
- Produces: a doc other tasks' cross-references point to as `docs/architecture/monorepo-and-sync.md`.

- [ ] **Step 1: Write the file**

Create `docs/architecture/monorepo-and-sync.md` with exactly this content:

```markdown
# Monorepo layout, the local HTTP server, and sync scripts

Read this when: touching package boundaries, the Electron local HTTP server, any of the sync scripts (`sync:demo`, `sync:pwa`, packaging), or the platform-detection loader.

## Packages

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
  strategy — see the platform-detection notes below and
  `docs/architecture/alarm-providers.md`), `icons/`, and `scripts/build.mjs`
  (run via `npm run sync:pwa`, produces `docs/pwa/`, deployed to GitHub
  Pages alongside the demo). Unlike the `?demo=1` GitHub Pages demo, its
  `window.electronAPI` is real and persistent: presets/language survive
  reloads via `localStorage`, and local alarm files survive via IndexedDB
  blobs (see `platform/localBlobStrategy.js`). Spotify is out of scope —
  see `docs/architecture/alarm-providers.md`.

## Local HTTP server (main.js)

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

## Sync scripts

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

## Platform detection (`packages/core/js/demo/loader.js`)

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
`docs/architecture/alarm-providers.md`'s "Adding a new alarm source" for
the analogous alarm-provider seam, and grep either function's usages for
current examples — the Alarm Sound modal's Spotify section, the settings
modal's update-check row, and the quit/pin topbar buttons).
```

- [ ] **Step 2: Verify against the source**

Run: `grep -c "coreRoot\|syncCoreInto\|isDemoMode\|isPwaMode" docs/architecture/monorepo-and-sync.md`
Expected: a nonzero count (all four terms present).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/monorepo-and-sync.md
git commit -m "docs: extract monorepo/sync architecture doc from CLAUDE.md"
```

---

### Task 2: `docs/architecture/timer-engine.md`

**Files:**
- Create: `docs/architecture/timer-engine.md`

**Interfaces:**
- Produces: a doc other tasks' cross-references point to as `docs/architecture/timer-engine.md`.

- [ ] **Step 1: Write the file**

Create `docs/architecture/timer-engine.md` with exactly this content:

```markdown
# Timer tick loop

Read this when: touching timer ticking, background-throttling behavior, or `packages/core/js/logic/Timer.js` / `IntervalTimer.js`.

Both `packages/core/js/logic/Timer.js` and `packages/core/js/logic/IntervalTimer.js` use `setInterval(..., 200)`, not `requestAnimationFrame`. rAF stops firing when the window is backgrounded/minimized, which froze the timer. This is paired with:
- `app.commandLine.appendSwitch("disable-background-timer-throttling")` / `"disable-renderer-backgrounding"` in `packages/electron/main.js`
- `backgroundThrottling: false` on every `BrowserWindow`'s `webPreferences`
- `powerSaveBlocker.start("prevent-app-suspension")` while the app is running

Each `logic/*.js` class is pure timer state machine (elapsed-time based, not tick-count based, so it self-corrects after throttling); the matching `packages/core/js/timer.js` / `packages/core/js/intervalTimer.js` is the DOM-facing controller that wires it to buttons and views.
```

- [ ] **Step 2: Verify against the source**

Run: `grep -c "powerSaveBlocker" docs/architecture/timer-engine.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/timer-engine.md
git commit -m "docs: extract timer engine architecture doc from CLAUDE.md"
```

---

### Task 3: `docs/architecture/alarm-providers.md`

**Files:**
- Create: `docs/architecture/alarm-providers.md`

**Interfaces:**
- Produces: a doc other tasks' cross-references point to as `docs/architecture/alarm-providers.md`.

- [ ] **Step 1: Write the file**

Create `docs/architecture/alarm-providers.md` with exactly this content:

```markdown
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
```

- [ ] **Step 2: Verify against the source**

Run: `grep -c "spotifyAuth\|linkHealth\|BaseAlarmProvider" docs/architecture/alarm-providers.md`
Expected: a nonzero count (all three terms present).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/alarm-providers.md
git commit -m "docs: extract alarm providers architecture doc from CLAUDE.md"
```

---

### Task 4: `docs/architecture/mini-window.md`

**Files:**
- Create: `docs/architecture/mini-window.md`

**Interfaces:**
- Produces: a doc other tasks' cross-references point to as `docs/architecture/mini-window.md`.

- [ ] **Step 1: Write the file**

Create `docs/architecture/mini-window.md` with exactly this content:

```markdown
# Mini window (always-on-top)

Read this when: touching the always-on-top mini window or its IPC contract with the main renderer.

Frameless, non-resizable `BrowserWindow` (`packages/core/mini.html`/`packages/core/js/mini.js`) toggled via `set-always-on-top` IPC. Dragging uses native `-webkit-app-region: drag` (no JS drag handling). State flows one-way per direction:
- Renderer → mini: every `onTick`/`setStatus()` call in the active tab controller calls `broadcastTimerState()` (`packages/core/js/renderer.js`) → `timer-state` IPC → mini window.
- Mini → renderer: button clicks send `mini-action` IPC; `packages/core/js/renderer.js` maps the action to the currently active tab's button ID and clicks it (so mini never duplicates timer logic).
- On mini open, main window sends a state snapshot via the `request-interval-snapshot`/`request-timer-snapshot` custom events so the mini isn't blank until the next tick.
```

- [ ] **Step 2: Verify against the source**

Run: `grep -c "request-interval-snapshot" docs/architecture/mini-window.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/mini-window.md
git commit -m "docs: extract mini window architecture doc from CLAUDE.md"
```

---

### Task 5: `docs/architecture/presets.md`

**Files:**
- Create: `docs/architecture/presets.md`

**Interfaces:**
- Produces: a doc other tasks' cross-references point to as `docs/architecture/presets.md`.

- [ ] **Step 1: Write the file**

Create `docs/architecture/presets.md` with exactly this content:

```markdown
# Presets

Read this when: touching preset persistence, the preset IPC surface, or the `last-session` auto-fork behavior.

Persisted with `electron-store` (`timer-config.json`), not localStorage — main process owns the data, IPC-only access (`presets:get-all/get-active/save/delete/set-active`). The three seeded default presets are ordinary presets — editable and deletable like any other; presets capped at `MAX_PRESETS = 20` (enforced in `packages/electron/lib/presetsIpc.js`, not the renderer). The preset trigger shows "+ Add Preset" when the list is empty. UI is a floating dropdown (`packages/core/js/presets.js`) rather than being inlined into the settings modal, so it doesn't inflate the main container. Any real edit to the timer fields auto-forks the active preset into a dedicated `last-session` preset (`packages/core/js/intervalTimer.js`'s `syncLastSessionPreset()`), debounced so unsaved changes are never lost. A `preset-data-changed` window event (distinct from `preset-activated`) tells the preset list/trigger to re-render without switching the active preset or reloading the timer fields — fired whenever preset data changes but nothing should visibly "activate".
```

- [ ] **Step 2: Verify against the source**

Run: `grep -c "MAX_PRESETS\|preset-data-changed" docs/architecture/presets.md`
Expected: a nonzero count (both terms present).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/presets.md
git commit -m "docs: extract presets architecture doc from CLAUDE.md"
```

---

### Task 6: `docs/architecture/README.md` index

**Files:**
- Create: `docs/architecture/README.md`

**Interfaces:**
- Consumes: the five doc filenames created in Tasks 1-5 (`monorepo-and-sync.md`, `timer-engine.md`, `alarm-providers.md`, `mini-window.md`, `presets.md`).
- Produces: `docs/architecture/README.md`, which `CLAUDE.md` (Task 7) does not need to duplicate.

- [ ] **Step 1: Write the file**

Create `docs/architecture/README.md` with exactly this content:

```markdown
# Architecture docs index

Domain-specific implementation detail, split out of `CLAUDE.md` so routine tasks don't have to load every subsystem. Read the one doc for the subsystem you're touching — not all of them.

| Doc | Read this when touching... |
|---|---|
| [`monorepo-and-sync.md`](monorepo-and-sync.md) | Package layout, the local HTTP server, sync scripts (`sync:demo`/`sync:pwa`/packaging), or platform detection |
| [`timer-engine.md`](timer-engine.md) | The timer tick loop or background-throttling behavior |
| [`alarm-providers.md`](alarm-providers.md) | Alarm sources (local/YouTube/Spotify), the provider factory, or alarm link health |
| [`mini-window.md`](mini-window.md) | The always-on-top mini window |
| [`presets.md`](presets.md) | Preset persistence, IPC, or the `last-session` auto-fork |

For everything else — commands, the `FOLLOWUP` protocol, top-level package summaries — see [`/CLAUDE.md`](../../CLAUDE.md).
```

- [ ] **Step 2: Verify all five docs exist**

Run: `ls docs/architecture/`
Expected: `README.md  alarm-providers.md  mini-window.md  monorepo-and-sync.md  presets.md  timer-engine.md`

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/README.md
git commit -m "docs: add docs/architecture index"
```

---

### Task 7: Rewrite `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md:24-199` (the entire `## Architecture` section through end of file)

**Interfaces:**
- Consumes: the six files created in Tasks 1-6 (routes to them by path).

- [ ] **Step 1: Replace the Architecture section**

In `CLAUDE.md`, delete everything from `## Architecture` (line 24) through the end of the file (line 199, "Nothing else changes — `AlarmManager` is source-agnostic."), and replace it with:

```markdown
## Architecture

Electron desktop app **and** an installable PWA, sharing one
platform-agnostic renderer, in an npm-workspaces monorepo (vanilla JS ES
modules throughout — no framework, no bundler, no TypeScript). Every
`package.json` in this repo has `"type": "module"`, so every `.js` file is
ESM by default.

### Packages

- `packages/core/` — the platform-agnostic renderer (`index.html`, `js/**`, `css/**`, `assets/**`). Runs unmodified in Electron, the GitHub Pages demo, and the deployed PWA. Nothing in this package may import anything from `packages/electron`.
- `packages/electron/` — the Electron main process (`main.js`, `preload.cjs`, `lib/`, `build/`).
- `packages/pwa/` — the installable, persistent PWA sharing `packages/core`'s renderer (`manifest.json`, `service-worker.js`, `platform/`, `icons/`).

### Where things live

Read the relevant doc in `docs/architecture/` before touching that subsystem — each is scoped to one area of ownership and kept out of this file so routine tasks don't have to load every subsystem's detail.

| Touching... | Read |
|---|---|
| Package layout, the local HTTP server, sync scripts (`sync:demo`/`sync:pwa`/packaging), or platform detection (`js/demo/loader.js`) | `docs/architecture/monorepo-and-sync.md` |
| The timer tick loop / background-throttling behavior | `docs/architecture/timer-engine.md` |
| Alarm sources (local/YouTube/Spotify), the alarm provider factory, or alarm link health | `docs/architecture/alarm-providers.md` |
| The always-on-top mini window | `docs/architecture/mini-window.md` |
| Presets (persistence, IPC, `last-session` auto-fork) | `docs/architecture/presets.md` |

`docs/architecture/README.md` indexes all of the above.
```

- [ ] **Step 2: Confirm the FOLLOWUP and Commands sections are untouched**

Run: `head -22 CLAUDE.md`
Expected: identical to the original lines 1-22 (title, FOLLOWUP section, Commands section, "no test suite" line) — nothing in this range should have changed.

- [ ] **Step 3: Confirm the file is well-formed**

Run: `wc -l CLAUDE.md`
Expected: a much shorter file than the original 199 lines (roughly 45-50 lines).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reduce CLAUDE.md to a router over docs/architecture/"
```

---

### Task 8: Knowledge-loss check and cold-read validation

**Files:**
- Read only: `CLAUDE.md`, `docs/architecture/*.md`

**Interfaces:**
- Consumes: the final state of every file touched in Tasks 1-7.

- [ ] **Step 1: Grep for every subsystem-specific term that existed in the original `CLAUDE.md`**

Run:
```bash
for term in powerSaveBlocker MAX_PRESETS syncCoreInto localBlobStrategy spotifyAuth linkHealth BaseAlarmProvider coreRoot isDemoMode isPwaMode request-interval-snapshot preset-data-changed; do
  echo "== $term =="
  grep -rn "$term" CLAUDE.md docs/architecture/ || echo "MISSING: $term"
done
```
Expected: every term found in exactly one `docs/architecture/*.md` file (not in `CLAUDE.md`, since that content moved). If any term prints `MISSING`, stop and add it to the appropriate doc before continuing.

- [ ] **Step 2: Check for dead links**

Run: `grep -rn "docs/architecture/" CLAUDE.md docs/architecture/README.md`
Expected: every referenced path (`monorepo-and-sync.md`, `timer-engine.md`, `alarm-providers.md`, `mini-window.md`, `presets.md`) exists — cross-check against `ls docs/architecture/` from Task 6, Step 2.

- [ ] **Step 3: Cold-read validation**

Answer each question below using only `CLAUDE.md` as the starting point, confirming each resolves in one hop to a real file:
- "Where do I read about the alarm provider architecture?" → `CLAUDE.md`'s routing table → `docs/architecture/alarm-providers.md` ✓
- "Where do I read about the mini window's IPC contract?" → `CLAUDE.md`'s routing table → `docs/architecture/mini-window.md` ✓
- "What should I read before touching sync scripts?" → `CLAUDE.md`'s routing table → `docs/architecture/monorepo-and-sync.md` ✓
- "Where are the current session's priorities?" → `CLAUDE.md`'s `FOLLOWUP` section → `docs/superpowers/FOLLOWUP.md` ✓ (unchanged by this migration)

If any question fails to resolve in one hop, fix the routing table in `CLAUDE.md` before continuing.

- [ ] **Step 4: Final review — no commit needed**

This task is verification-only; if Steps 1-3 all pass, no file changes are needed and there is nothing to commit. If a gap was found and fixed in Step 1 or 2, commit that fix:

```bash
git add CLAUDE.md docs/architecture/
git commit -m "docs: fix gap found during knowledge-loss validation"
```
