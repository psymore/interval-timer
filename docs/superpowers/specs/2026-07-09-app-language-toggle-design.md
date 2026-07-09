# Language option for the Electron app (English/Turkish)

## Goal

Let the desktop app itself (not just the `docs/` landing page, which already
has this — see `2026-07-09-turkish-i18n-design.md`) be used fully in English
or Turkish: main window, both modals, the preset dropdown/form, and the
always-on-top mini window. The choice persists across restarts and stays in
sync between the main window and the mini window while both are open.

## Approach: `js/i18n/` module + electron-store persistence

No new dependency — same flat-key-lookup approach already proven on the
landing page, adapted to Electron's multi-window/main-process split:

- `js/i18n/translations.js` — `{ en: {...}, tr: {...} }` flat-key dictionaries
  (see Translation table below).
- `js/i18n/i18n.js` — the only module other renderer code imports:
  - `t(key)` — looks up the current language's string, falls back to English,
    falls back to the raw key if truly missing (never blank UI).
  - `getLanguage()` / `setLanguage(lang)` — `setLanguage` re-applies
    translations and persists via IPC.
  - `onLanguageChange(cb)` — subscribe for re-render hooks; returns an
    unsubscribe function.
  - `applyTranslations(root = document)` — walks `[data-i18n]` (sets
    `textContent`), `[data-i18n-aria-label]`, `[data-i18n-title]`,
    `[data-i18n-placeholder]` (sets the matching attribute) under `root`. Used
    both at startup and after `setLanguage`, and passed a subtree root when
    only a freshly-rendered piece (e.g. a preset form overlay) needs it.
  - `initLanguage()` — called once per window at startup: reads the persisted
    language via IPC, applies it, and subscribes to the main process's
    `language-changed` broadcast so a change made in the other window is
    picked up live.

**Persistence** follows the same pattern as presets: the main process owns
the data.

- `main.js`'s electron-store gets a new default: `language: "en"`.
- New `lib/settingsIpc.js`, registered from `main.js` (`registerSettingsIpc(store)`),
  mirrors `lib/presetsIpc.js`'s shape:
  - `settings:get-language` → `store.get("language")`, defaulting/repairing to
    `"en"` if the stored value isn't `"en"`/`"tr"` (e.g. corrupted store file).
  - `settings:set-language` → validates the value is `"en"`/`"tr"`, persists
    it, and — mirroring how `windows.js` already pushes `timer-state` to the
    mini window — sends a `language-changed` IPC event to the mini window if
    it's currently open (imports `getMiniWindow` from `lib/windows.js`).
- `preload.cjs` adds `languageGet`, `languageSet`, `onLanguageChanged`.

The **main window is the only place with the toggle control**; the mini
window is a pure follower (fetches on load, listens for `language-changed`
while open), matching its existing one-way `timer-state` relationship with
the main window.

## UI placement

A new `#languageBtn` button in `index.html`'s `.modal-buttons` row, right
before the existing separator/`quitAppBtn`, so it reads as a distinct control
at the top-right rather than blending into the icon row:

```html
<button type="button" id="languageBtn" class="icon-btn lang-btn"
  aria-label="Switch language" data-i18n-aria-label="topbar.languageBtn.ariaLabel">EN</button>
```

No new icon asset — text-only, styled with a new `.lang-btn` rule in
`css/styles.css` (reuses `.icon-btn` as a base, `width: auto`, `font-family:
var(--font-ui)`, matching how `.quit-btn` already extends `.icon-btn` with
text). Clicking toggles EN↔TR (two languages only, so a cycle/toggle is
simpler than a dropdown) and immediately updates its own label to the new
current language.

## Correctness fix bundled into this work

Two spots currently infer state by parsing *already-formatted, English*
display text — both break silently once that text is translated:

1. `js/renderer.js`'s quit handler does
   `text.includes("Running") || text.includes("Paused")` against the status
   `<p>`'s `textContent`. Fix: `js/timer.js` already keeps
   `stateBroadcaster` module-scoped — add `export function getTimerStatus()`.
   `js/intervalTimer.js` currently declares `stateBroadcaster` *inside*
   `setupIntervalTimer()`; lift the `let stateBroadcaster` declaration to
   module scope (assigned inside the function, as today) so
   `export function getIntervalStatus()` can read it too. The quit handler
   then checks `["running", "paused"].includes(getTimerStatus())` /
   `getIntervalStatus()` — real enum values, language-independent.
