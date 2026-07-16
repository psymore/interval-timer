# Alarm Sound modal redesign — design

## Problem

The Alarm Sound modal (`#alarmFolderModal` in `index.html:91-147`) is three
plain-text sections stacked vertically: "Local file" (a single "Choose
file…" button), "YouTube or Spotify URL" (one shared input that
auto-detects the link type), and "Spotify" (Connect/Disconnect). Three
issues:

1. No brand iconography anywhere — Spotify and YouTube are only ever
   identified by text ("YouTube", "Spotify"), including the small current-
   source tag (`#alarmProviderTag`, set by `updateProviderTag()` in
   `js/alarmModal.js:57-77`).
2. The Spotify "Connect" section sits *below* the URL field it's actually a
   prerequisite for — you can try pasting a Spotify link before connecting
   an account, which only works because `AlarmProviderFactory.detect()`
   doesn't care about connection state at parse time; the actual failure
   surfaces later as a fallback-to-local.
3. Local file selection has no memory beyond the single most recent pick
   (`localStorage.selectedAlarmPath`, `js/alarmModal.js:117,151`) and no
   drag-and-drop — every reselect is a full native file-picker round trip.

## Goals

- Add real Spotify/YouTube brand icons, sourced from
  [Simple Icons](https://simpleicons.org) (CC0-licensed SVGs maintained
  specifically so third-party apps can display brand marks without
  redrawing them or triggering trademark concerns).
- Restructure the modal as an accordion — Local file / YouTube / Spotify —
  only one section open at a time, each header showing icon + label +
  inline status (e.g. "Spotify · Not connected").
- Reorder Spotify so Connect/Disconnect comes before its URL field,
  structurally preventing the paste-before-connect confusion.
- Add a drag-and-drop zone to the Local section (in addition to, not
  instead of, "Choose file…"), plus a "Recent" list of up to 5 previously
  used local files.
- Split the shared YouTube/Spotify URL field into two separate inputs, one
  per section, each rejecting the other service's link with an inline
  error (no more silent cross-detection).

## Non-goals

- No changes to `js/alarm/providers/*` or `AlarmProviderFactory` — this is
  a UI-layer restructuring on top of the existing provider architecture.
  `AlarmProviderFactory.detect()` is still used, just to *validate* which
  box a link was pasted into rather than to silently route it.
- No "recent" history for YouTube/Spotify sources — only Local, per what
  was asked for. YouTube/Spotify keep single-current-source behavior.
- No change to Spotify's actual playback limitation (30s preview clips via
  Client Credentials — see `AlarmManager._buildSpotifyOpts()`); this spec
  is presentation-layer only.

## Architecture

### Icons

