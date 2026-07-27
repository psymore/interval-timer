# Landing page: interactive product demo

Source request: `docs/github-page.md`. Goal is to evolve the GitHub Pages
mini-window playground from a visual showcase into a live demo powered by
the real app, delivered as three independently-shippable phases on the same
branch.

## Current state

`docs/index.html` + `docs/assets/mini-demo.js` already implement a real,
working countdown inside a draggable/resizable box (`.mini-demo`) that
visually mirrors `mini.html`. It is bespoke code, not the real app — it was
written that way on purpose, because `js/mini.js`'s resize logic sends IPC
to resize an actual OS `BrowserWindow`, which has no browser equivalent.
That bespoke mini box is not being replaced; only the "expand" behavior is
new.

## Phase 1 — Remove the mismatched drag cursor

**Problem:** `.mini-demo` sets `cursor: grab` and `.mini-demo.is-dragging`
sets `cursor: grabbing` (`docs/index.html:443,447`). Production has no such
cursor swap — `css/mini.css:65` carries the comment *"cursor grab kaldırıldı
— native drag kullanıyor"* (grab cursor removed, uses native OS drag), and
`.mini-container` just keeps a flat `cursor: pointer` throughout, drag or
not. The demo currently behaves in a way the real app structurally cannot.

**Fix:** delete both rules. Resize-handle cursors (`ns-resize`, `ew-resize`,
`nwse-resize`, `nesw-resize`) already match production's own
`.mini-resize-*` rules and are untouched. Drag/resize functionality is
unaffected — only the cursor stops changing.

**Files touched:** `docs/index.html` (CSS only).

## Phase 2 — Pin expands into the real running app

### Architecture

