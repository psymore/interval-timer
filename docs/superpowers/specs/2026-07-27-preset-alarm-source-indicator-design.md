# Preset alarm source indicator — design

## Goal
Each preset row in the presets dropdown should show, at a glance, where its alarm
sound comes from (Local Audio File / YouTube / Spotify) — without opening the
preset or the alarm modal.

## Data source
`preset.alarmSource` is already `{ type: "local"|"youtube"|"spotify", value }` or
`null`. A `null` `alarmSource` means the preset uses the built-in local default
alarm (`assets/audio/alarm.mp3`), so it resolves to `"local"` too:

```js
const sourceType = preset.alarmSource?.type ?? "local";
```

No new provider-detection logic is needed — `AlarmProviderFactory` is not
involved here since the type is already stored on the preset.

## Placement
Append the indicator as a fourth segment in the existing `.preset-item__meta`
row, after the loop count, reusing that row's existing style (`--font-mono`,
`0.68rem`, `--ink-muted`) and its `·` separator convention:

```
Morning Focus
⏱ 25m · ☕ 5m · ↻ 4 loops · 🎧 Spotify
```

This keeps it compact (no extra vertical space per row) and visually
secondary to the preset name, per the existing hierarchy
(`.preset-item__name` is bold/full-color; `.preset-item__meta` is muted/small).

## Icon
Single consistent icon (🎧) for all three source types — the label text
differentiates them, matching how `⏱`/`☕`/`↻` are each a fixed icon for a
fixed kind of metric rather than varying per value.

## Labels (i18n)
New keys in `js/i18n/translations.js` (English + Turkish, matching existing
`presets.*` key style):
- `presets.sourceLocal` → "Local Audio File" / "Yerel Ses Dosyası"
- `presets.sourceYoutube` → "YouTube" / "YouTube"
- `presets.sourceSpotify` → "Spotify" / "Spotify"

## Implementation surface
- `js/presets.js` — `buildPresetItem()`: compute `sourceType`, append the new
  `<span>` to the existing `.preset-item__meta` markup.
- `css/styles.css` — no new rules needed; the new span inherits
  `.preset-item__meta` styling as a plain child (same as the existing `⏱`/`☕`/`↻`
  text nodes).
- `js/i18n/translations.js` — three new keys, both locales.

## Out of scope
- No change to the alarm modal, provider factory, or preset form.
- No per-source color coding or distinct icons — kept minimal per the request.