Spotify and YouTube glyphs come from Simple Icons (inlined SVG, colored to
match each brand's official mark — no recoloring to fit the app's
palette, per Simple Icons' own usage guidance). "Local file" has no brand
mark; it gets a generic file/waveform glyph matching the existing flat
icon style already used in `assets/` (e.g. `alarm-clock.png`,
`stopwatch-main.png`).

Per the existing convention noted in `js/alarmModal.js:59` ("Provider
brand names — not translated"), brand names and brand icons are never
localized or restyled per-language.

### Accordion structure

Three `<section>` blocks replace the current three `<div class="alarm-section">`
blocks in `index.html`. Each has a clickable header (icon + label + status)
and a collapsible body. Opening one collapses whichever other section was
open — implemented as plain show/hide (no animation library dependency
needed; the app has none today and this doesn't warrant adding one).

Current-source display at the top of the modal (`#alarmCurrentFile` /
`#alarmProviderTag`) gets consolidated into one row: provider icon +
filename/label, replacing the current pairing of a plain text file name
with a separate small text tag next to it.

### Local file section

- Drop zone (dashed border, standard `dragover`/`drop` handlers) with
  "Choose file…" button inside it — both paths converge on the same
  "apply this local path" logic that the button already uses today
  (`js/alarmModal.js:137-165`).
- **Drop path resolution**: Electron 32+ removed `File.path` from dropped
  `File` objects (security hardening). `preload.cjs` gains a new bridge
  method, `getPathForFile(file)`, calling `webUtils.getPathForFile()` —
  the only currently-supported way to recover a real filesystem path from
  a renderer-side `File` object under `contextIsolation: true`.
- **Recent list**: up to 5 entries, newest first, deduped by resolved
  absolute path, stored in a new `localStorage` key
  (`recentAlarmPaths`, JSON array) alongside the existing
  `selectedAlarmPath` key (which continues to track *only* the current
  selection, unchanged). Every successful local load (button, drop, or
  reselecting a recent entry) pushes to the front of this array and trims
  to 5. The bundled default (`assets/alarm.mp3`) is **not** a recent entry
  — it has no real path the user picked, so it doesn't belong in a list of
  prior selections. A separate "Reset to default" action (small link below
  the list) restores it instead. Whichever entry matches the current
  `selectedAlarmPath` is visually marked as active in the list.
- **Missing-file detection**: `lib/localServer.js`'s existing single-path
  allowlist (`store.get("allowedLocalAudioPath")`, set in
  `registerLocalServerIpc()`) only ever tracks *one* path — the currently
  active alarm — so recent-list entries beyond the active one are never
  in that allowlist and can't be existence-checked by trying to load them.
  A new lightweight IPC handler, `alarm:check-paths-exist` (invoke,
  `paths: string[]` → `boolean[]`, plain `fs.existsSync` per path, no
  allowlist interaction), lets the renderer gray out entries whose file
  has moved/been deleted. Called once when the Local section expands.
- **Reselecting a recent entry**: needs the same allowlist registration
  the file-picker path gets today (`store.set("allowedLocalAudioPath", ...)`
  in `lib/localServer.js:195`). Since that logic currently lives inside
  the `get-file-path` dialog handler, it's extracted into a small
  shared function and also called from a new `alarm:use-local-path`
  IPC handler (invoke, `path: string` → validates existence, registers
  the allowlist entry, returns success/failure) — used by both "click a
  recent entry" and "drop a file" (the latter needs the same
  registration step before `alarmManager.load()` can serve it via
  `/local-audio/`).

### YouTube section

Own URL input + Load button, same behavior as today's shared field
(`js/alarmModal.js:168-223`) but scoped: `AlarmProviderFactory.detect()`
result must be `"youtube"` or the field shows an inline error ("That looks
like a Spotify link — use the Spotify section below.") without attempting
a load.

### Spotify section

Connect/Disconnect (`js/alarmModal.js:279-326`, unchanged logic) rendered
first. The URL input only appears once `hasSpotifySession()` is true;
same detect-and-reject validation as YouTube, mirrored for `"spotify"`.

## Data flow

```
Drop file on Local zone
  → preload: webUtils.getPathForFile(file) → raw path
  → alarm:use-local-path (invoke) → validate exists, set allowedLocalAudioPath
  → renderer: toFileUrl(path) → alarmManager.load(url)
  → localStorage: selectedAlarmPath = path; recentAlarmPaths unshift(path), trim 5

Click a "Recent" entry
  → alarm:use-local-path (invoke) → same as above
  → (skip if entry already marked missing client-side)

Expand Local section
  → alarm:check-paths-exist(recentAlarmPaths) → boolean[]
  → gray out / disable entries that returned false

Paste link in YouTube or Spotify box
  → AlarmProviderFactory.detect(url)
  → mismatch → inline error, no load
  → match → existing alarmManager.load() flow, unchanged
```

## Error handling

- Wrong-service paste (YouTube box gets a Spotify link or vice versa):
  inline error via the existing `showFeedback(..., "error")` pattern, no
  network/IPC round trip attempted.
- Dropped file that isn't a supported audio extension: same rejection
  `lib/localServer.js`'s `LOCAL_AUDIO_EXTENSIONS` allowlist already
  enforces for served files — checked client-side by extension before
  calling `alarm:use-local-path`, so a bad drop fails fast without an IPC
  round trip.
- Recent entry whose file has moved/been deleted: grayed out, `pointer-
  events: none` (or a disabled attribute equivalent), never reaches
  `alarm:use-local-path`.
- `alarm:check-paths-exist` / `alarm:use-local-path` IPC failures (e.g.
  unexpected exception): logged via the existing `createLogger("alarmModal")`
  logger, surfaced to the user through the existing `showFeedback` error
  path — no new error-display mechanism needed.

## i18n

New user-facing strings (section status text, drop-zone prompt, "Recent"
label, wrong-service error messages) follow the existing `data-i18n` /
`t()` pattern (see `js/i18n/i18n.js` and the `alarm.*` key namespace
already used throughout `js/alarmModal.js`). Brand names/icons are not
translated, consistent with the existing documented exception.

## Testing

No test suite exists in this repo (`npm test` is a stub). Manual
verification:

1. Drag a valid audio file onto the Local drop zone — confirm it loads,
   becomes the current alarm, and appears at the top of "Recent".
2. Click "Choose file…" and pick a different file — confirm it also
   updates "Recent" (both paths converge on the same logic).
3. Reselect an older "Recent" entry — confirm it becomes the current
   alarm again without a file-picker dialog.
4. Rename/delete a file that's in "Recent", reopen the modal — confirm
   that entry shows grayed out and isn't clickable.
5. Confirm the entry matching the current alarm is visually marked active
   in the list, and that "Reset to default" restores `assets/alarm.mp3`
   without adding a "default" entry to "Recent".
6. Paste a Spotify URL into the YouTube box (and vice versa) — confirm an
   inline error, no load attempt, no fallback-to-local triggered.
7. With no Spotify session, confirm the Spotify section shows only
   Connect (no URL field) until connected.
8. Confirm only one accordion section is expanded at a time.
