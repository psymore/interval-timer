# Preset Alarm Links — Design

## Problem

The alarm source (local file, YouTube URL, or Spotify URL) is currently a
single global value stored in renderer `localStorage`
(`selectedAlarmPath`), completely disconnected from presets. Every preset
plays whatever alarm was most recently loaded, and there's no way to save
more than one YouTube/Spotify link at a time — loading a new URL just
overwrites the old one.

The user wants:
1. Each preset to remember its own alarm source(s).
2. Switching the active preset to automatically switch the alarm too.
3. A manageable (add/remove) list of saved YouTube/Spotify links per
   preset, shown in the Alarm Sound modal, similar to the existing
   local-file "Recent" list.
4. Confidence that a preset's Spotify link survives an app restart.

## Non-goals

- Local audio files are **not** added to the new per-preset link list —
  they keep using the existing global "Recent" list
  (`js/alarm/recentAlarms.js`, `localStorage`-backed) and file
  picker/drag-drop, unchanged.
- No custom labels/renaming for saved links — entries display the URL
  itself (truncated), matching how the existing Recent list displays
  filenames, not custom names.
- No new IPC channels — this reuses the existing `presets:save` handler,
  which already round-trips the whole preset object.

## Architecture

Preset *switching* and alarm *loading* stay in their current, separate
modules. They're connected via a custom DOM event
(`preset-activated`) rather than direct cross-module imports — the same
pattern this app already uses for mini-window state snapshots
(`request-interval-snapshot`/`request-timer-snapshot`, per CLAUDE.md).

```
presets.js (load-preset click handler)
intervalTimer.js (startup: applying the active preset)
        │
        │  window.dispatchEvent(new CustomEvent("preset-activated", { detail: preset }))
        ▼
alarmModal.js (new listener, added alongside its existing
                DOMContentLoaded setup)
        │
        ├─ reads preset.alarmSource
        ├─ loads it via alarmManager.load(...), falling back to the local
        │  default alarm on failure (existing AlarmManager fallback path —
        │  no new fallback logic needed)
        ├─ re-renders the YouTube and Spotify link lists for the new
        │  active preset
        └─ updates the current-file label/icon
```

Rejected alternative: wiring alarm-loading directly into
`intervalTimer.js`'s `applyPreset()`. This would require `intervalTimer.js`
to import alarm-loading internals it has no other reason to know about,
and `alarmModal.js` would still need a separate signal to refresh its own
list UI — two-directional coupling for no benefit over the event.

## Data model

Preset schema (currently `id`, `name`, `workMinutes`, `workSeconds`,
`breakMinutes`, `breakSeconds`, `loops`, `isDefault`) gains two new
optional fields:

```js
{
  // ...existing fields unchanged...
  alarmSource: { type: "local" | "youtube" | "spotify" | null, value: string | null },
  alarmLinks: {
    youtube: string[],   // MRU order, cap 5 — front = most recently loaded
    spotify: string[],   // MRU order, cap 5
  },
}
```

- `alarmSource.value` is the raw path or URL string — no id/label
  indirection.
- Local files are representable in `alarmSource` (`type: "local"`) since a
  preset should remember whichever source type was last active for it, but
  local paths are never added to `alarmLinks` (see Non-goals).
- Presets written before this change (including the 3 seeded defaults)
  have neither field. They're treated as `alarmSource: null` and
  `alarmLinks: { youtube: [], spotify: [] }` at read time — no forced
  rewrite of existing preset records.

### Validation (`lib/presetsIpc.js`)

`isValidPreset()` gains checks for the two new fields, both optional
(absent = valid, defaults apply):

- `alarmSource`, if present, must be `null` or
  `{ type: "local"|"youtube"|"spotify", value: non-empty string, length <= 2000 }`.
- `alarmLinks`, if present, must be `{ youtube: string[], spotify: string[] }`
  with each array length <= 5 and each string length <= 2000.

No new IPC channels: the renderer builds the full updated preset object
(spreading existing fields + the new ones) and calls the existing
`presets:save` handler, exactly as preset edits already work today.

## Storage & restart persistence

Moving `alarmSource`/`alarmLinks` onto the preset object means they persist
through `electron-store` (a real JSON file in the app's userData
directory, main-process-owned) — the same durable mechanism presets and
Spotify OAuth tokens already use. This resolves the "does the Spotify link
survive a restart" question: the underlying Spotify *session* already
persisted (encrypted via `safeStorage`, see `lib/spotifyAuth.js`), and the
*link itself* also already persisted (renderer `localStorage` is durable
across restarts) — the actual gap was that neither was ever tied to a
specific preset. Per-preset storage via `electron-store` fixes that and is
at least as durable as the `localStorage` mechanism it replaces.