2. `js/intervalTimer.js`'s `getBaseState` recovers the interval phase by
   `document.getElementById("intervalPhase")?.textContent?.replace("Phase: ", "")`
   — i.e. it re-parses the very prefix it just localized away. Fix: track
   `currentPhase` as a plain variable (`"work"` / `"break"` / `""`) alongside
   `currentLoop`/`totalLoops`, updated in `onTick`/`onPhaseChange`/reset, and
   have `getBaseState` return that directly. `updateDisplay` and the
   completion/reset paths build the visible "Phase: …" string via `t()` from
   the same raw value instead of writing then re-reading DOM text.
   `js/mini.js` then translates the raw `state.phase` it receives
   (`t(`phase.${state.phase}`)`) instead of `state.phase.toUpperCase()`, so
   the mini window shows "ÇALIŞMA"/"MOLA" in Turkish instead of the raw
   English enum uppercased.

## Data flow summary

1. Main window startup: `initLanguage()` → IPC get → `applyTranslations(document)`
   → static text, ARIA labels, and placeholders across `index.html` are in
   the right language before first paint of dynamic state.
2. Dynamic text (status label, phase, preset dropdown/list, alarm-modal
   feedback strings) is produced by small functions that already re-run on
   every relevant state change (`setStatus`, `renderPresets`,
   `showFeedback`, etc.) — these switch from hardcoded strings to `t(key)`
   calls, so they're correct on their very next natural re-render. Each of
   `timer.js`, `intervalTimer.js`, `presets.js`, `alarmModal.js` also calls
   `onLanguageChange(() => reRenderItsOwnVisibleDynamicText())` once at setup,
   so currently-visible text (not just the next state transition) updates
   immediately when the toggle is clicked.
3. Toggle click (`renderer.js`): `setLanguage(next)` → applies locally,
   persists via `languageSet` IPC → main process stores it and — if the mini
   window is open — pushes `language-changed` to it.
4. Mini window: `initLanguage()` on `DOMContentLoaded` (same module, works
   identically even though `mini.html` loads via `loadFile` / a `file://`
   origin — `window.electronAPI` is attached by the preload regardless of
   origin) + `onLanguageChanged` subscription re-applies immediately if a
   change arrives while it's open.

## Scope

**In scope:** main window (tabs, both modals, preset dropdown + add/edit
form, quit-confirmation dialog) and the mini window (labels, phase/status
text, button tooltips/aria-labels).

**Out of scope (stays English), and why:**
- The native system-tray context menu (`lib/windows.js` `createTray`,
  "Open"/"Quit") — main-process-only UI, two items, not worth duplicating
  i18n plumbing into the main process for.
- Preset-save/delete error strings that originate in
  `lib/presetsIpc.js` (`"Maximum 20 presets allowed."`, `"Invalid preset
  data."`, `"Failed to save preset."`, etc.) — same reason: these are
  authored in the main process and returned over IPC as plain strings;
  translating them means either duplicating validation copy across the IPC
  boundary or building a small main-process i18n layer, neither of which is
  justified by five rarely-hit error strings. The renderer keeps displaying
  `result.error` verbatim.
- `<title>Timer App</title>` / `<title>Timer — Mini</title>` (window/taskbar
  titles) and the CSP `<meta>` — not user-facing copy.

## Files touched

New: `js/i18n/translations.js`, `js/i18n/i18n.js`, `lib/settingsIpc.js`.

Edited: `main.js`, `preload.cjs`, `index.html`, `mini.html`,
`js/views/timerView.js`, `js/views/intervalTimerView.js`, `js/renderer.js`,
`js/mini.js`, `js/timer.js`, `js/intervalTimer.js`,
`js/timerStateBroadcast.js`, `js/presets.js`, `js/alarmModal.js`,
`css/styles.css`.

## Error handling

- Corrupted/unexpected stored `language` value (anything other than
  `"en"`/`"tr"`) → treated as unset, falls back to `"en"`, and the bad value
  is overwritten on the next `settings:set-language` call.
