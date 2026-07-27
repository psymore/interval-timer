# Preset system enhancements — design

## Goal
Five related improvements to the preset system:
1. Default presets become fully editable and deletable, like any preset.
2. The preset trigger shows "+ Add Preset" when the preset list is empty.
3. Unsaved edits to the timer fields are never lost — captured in a dedicated
   "Last Session" preset that's always kept current.
4. Alarm changes update the preset list (and preset form) live, not just on
   next reopen.
5. The New/Edit Preset modals get an alarm-source navigator: shows the
   relevant alarm (icon + name) and opens the Alarm Sound modal on click.

## A. Default presets — fully editable & deletable

`js/presets.js`'s `buildPresetItem()` currently computes
`isDefault = preset.id.startsWith("default-")` and uses it to disable the
✎/✕ buttons and to swap the delete button's tooltip. Remove that gating
entirely — every preset (including the three seeded ones) gets working
edit/delete buttons. No backend change is needed: `presets:delete` in
`lib/presetsIpc.js` already has no protection against deleting a
`default-*` id.

**Empty-store edge case fix:** `presets:get-active` currently does
`presets.find(p => p.id === activeId) ?? presets[0]`. When `presets` is
empty, `presets[0]` is `undefined`, not `null`. Change the fallback to
`?? presets[0] ?? null` so callers consistently get `null` rather than
`undefined` once "zero presets" becomes a normal, reachable state.

Once this ships, `CLAUDE.md`'s Presets section ("Three seeded default
presets are not deletable by convention") is stale and should be updated
to describe the new behavior.

## B. Empty-state trigger label

In `js/presets.js`'s `renderPresets()`, the trigger label currently does
`active?.name ?? t("interval.presetsDefault")`. Change this so that when
`presets.length === 0` specifically (not just "no active preset" — that
case still shouldn't normally happen once any preset exists), the label
shows a new string, e.g. `t("presets.addPresetCta")` → "+ Add Preset" /
"+ Hazır Ayar Ekle". The trigger's click behavior is unchanged — it still
just opens the dropdown (which will show the empty state + the
"+ New preset" footer button).

## C. "Last Session" auto-tracking preset

A dedicated preset with a fixed id, `last-session`, that acts as an
autosave slot for whatever's currently in the Work/Break/Loop fields.

- In `js/intervalTimer.js`, add debounced (~500ms after the last
  keystroke) `input` listeners on workMinutes/workSeconds/breakMinutes/
  breakSeconds/loopCount.
- On the first edit that diverges the visible fields from the currently
  active preset's saved values: upsert `last-session` (create it if it
  doesn't exist, using a default name — `t("presets.lastSessionName")` →
  "Last Session") with the live field values plus the currently-active
  preset's `alarmSource`, then call `presetsSetActive("last-session")`
  and dispatch `preset-activated`/`preset-data-changed` so the UI (trigger
  label, preset list) reflects the switch.
- Subsequent edits, while `last-session` is already active, just upsert
  the same id with fresh numbers — no repeated re-activation.
- It's a fully normal preset after creation: renameable and deletable.
  Renaming it does not get overwritten by later syncs (syncs only touch
  the numeric fields + alarmSource, never the name). Deleting it is fine
  — the next field edit simply recreates it fresh under the default name.
- Because it becomes the *active* preset, restoring it on next launch is
  free — it reuses the existing "active preset loads into the fields on
  startup" path (`intervalTimer.js`'s `setupPresets(...).then(...)` +
  `applyPreset`). No quit-time hook is needed, and there's no risk of
  losing data if the app closes abruptly, since the store is written
  continuously as the user types (debounced), not just at exit.

**Known side effect (accepted):** the preset trigger label can change
mid-edit (e.g. from "Pomodoro" to "Last Session") the moment the user
starts typing in a field, signaling that they've diverged from the loaded
preset. This is intentional per the approved design.

## D. Live alarm → preset-list sync

`js/alarmModal.js` already persists every alarm change onto the active
preset via `saveActivePreset(patch)` (in `applyLocalFile`, `resetToDefault`,
`saveAlarmLink`, and the Spotify-logout revert path) — but nothing tells
the UI to refresh afterward. After each such save succeeds, dispatch:

```js
window.dispatchEvent(new CustomEvent("preset-data-changed"));
```

`js/presets.js` adds a listener for this event that calls the existing
`renderPresets()` (safe to call anytime — it fully rebuilds
`#presetsContainer` from scratch, same as the existing
`onLanguageChange` listener already does). The New/Edit Preset modal's
navigator (part E) listens for the same event to refresh its own preview
text while both are open.

## E. Alarm-source navigator in New & Edit Preset modals

Add a row to `.preset-form` (in `showPresetForm()`, `js/presets.js`)
showing `🎧 <name>` — reusing the same source-name resolution already
built for the preset list (`alarmSourceInfo()` / `sourceNames.js`'s
peek/resolve functions) so the label and async name-fill behavior are
consistent with the list. The row is a clickable button.

- **New Preset form:** shows the *currently active* preset's alarm (i.e.
  whatever `presetsGetActive()` returns right now — the same thing the
  Alarm Sound modal itself is currently displaying). This is exactly the
  value that gets baked into the new preset: `validate()`'s
  `presetsSave()` call is extended to include
  `alarmSource: <that captured value>` (today it omits `alarmSource`
  entirely for new presets, so they silently fall back to the local
  default).
- **Edit Preset form:** shows *that specific preset's own* `alarmSource`
  (`existingPreset.alarmSource`), which may differ from whatever is
  globally active.
- **Click behavior:** opens `#alarmFolderModal` (existing modal, just a
  toggled `<div>`, no new modal system needed). For the Edit form, if the
  preset being edited isn't already the active one, first call
  `presetsSetActive(preset.id)` so the Alarm modal — which always edits
  "whichever preset is active," an existing, unchanged mechanism — ends
  up editing the right preset. This does not disturb the main Interval
  tab's visible Work/Break/Loop fields (those only change via the
  separate `preset-activated` event / `applyPreset()`, which this flow
  does not trigger).
- **Stacking:** `.preset-overlay` and `#alarmFolderModal` share the same
  z-index tier and equal DOM-order tie-breaking currently favors whichever
  was added to the DOM later. To guarantee the Alarm modal is usable when
  opened from the preset form, the preset-form overlay is temporarily
  hidden (not destroyed — its input values are preserved) while the Alarm
  modal is open, and restored (with the navigator preview refreshed via
  the part D event) once the Alarm modal closes (its existing close
  button, Escape, or backdrop-click handlers).

## Out of scope
- No change to how the Alarm Sound modal itself works internally.
- No persistence of `last-session` history (only one slot, always
  overwritten).
- No special UI treatment distinguishing `last-session` from other
  presets in the list (no badge/icon) — it's a normal preset once created.