### One-time migration

On first load after this ships: if `localStorage.getItem("selectedAlarmPath")`
has a value and the currently-active preset's `alarmSource` is still
`null`/absent, import the saved value into that preset's `alarmSource`
(and into its `alarmLinks[type]` if the type is `youtube`/`spotify`), then
save the preset. The old `localStorage` key is left in place afterward
(unread by any code going forward, effectively dead) — no need to actively
clear it.

## UI changes (Alarm Sound modal, `js/alarmModal.js` + `index.html`)

Under each of the existing YouTube and Spotify accordion sections, add a
link list — visually and structurally matching the existing local-file
Recent list (`.alarm-recent-item` styling, generalized for reuse):

- **Loading a URL** (existing URL input + Load button flow, unchanged
  entry point) adds it to the active preset's `alarmLinks[type]`
  (dedup + MRU cap 5 — reusing the same add/cap logic pattern as
  `recentAlarms.js`, generalized to be preset-scoped instead of global) and
  sets that preset's `alarmSource` to `{ type, value: url }`. The updated
  preset is persisted via `presets:save`.
- **Clicking a list entry** reloads that URL, makes it the active source
  for the current preset, and moves it to the front of the list (same MRU
  behavior as the existing local Recent list — no separate "activate"
  affordance needed).
- **A remove (×) button** per entry, same interaction as the existing
  Recent list's remove button. Removing the currently-active entry does
  not change what's currently playing/loaded — it only removes it from the
  saved list (mirrors existing local-file Recent behavior, where removing
  a non-missing entry doesn't stop/unload it).
- Both lists re-render whenever: the modal is reopened (existing pattern,
  already used for the local Recent list's existence re-check), or a
  `preset-activated` event fires.

Local-file selection also needs to write to the active preset, even though
local files themselves stay out of `alarmLinks` (per Non-goals). The
existing local-file code paths in `alarmModal.js` gain one additional step
each, all just setting `alarmSource` on the active preset and saving it —
no `alarmLinks` involvement:
- `applyLocalFile()` (shared by the file picker, drag-drop, and clicking a
  Recent entry) sets `alarmSource: { type: "local", value: filePath }`.
- `resetToDefault()` clears `alarmSource` back to `null`.
- The Spotify-logout handler's existing revert-to-default-alarm branch
  clears `alarmSource` back to `null` the same way, keeping it consistent
  with what's now actually loaded.

## Preset-switch behavior & edge cases

- Switching the active preset (via the preset dropdown's Load action, or
  on app startup when the previously-active preset is re-applied) loads
  that preset's `alarmSource` automatically.
- If `alarmSource` is remote (`youtube`/`spotify`) and loading it fails
  (e.g., no Spotify session, dead YouTube video ID, network error), it
  falls back to the local default alarm via the existing
  `AlarmManager._activateFallback` path — no new fallback logic required.
- If `alarmSource` is `null` (seeded default presets, or any preset that's
  never had an alarm set), the local default alarm loads — identical to
  today's out-of-box behavior.
- Deleting a preset deletes its `alarmSource`/`alarmLinks` along with the
  rest of the preset object — no cross-preset cleanup needed, since links
  aren't referenced by id from anywhere else.
- The Spotify accordion section's existing connect/disconnect flow is
  unaffected: disconnecting Spotify still reverts the *currently loaded*
  source to local (existing behavior in `spotifyLogoutBtn` handler), but
  does not clear any preset's saved `alarmLinks.spotify` entries or
  `alarmSource` — those simply won't successfully load until the user
  reconnects.

## Testing

- Manual verification via CDP (per project convention) after
  implementation: create/switch between two presets with different saved
  YouTube links, confirm auto-switch on preset load; add/remove entries in
  both YouTube and Spotify lists and confirm persistence across a full app
  restart; verify the seeded default presets still load the local default
  alarm with no saved links; verify migration by seeding
  `localStorage.selectedAlarmPath` manually and confirming it lands in the
  active preset on next launch.
- No automated test suite exists in this repo (per CLAUDE.md) — this
  ships without new automated tests, consistent with the rest of the
  codebase.