- Missing translation key for the current language → falls back to the
  English string; missing from English too → renders the raw key (visibly
  wrong but never a blank/throwing UI, same philosophy as the landing page's
  i18n).
- IPC failure fetching the language at startup (store unreadable) → same
  fallback to `"en"`, caught the same way `presets:get-all` already catches
  and logs via `createLogger`.

## Translation table

Grouped by area; `{placeholder}` marks runtime interpolation done by plain
string substitution in the calling code (no template engine needed for this
few interpolations).

| Key | English | Turkish |
|---|---|---|
| `app.title` | Timer App | Zamanlayıcı Uygulaması |
| `tabs.interval` | Interval Timer | Aralık Sayacı |
| `tabs.timer` | Timer | Sayaç |
| `topbar.settingsBtn.ariaLabel` | Open settings | Ayarları aç |
| `topbar.alarmBtn.ariaLabel` | Choose alarm sound | Alarm sesini seç |
| `topbar.pinBtn.ariaLabel.pin` | Pin window on top | Pencereyi üstte sabitle |
| `topbar.pinBtn.ariaLabel.unpin` | Unpin window | Sabitlemeyi kaldır |
| `topbar.quitBtn.ariaLabel` | Quit application | Uygulamadan çık |
| `topbar.quitBtn.label` | Quit | Çıkış |
| `topbar.languageBtn.ariaLabel` | Switch language | Dili değiştir |
| `settings.title` | Alarm Settings | Alarm Ayarları |
| `settings.timerAlarmLength` | Alarm Length (seconds) | Alarm Süresi (saniye) |
| `settings.workAlarmLength` | Work Alarm (seconds) | Çalışma Alarmı (saniye) |
| `settings.breakAlarmLength` | Break Alarm (seconds) | Mola Alarmı (saniye) |
| `settings.save` | Save | Kaydet |
| `settings.close` | Close | Kapat |
| `alarm.title` | Alarm Sound | Alarm Sesi |
| `alarm.current` | Current | Mevcut |
| `alarm.defaultFile` | alarm.mp3 (default) | alarm.mp3 (varsayılan) |
| `alarm.fallbackFile` | alarm.mp3 (fallback) | alarm.mp3 (yedek) |
| `alarm.defaultLabel` | Default alarm | Varsayılan alarm |
| `alarm.localSectionLabel` | Local file | Yerel dosya |
| `alarm.chooseFile` | Choose file… | Dosya seç… |
| `alarm.urlSectionLabel` | YouTube or Spotify URL | YouTube veya Spotify bağlantısı |
| `alarm.urlPlaceholder` | https://youtube.com/watch?v=… or spotify link | https://youtube.com/watch?v=… ya da spotify bağlantısı |
| `alarm.urlLoad` | Load | Yükle |
| `alarm.urlLoading` | Loading… | Yükleniyor… |
| `alarm.urlHint` | Paste a YouTube video or Spotify track URL. Spotify links require connecting your account and play through the real Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback. | Bir YouTube videosu ya da Spotify parça bağlantısı yapıştırın. Spotify bağlantıları hesabınızı bağlamanızı gerektirir ve gerçek Spotify uygulaması üzerinden çalar (uygulama içi önizleme değil). Kullanılamıyorsa yedek olarak yerel alarm devreye girer. |
| `alarm.spotifySectionLabel` | Spotify | Spotify |
| `alarm.spotifyNotConnected` | Not connected | Bağlı değil |
| `alarm.spotifyConnected` | Connected | Bağlı |
| `alarm.spotifyConnect` | Connect Spotify | Spotify'a Bağlan |
| `alarm.spotifyConnecting` | Connecting… | Bağlanıyor… |
| `alarm.spotifyDisconnect` | Disconnect | Bağlantıyı Kes |
| `alarm.preview` | ▶ Preview | ▶ Önizle |
| `alarm.previewAriaLabel` | Preview alarm sound | Alarm sesini önizle |
| `alarm.stopPreview` | ⏹ Stop | ⏹ Durdur |
| `alarm.stopPreviewAriaLabel` | Stop preview | Önizlemeyi durdur |
| `alarm.previewDisabledTitle` | Preview isn't available for Spotify — playing opens the Spotify app directly. | Spotify için önizleme kullanılamaz — çalma işlemi doğrudan Spotify uygulamasını açar. |
| `alarm.done` | Done | Tamam |
| `alarm.feedback.fallback` | External alarm unavailable. Using local fallback. | Harici alarma ulaşılamıyor. Yerel yedek kullanılıyor. |
| `alarm.feedback.noFileSelected` | No file selected. | Dosya seçilmedi. |
| `alarm.feedback.fileLoaded` | "{name}" loaded as alarm. | "{name}" alarm olarak yüklendi. |
| `alarm.feedback.fileLoadError` | Could not load audio file. | Ses dosyası yüklenemedi. |
| `alarm.feedback.enterUrl` | Please enter a YouTube or Spotify URL. | Lütfen bir YouTube ya da Spotify bağlantısı girin. |
| `alarm.feedback.invalidUrl` | Please enter a valid YouTube or Spotify URL. | Lütfen geçerli bir YouTube ya da Spotify bağlantısı girin. |
| `alarm.feedback.providerFallback` | {provider} unavailable. Using local alarm as fallback. | {provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor. |
| `alarm.feedback.providerLoaded` | {provider} alarm loaded. | {provider} alarmı yüklendi. |
| `alarm.feedback.loadFailed` | Failed to load: {message} | Yükleme başarısız: {message} |
| `alarm.feedback.noAlarmLoaded` | No alarm loaded. Choose a file or URL first. | Yüklü alarm yok. Önce bir dosya ya da bağlantı seçin. |
| `alarm.feedback.playFailed` | Could not play alarm. Check the source. | Alarm çalınamadı. Kaynağı kontrol edin. |
| `alarm.feedback.spotifyConnected` | Spotify connected. | Spotify bağlandı. |
| `alarm.feedback.spotifyConnectFailed` | Spotify connection failed: {message} | Spotify bağlantısı başarısız: {message} |
| `alarm.feedback.spotifyDisconnected` | Spotify disconnected. | Spotify bağlantısı kesildi. |
| `timer.minutes` | Minutes: | Dakika: |
| `timer.seconds` | Seconds: | Saniye: |
| `timer.start` | Start | Başlat |
| `timer.pause` | Pause | Duraklat |
| `timer.continue` | Continue | Devam Et |
| `timer.stop` | Stop | Durdur |
| `timer.reset` | Reset | Sıfırla |
| `interval.presetsDefault` | Presets | Hazır Ayarlar |
| `interval.selectPresetAriaLabel` | Select preset | Hazır ayar seç |
| `interval.presetsListAriaLabel` | Presets | Hazır Ayarlar |
| `interval.addPreset` | + New preset | + Yeni hazır ayar |
| `interval.currentLoop` | Current Loop: | Mevcut Döngü: |
| `interval.start` | Start | Başlat |
| `interval.pause` | Pause | Duraklat |
| `interval.continue` | Continue | Devam Et |
| `interval.reset` | Reset | Sıfırla |
| `interval.workMinutes` | Work Minutes: | Çalışma Dakikası: |
| `interval.workSeconds` | Work Seconds: | Çalışma Saniyesi: |
| `interval.breakMinutes` | Break Minutes: | Mola Dakikası: |
| `interval.breakSeconds` | Break Seconds: | Mola Saniyesi: |
| `interval.loopCount` | Number of Loops: | Döngü Sayısı: |
| `status.ready` | Status: Ready | Durum: Hazır |
| `status.running` | Status: Running | Durum: Çalışıyor |
| `status.paused` | Status: Paused | Durum: Duraklatıldı |
| `status.stopped` | Status: Stopped | Durum: Durduruldu |
| `status.completed` | Status: Completed | Durum: Tamamlandı |
| `phase.label` | Phase | Evre |
| `phase.work` | Work | Çalışma |
| `phase.break` | Break | Mola |
| `phase.empty` | Phase: - | Evre: - |
| `mini.timer` | TIMER | SAYAÇ |
| `mini.interval` | INTERVAL | ARALIK |
| `mini.ready` | READY | HAZIR |
| `mini.paused` | PAUSED | DURAKLATILDI |
| `mini.completed` | COMPLETED | TAMAMLANDI |
| `mini.loop` | LOOP {current} / {total} | DÖNGÜ {current} / {total} |
| `mini.closeAriaLabel` | Close mini view | Mini görünümü kapat |
| `mini.pauseTitle` | Pause | Duraklat |
| `mini.pauseAriaLabel` | Pause timer | Sayacı duraklat |
| `mini.continueTitle` | Continue | Devam Et |
| `mini.continueAriaLabel` | Continue timer | Sayaca devam et |
| `mini.startTitle` | Start | Başlat |
| `mini.resetTitle` | Reset | Sıfırla |
| `mini.resetAriaLabel` | Reset timer | Sayacı sıfırla |
| `presets.emptyState` | No presets yet. | Henüz hazır ayar yok. |
| `presets.maxReachedTitle` | Maximum {max} presets reached | En fazla {max} hazır ayara ulaşıldı |
| `presets.loadAriaLabel` | Load {name} | {name} yükle |
| `presets.editTitle` | Edit | Düzenle |
| `presets.editAriaLabel` | Edit {name} | {name} düzenle |
| `presets.deleteTitle` | Delete | Sil |
| `presets.deleteAriaLabel` | Delete {name} | {name} sil |
| `presets.cannotDeleteDefaultTitle` | Cannot delete default | Varsayılan silinemez |
| `presets.deleteConfirm` | Delete? | Silinsin mi? |
| `presets.confirmYes` | Yes | Evet |
| `presets.confirmNo` | No | Hayır |
| `presets.editFormTitle` | Edit Preset | Hazır Ayarı Düzenle |
| `presets.newFormTitle` | New Preset | Yeni Hazır Ayar |
| `presets.nameLabel` | Name | İsim |
| `presets.namePlaceholder` | e.g. Morning Focus | örn. Sabah Odaklanması |
| `presets.workMinLabel` | Work min | Çalışma dk |
| `presets.workSecLabel` | Work sec | Çalışma sn |
| `presets.breakMinLabel` | Break min | Mola dk |
| `presets.breakSecLabel` | Break sec | Mola sn |
| `presets.loopsLabel` | Loops | Döngü |
| `presets.saveChanges` | Save changes | Değişiklikleri kaydet |
| `presets.createPreset` | Create preset | Hazır ayar oluştur |
| `presets.cancel` | Cancel | İptal |
| `presets.errorNameRequired` | Please enter a name. | Lütfen bir isim girin. |
| `presets.errorWorkDuration` | Work duration must be greater than 0. | Çalışma süresi 0'dan büyük olmalı. |
| `presets.errorDuplicateName` | A preset named "{name}" already exists. | "{name}" isimli bir hazır ayar zaten var. |
| `confirm.quitRunning` | A timer is currently running. Quit anyway? | Şu anda bir sayaç çalışıyor. Yine de çıkılsın mı? |

Not translated (provider brand names, unchanged in both languages):
"YouTube", "Spotify".

## Verification plan (manual, no test suite in this repo)

1. Launch the app fresh — confirm it renders in English and `#languageBtn`
   reads "EN".
2. Click the language button — confirm every visible static label (tabs,
   both modal titles/fields/buttons, preset dropdown trigger/empty state)
   switches to Turkish immediately, and the button now reads "TR".
3. Start a Timer countdown and an Interval loop (in turn) — confirm the
   status line and (for interval) the phase line show translated text, and
   that toggling language mid-run updates them live without resetting the
   timer.
4. Open the always-on-top mini window during a running interval — confirm
   its label/phase/loop text is in the current language, and toggling
   language from the main window updates the mini window live.
5. Open the preset "+ New preset" form and an existing preset's delete
   confirmation — confirm field labels, buttons, and the inline delete
   confirm are translated.
6. Trigger at least one alarm-modal feedback message (e.g. pick a local file,
   then load an invalid URL) in Turkish — confirm the feedback banner text
   is translated.
7. Start a timer, click Quit — confirm the confirmation dialog appears (in
   Turkish) and Cancel keeps the app open; confirm quitting while idle skips
   the dialog entirely (regression check for the status-parsing fix).
8. Quit and relaunch the app — confirm it comes back in Turkish (persistence
   via electron-store). Switch back to English, relaunch, confirm it stays
   English.