Pressing Pin swaps the mini box's content for a sandboxed
`<iframe src="app/index.html?demo=1">` (path explained in "Publishing the
app files to Pages" below) — the actual application, not a recreation.
This directly satisfies "must not be a mockup" and "reuse the existing
application components... avoid duplicating code": the expanded view *is*
`index.html`, `js/timer.js`, `js/logic/Timer.js`, `js/views/timerView.js`,
`js/alarmModal.js`, `css/styles.css` — byte-for-byte the same files the
packaged app ships, always in sync because there's only one source copy
(`docs/app/` is a generated mirror, never hand-edited). The bespoke mini
box's countdown is a single plain timer (no work/break phases), so its
state hands off to the app's **Timer** tab (`js/timer.js`/`js/logic/
Timer.js`), not the Interval Timer tab — the expanded playground opens on
that tab pre-seeded, and the visitor is free to switch tabs afterward like
in the real app.

`index.html` is not runnable outside Electron as-is: several modules call
`window.electronAPI.*` unconditionally, which doesn't exist without
`preload.cjs`. Rather than sprinkling existence checks through app code, a
new file, `js/demo/electron-demo-shim.js`, defines an in-memory
`window.electronAPI` with the same method surface. It lives in the normal
`js/` source tree — not hand-placed under `docs/` — so `scripts/sync-demo-
app.mjs` picks it up automatically along with the rest of `js/**`. It is
only ever loaded when `?demo=1` is present, via a small inline snippet at
the top of `index.html`:

```html
<script>
  if (new URLSearchParams(location.search).get("demo")) {
    document.write('<script src="js/demo/electron-demo-shim.js"><\/script>');
  }
</script>
```

This runs synchronously during parsing, before any `type="module"` script
executes, so `window.electronAPI` exists by the time any module's init code
touches it. The packaged Electron app never sets `?demo=1`, so this branch
is dead code in production — zero behavior change there.

Exhaustive audit of every `window.electronAPI.*` call site in `js/**`
(confirms the shim's full required surface — grepped, not sampled):

| File(s) | Calls | Shim behavior |
|---|---|---|
| `js/intervalTimer.js`, `js/presets.js`, `js/alarmModal.js` | `presetsGetActive`, `presetsGetAll`, `presetsSave`, `presetsSetActive`, `presetsDelete` | in-memory array seeded with the same 3 defaults `main.js:34-64` ships (`default-pomodoro`/`default-short`/`default-long`), mutated in place; return shapes match `lib/presetsIpc.js` exactly (`presetsSave`/`presetsDelete`/`presetsSetActive` resolve `{ presets }` / `{ id }` / `{ error }`) |
| `js/timerStateBroadcast.js` | `sendTimerState` | no-op (fires every 200ms tick — must not throw or log) |
| `js/updates.js` | `isWindowsStoreBuild` (a **property**, not a call — read directly in an `if`, `js/updates.js:53`) | shim value `false`; combined with a one-line demo-mode check added to that same `if` (see "Demo-mode UI adjustments") so the update-checker UI hides itself via the exact code path already used for Store builds, and `onUpdateAvailable`/`updatesCheck`/`updatesOpenReleases`/`updatesDismiss` are never reached |
| `js/i18n/i18n.js` | `languageSet`, `languageGet`, `onLanguageChanged` | `languageGet` resolves `"en"`; `languageSet` no-ops; `onLanguageChanged` registers and never fires (language switching still works client-side, it just doesn't persist) |
| `js/renderer.js` | `setAlwaysOnTop`, `quitApp`, `onMiniAction`, `onMiniReady`, `onMiniClosed` | no-ops (the call sites themselves are also demo-gated, see "Demo-mode UI adjustments") |
| `js/alarmModal.js` | `alarmCheckPathsExist`, `alarmUseLocalPath`, `getFilePath`, `getPathForFile` | `alarmCheckPathsExist(paths)` resolves `paths.map(() => false)` (matches its real array-in/array-out contract); the other three resolve/return `null`/an error object — unreachable in practice once the local-file affordance is hidden, see "Out of scope" |
| `js/alarm/AlarmManager.js`, `js/alarm/linkHealth.js`, `js/alarm/sourceNames.js`, `js/alarmModal.js`, `js/alarm/providers/SpotifyAlarmProvider.js` | `spotifyGetTokens`, `spotifyLogin`, `spotifyRefresh`, `spotifySaveTokens`, `spotifyClearTokens`, `spotifyOpenTrack` | `spotifyGetTokens` resolves `null` (logged-out shape); `spotifyLogin`/`spotifyRefresh` reject; the rest no-op — see Phase 3 for why this needs no further handling |

`js/logic/Timer.js`, `js/views/timerView.js`, and
`js/alarm/providers/YouTubeAlarmProvider.js` have no Electron dependency at
all and need no shimming.

### Publishing the app files to Pages

GitHub Pages currently serves only `docs/`. The real app's renderer files
(root `index.html`, `js/**`, `css/**`, `assets/**` — everything the iframe
needs) live outside `docs/` and aren't published there. `main.js`,
`preload.cjs`, and `lib/**` are Electron-main-only and are never needed by
the iframe.

A new script, `scripts/sync-demo-app.mjs`, copies exactly that renderer
file set into `docs/app/`. The output is committed to git (this repo has no
CI) and is regenerated by re-running the script — `docs/app/` is never
hand-edited. It's run manually before any Pages deploy that touches app
source relevant to the demo; the plan documents when. The iframe's `src`
becomes `app/index.html?demo=1`, relative to `docs/`.

### State handoff

1. **Capture.** On Pin click, read `{remainingSeconds, isRunning}` off the
   mini box's existing countdown state (`mini-demo.js`'s own variables —
   no new state needed).
2. **Animate.** Grow `.mini-demo`'s rect toward a "desktop playground"
   footprint, clamped to the current `.mini-demo-stage` bounds using the
   same clamped-rect math `centerRect()`/the alarm-stretch resize already
   use, with `.is-animating` driving the transition (existing mechanism,
   no new CSS transition system).
3. **Seed.** The iframe is created pointed at `app/index.html?demo=1` up
   front (so load time overlaps the animation). Once it fires
   `postMessage({type: "demo-ready"}, ...)`, the parent replies with
   `postMessage({type: "demo-seed-timer", remainingSeconds, isRunning}, ...)`.
   `js/renderer.js` is the single place inside the iframe that listens for
   parent `message` events in demo mode; it re-dispatches what it receives
   as a local `CustomEvent("demo-seed-timer", {detail: ...})`. A demo-only
   listener added to `js/timer.js` (inert unless `?demo=1`) — the module
   that owns the Timer tab's `Timer` instance, matching the mini box's own
   plain-countdown shape — listens for that event, seeds the real `Timer`
   to that exact elapsed point, and calls `start()`/`pause()` to match — no
   restart, no visible jump.
4. **Reveal.** The iframe fades in as the box animation completes; the
   bespoke mini body is hidden and its tick loop stopped, so nothing
   double-ticks.
5. **Reverse.** A "shrink" control inside the expanded view (see below)
   reverses the handoff: posts `{type: "demo-shrink", remainingSeconds,
   isRunning}` back out with its current state, the parent reseeds the
   mini box's own countdown to match, then plays the shrink animation and
   tears the iframe down.

### Demo-mode UI adjustments (inside the iframe)

All gated in `js/renderer.js` behind the same `?demo=1` check used for the
shim loader:

- **`alwaysOnTopBtn`** (topbar "Pin window on top" — in production this is
  what *opens* the mini window) becomes the "shrink" control: instead of
  calling `window.electronAPI.setAlwaysOnTop(...)`, its demo-mode handler
  posts `{type: "demo-shrink", ...}` to the parent. This isn't a fake
  affordance bolted on — it's the same button doing what it already means
  ("go to the mini view"), just reimplemented for a page instead of an
  IPC-driven window.
- **`quitAppBtn`** — hidden (`classList.add("hidden")`); quitting a browser
  tab isn't a meaningful action.
- **Update-checker** — `js/updates.js:53`'s existing
  `if (window.electronAPI.isWindowsStoreBuild)` early-return (which already
  hides `.update-check-row` for Store builds) gets a second condition,
  `|| isDemoMode()`, so it hides itself through the exact code path that
  already exists for "no update channel here" rather than a new one.

Everything else in the app chrome (tabs, presets dropdown, Settings modal,
Timer/Interval Timer switching, language toggle) behaves exactly as in the
real app, per the "preserve every interaction" requirement.

### Files touched

Two different `index.html` files are involved — the landing page's own and
the app's — kept distinct below by full path. `docs/app/` is generated by
`scripts/sync-demo-app.mjs`, never hand-edited directly.

- `index.html` (app root) — conditional demo-shim loader snippet
- `js/demo/electron-demo-shim.js` — new; full shim surface per the audit
  table above
- `scripts/sync-demo-app.mjs` — new; copies `index.html`, `js/**`,
  `css/**`, `assets/**` into `docs/app/`
- `docs/index.html` — iframe creation, expand/shrink animation wiring
- `docs/assets/mini-demo.js` — Pin handler, state capture, postMessage
  handshake
- `js/timer.js` — demo-only seed listener (inert without `?demo=1`)
- `js/renderer.js` — demo-mode detection helper, message-to-CustomEvent
  bridge, `alwaysOnTopBtn`/`quitAppBtn` demo-mode gating
- `js/updates.js` — one-line addition to the existing Store-build check

## Phase 3 — Functional Alarm Sound module

Because Phase 2 already runs the real `js/alarmModal.js` inside the iframe,
this phase turned out to be smaller than expected once the actual Spotify
code path was read closely (superseding an earlier draft of this section
that assumed a Client-Credentials preview-clip flow — that's stale; see
below). It's the same component, not a new one, and needs no new UI code.

- **YouTube:** fully functional already, no changes needed
  (`YouTubeAlarmProvider.js` has no Electron dependency).
- **Spotify:** production's *current* implementation (not the older
  Client-Credentials/30s-preview approach `CLAUDE.md` still describes) is a
  full-track OS launch: a logged-in user's `spotifyOpenTrack` call does
  `shell.openExternal("spotify:track:<id>")` to hand the track to the real
  Spotify app, then rides the Web API's play/pause endpoints (the user's
  own access token, fetched directly from the renderer) to stay in sync
  with interval phases. Login is a full Authorization Code exchange
  through `main.js`, requiring the app's private client secret — not
  something a public static page can do.

  The shim covers this with plain "logged out" responses:
  `spotifyGetTokens` resolves to `null`, `spotifyLogin` rejects. No new UI
  or messaging is needed, because the app *already* handles a
  no-session Spotify attempt gracefully: `AlarmManager._buildSpotifyOpts()`
  throws "No Spotify session," `AlarmManager.load()` catches it and falls
  back to the local alarm, and `alarmModal.js`'s existing
  `alarm.feedback.providerFallback` message
  ("Spotify unavailable, using local alarm" — see `handleUrlLoad` in
  `js/alarmModal.js:669-712`) is exactly what a real logged-out user sees
  today. The demo shows the identical experience for free.
- **Presets:** the in-memory shim from Phase 2 already covers
  save/apply; add a small "demo — changes aren't saved" hint near the
  Alarm Sound module so it doesn't read as a bug.
- **Local-file browsing:** hidden in demo mode — see "Out of scope."

The Spotify/preset/local-file stubs above are already part of the one
shim built in Phase 2 (`js/demo/electron-demo-shim.js` covers its full
surface up front); Phase 3 adds no new shim methods, only the two small
UI adjustments below.

### Files touched

- `js/alarmModal.js` — hide the local-file `alarm-section`
  (`data-section="local"`) when `?demo=1`
- `index.html` (app root) — small "demo — changes aren't saved" hint added
  to `#alarmFolderModal`, shown only when `?demo=1`

## Out of scope

- **Local-file alarm browsing.** `docs/github-page.md` requirement 3 only
  lists YouTube/Spotify links. Native file picking
  (`getFilePath`/`getPathForFile`) needs real filesystem access a static
  page can't provide; the "browse local file" affordance is hidden in demo
  mode rather than faked.
- **Live Spotify preview audio.** Ruled out by the "no secret on a public
  page" constraint; revisit only if a token-proxy service is built
  separately.
- **Changing `mini.html`/`js/mini.js` themselves.** The bespoke mini-demo
  stays bespoke; nothing here touches the real mini window's native
  resize/drag implementation.
- **Persisting demo state across reloads.** In-memory only, matching a
  "try it, no account" demo experience.
