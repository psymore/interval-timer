# App Language Toggle (English/Turkish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Electron app (main window + mini window) be used fully in English or Turkish, toggled from a button in the main window, persisted via electron-store, and kept in sync between windows.

**Architecture:** A new `js/i18n/` module (`translations.js` flat-key dictionaries + `i18n.js` lookup/apply/subscribe API) is the single source other renderer code imports. Persistence follows the existing presets pattern: main-process electron-store + `lib/settingsIpc.js` IPC handlers + `preload.cjs` bridge methods, with a `language-changed` push to the mini window mirroring how `timer-state` already flows one-way main→mini.

**Tech Stack:** Vanilla ES modules, Electron IPC (`ipcMain.handle`/`contextBridge`), `electron-store`. No new dependencies, no test framework (this repo has none — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-07-09-app-language-toggle-design.md` — read it first for the full translation table and rationale; this plan doesn't repeat every translation-table row inline where a task can just say "use the table in the spec."

## Global Constraints

- No test suite or lint script exists in this repo (`npm test` is a stub — see `CLAUDE.md`). Every task's "verification" step is a manual run of `npm start` and/or a DevTools console check — do not add a test framework.
- Use double-quoted JS strings, matching the rest of the codebase.
- **The static-vs-dynamic text rule (apply consistently in every task):**
  - **Static-forever text** (button labels, section headers, modal titles, form field labels, placeholders, aria-labels that never change for other reasons) → gets a `data-i18n` / `data-i18n-aria-label` / `data-i18n-title` / `data-i18n-placeholder` attribute in its HTML. `applyTranslations(document)` (called once at startup and again on every `setLanguage()`) is the only thing that ever touches its text.
  - **State-driven text** (status label, phase label, mini-window countdown/phase/label/loop, preset dropdown's active-preset-name trigger label, alarm-modal current-file/feedback/spotify-status/button-toggle text) → **never** gets a `data-i18n*` attribute (a global re-scan would stomp the real current state with the raw default translation). Instead the function that already updates it on state changes calls `t()`/`format()` directly, and that same module adds one `onLanguageChange(() => refreshItsOwnDisplay())` subscription so a language toggle refreshes it too, using the *current* state, not a reset default.
- New IPC channels follow the existing `namespace:action` naming already used by `presets:*` / `spotify:*`.
- New electron-store key: `language`, default `"en"`, only ever `"en"` or `"tr"`.

---

### Task 1: i18n core module

**Files:**
- Create: `js/i18n/translations.js`
- Create: `js/i18n/i18n.js`

**Interfaces:**
- Produces (from `js/i18n/i18n.js`, all named exports): `t(key: string): string`, `format(str: string, vars?: Record<string,string|number>): string`, `getLanguage(): string`, `setLanguage(lang: string, opts?: { persist?: boolean }): Promise<void>`, `onLanguageChange(cb: (lang: string) => void): () => void`, `applyTranslations(root?: Document|Element): void`, `initLanguage(): Promise<void>`.
- Consumes: `window.electronAPI.languageGet()`, `window.electronAPI.languageSet(lang)`, `window.electronAPI.onLanguageChanged(cb)` — these don't exist yet (Task 2 adds them), but `t()`/`format()`/`applyTranslations()` don't touch `window.electronAPI` at all, so this task is fully verifiable standalone.

- [ ] **Step 1: Create `js/i18n/translations.js`**

Copy the full translation table from `docs/superpowers/specs/2026-07-09-app-language-toggle-design.md` into a flat-key object, one property per table row, exactly like `docs/assets/i18n.js`'s existing `en`/`tr` shape:

```js
export const translations = {
  en: {
    "app.title": "Timer App",
    "tabs.interval": "Interval Timer",
    "tabs.timer": "Timer",
    "topbar.settingsBtn.ariaLabel": "Open settings",
    "topbar.alarmBtn.ariaLabel": "Choose alarm sound",
    "topbar.pinBtn.ariaLabel.pin": "Pin window on top",
    "topbar.pinBtn.ariaLabel.unpin": "Unpin window",
    "topbar.quitBtn.ariaLabel": "Quit application",
    "topbar.quitBtn.label": "Quit",
    "topbar.languageBtn.ariaLabel": "Switch language",
    "settings.title": "Alarm Settings",
    "settings.timerAlarmLength": "Alarm Length (seconds)",
    "settings.workAlarmLength": "Work Alarm (seconds)",
    "settings.breakAlarmLength": "Break Alarm (seconds)",
    "settings.save": "Save",
    "settings.close": "Close",
    "alarm.title": "Alarm Sound",
    "alarm.current": "Current",
    "alarm.defaultFile": "alarm.mp3 (default)",
    "alarm.fallbackFile": "alarm.mp3 (fallback)",
    "alarm.defaultLabel": "Default alarm",
    "alarm.localSectionLabel": "Local file",
    "alarm.chooseFile": "Choose file…",
    "alarm.urlSectionLabel": "YouTube or Spotify URL",
    "alarm.urlPlaceholder": "https://youtube.com/watch?v=… or spotify link",
    "alarm.urlLoad": "Load",
    "alarm.urlLoading": "Loading…",
    "alarm.urlHint": "Paste a YouTube video or Spotify track URL. Spotify links require connecting your account and play through the real Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.",
    "alarm.spotifySectionLabel": "Spotify",
    "alarm.spotifyNotConnected": "Not connected",
    "alarm.spotifyConnected": "Connected",
    "alarm.spotifyConnect": "Connect Spotify",
    "alarm.spotifyConnecting": "Connecting…",
    "alarm.spotifyDisconnect": "Disconnect",
    "alarm.preview": "▶ Preview",
    "alarm.previewAriaLabel": "Preview alarm sound",
    "alarm.stopPreview": "⏹ Stop",
    "alarm.stopPreviewAriaLabel": "Stop preview",
    "alarm.previewDisabledTitle": "Preview isn't available for Spotify — playing opens the Spotify app directly.",
    "alarm.done": "Done",
    "alarm.feedback.fallback": "External alarm unavailable. Using local fallback.",
    "alarm.feedback.noFileSelected": "No file selected.",
    "alarm.feedback.fileLoaded": "\"{name}\" loaded as alarm.",
    "alarm.feedback.fileLoadError": "Could not load audio file.",
    "alarm.feedback.enterUrl": "Please enter a YouTube or Spotify URL.",
    "alarm.feedback.invalidUrl": "Please enter a valid YouTube or Spotify URL.",
    "alarm.feedback.providerFallback": "{provider} unavailable. Using local alarm as fallback.",
    "alarm.feedback.providerLoaded": "{provider} alarm loaded.",
    "alarm.feedback.loadFailed": "Failed to load: {message}",
    "alarm.feedback.noAlarmLoaded": "No alarm loaded. Choose a file or URL first.",
    "alarm.feedback.playFailed": "Could not play alarm. Check the source.",
    "alarm.feedback.spotifyConnected": "Spotify connected.",
    "alarm.feedback.spotifyConnectFailed": "Spotify connection failed: {message}",
    "alarm.feedback.spotifyDisconnected": "Spotify disconnected.",
    "timer.minutes": "Minutes:",
    "timer.seconds": "Seconds:",
    "timer.start": "Start",
    "timer.pause": "Pause",
    "timer.continue": "Continue",
    "timer.stop": "Stop",
    "timer.reset": "Reset",
    "interval.presetsDefault": "Presets",
    "interval.selectPresetAriaLabel": "Select preset",
    "interval.presetsListAriaLabel": "Presets",
    "interval.addPreset": "+ New preset",
    "interval.currentLoop": "Current Loop:",
    "interval.start": "Start",
    "interval.pause": "Pause",
    "interval.continue": "Continue",
    "interval.reset": "Reset",
    "interval.workMinutes": "Work Minutes:",
    "interval.workSeconds": "Work Seconds:",
    "interval.breakMinutes": "Break Minutes:",
    "interval.breakSeconds": "Break Seconds:",
    "interval.loopCount": "Number of Loops:",
    "status.ready": "Status: Ready",
    "status.running": "Status: Running",
    "status.paused": "Status: Paused",
    "status.stopped": "Status: Stopped",
    "status.completed": "Status: Completed",
    "phase.label": "Phase",
    "phase.work": "Work",
    "phase.break": "Break",
    "phase.empty": "Phase: -",
    "mini.timer": "TIMER",
    "mini.interval": "INTERVAL",
    "mini.ready": "READY",
    "mini.paused": "PAUSED",
    "mini.completed": "COMPLETED",
    "mini.loop": "LOOP {current} / {total}",
    "mini.closeAriaLabel": "Close mini view",
    "mini.pauseTitle": "Pause",
    "mini.pauseAriaLabel": "Pause timer",
    "mini.continueTitle": "Continue",
    "mini.continueAriaLabel": "Continue timer",
    "mini.startTitle": "Start",
    "mini.resetTitle": "Reset",
    "mini.resetAriaLabel": "Reset timer",
    "presets.emptyState": "No presets yet.",
    "presets.maxReachedTitle": "Maximum {max} presets reached",
    "presets.loadAriaLabel": "Load {name}",
    "presets.editTitle": "Edit",
    "presets.editAriaLabel": "Edit {name}",
    "presets.deleteTitle": "Delete",
    "presets.deleteAriaLabel": "Delete {name}",
    "presets.cannotDeleteDefaultTitle": "Cannot delete default",
    "presets.deleteConfirm": "Delete?",
    "presets.confirmYes": "Yes",
    "presets.confirmNo": "No",
    "presets.editFormTitle": "Edit Preset",
    "presets.newFormTitle": "New Preset",
    "presets.nameLabel": "Name",
    "presets.namePlaceholder": "e.g. Morning Focus",
    "presets.workMinLabel": "Work min",
    "presets.workSecLabel": "Work sec",
    "presets.breakMinLabel": "Break min",
    "presets.breakSecLabel": "Break sec",
    "presets.loopsLabel": "Loops",
    "presets.saveChanges": "Save changes",
    "presets.createPreset": "Create preset",
    "presets.cancel": "Cancel",
    "presets.errorNameRequired": "Please enter a name.",
    "presets.errorWorkDuration": "Work duration must be greater than 0.",
    "presets.errorDuplicateName": "A preset named \"{name}\" already exists.",
    "confirm.quitRunning": "A timer is currently running. Quit anyway?",
  },
  tr: {
    "app.title": "Zamanlayıcı Uygulaması",
    "tabs.interval": "Aralık Sayacı",
    "tabs.timer": "Sayaç",
    "topbar.settingsBtn.ariaLabel": "Ayarları aç",
    "topbar.alarmBtn.ariaLabel": "Alarm sesini seç",
    "topbar.pinBtn.ariaLabel.pin": "Pencereyi üstte sabitle",
    "topbar.pinBtn.ariaLabel.unpin": "Sabitlemeyi kaldır",
    "topbar.quitBtn.ariaLabel": "Uygulamadan çık",
    "topbar.quitBtn.label": "Çıkış",
    "topbar.languageBtn.ariaLabel": "Dili değiştir",
    "settings.title": "Alarm Ayarları",
    "settings.timerAlarmLength": "Alarm Süresi (saniye)",
    "settings.workAlarmLength": "Çalışma Alarmı (saniye)",
    "settings.breakAlarmLength": "Mola Alarmı (saniye)",
    "settings.save": "Kaydet",
    "settings.close": "Kapat",
    "alarm.title": "Alarm Sesi",
    "alarm.current": "Mevcut",
    "alarm.defaultFile": "alarm.mp3 (varsayılan)",
    "alarm.fallbackFile": "alarm.mp3 (yedek)",
    "alarm.defaultLabel": "Varsayılan alarm",
    "alarm.localSectionLabel": "Yerel dosya",
    "alarm.chooseFile": "Dosya seç…",
    "alarm.urlSectionLabel": "YouTube veya Spotify bağlantısı",
    "alarm.urlPlaceholder": "https://youtube.com/watch?v=… ya da spotify bağlantısı",
    "alarm.urlLoad": "Yükle",
    "alarm.urlLoading": "Yükleniyor…",
    "alarm.urlHint": "Bir YouTube videosu ya da Spotify parça bağlantısı yapıştırın. Spotify bağlantıları hesabınızı bağlamanızı gerektirir ve gerçek Spotify uygulaması üzerinden çalar (uygulama içi önizleme değil). Kullanılamıyorsa yedek olarak yerel alarm devreye girer.",
    "alarm.spotifySectionLabel": "Spotify",
    "alarm.spotifyNotConnected": "Bağlı değil",
    "alarm.spotifyConnected": "Bağlı",
    "alarm.spotifyConnect": "Spotify'a Bağlan",
    "alarm.spotifyConnecting": "Bağlanıyor…",
    "alarm.spotifyDisconnect": "Bağlantıyı Kes",
    "alarm.preview": "▶ Önizle",
    "alarm.previewAriaLabel": "Alarm sesini önizle",
    "alarm.stopPreview": "⏹ Durdur",
    "alarm.stopPreviewAriaLabel": "Önizlemeyi durdur",
    "alarm.previewDisabledTitle": "Spotify için önizleme kullanılamaz — çalma işlemi doğrudan Spotify uygulamasını açar.",
    "alarm.done": "Tamam",
    "alarm.feedback.fallback": "Harici alarma ulaşılamıyor. Yerel yedek kullanılıyor.",
    "alarm.feedback.noFileSelected": "Dosya seçilmedi.",
    "alarm.feedback.fileLoaded": "\"{name}\" alarm olarak yüklendi.",
    "alarm.feedback.fileLoadError": "Ses dosyası yüklenemedi.",
    "alarm.feedback.enterUrl": "Lütfen bir YouTube ya da Spotify bağlantısı girin.",
    "alarm.feedback.invalidUrl": "Lütfen geçerli bir YouTube ya da Spotify bağlantısı girin.",
    "alarm.feedback.providerFallback": "{provider} kullanılamıyor. Yedek olarak yerel alarm kullanılıyor.",
    "alarm.feedback.providerLoaded": "{provider} alarmı yüklendi.",
    "alarm.feedback.loadFailed": "Yükleme başarısız: {message}",
    "alarm.feedback.noAlarmLoaded": "Yüklü alarm yok. Önce bir dosya ya da bağlantı seçin.",
    "alarm.feedback.playFailed": "Alarm çalınamadı. Kaynağı kontrol edin.",
    "alarm.feedback.spotifyConnected": "Spotify bağlandı.",
    "alarm.feedback.spotifyConnectFailed": "Spotify bağlantısı başarısız: {message}",
    "alarm.feedback.spotifyDisconnected": "Spotify bağlantısı kesildi.",
    "timer.minutes": "Dakika:",
    "timer.seconds": "Saniye:",
    "timer.start": "Başlat",
    "timer.pause": "Duraklat",
    "timer.continue": "Devam Et",
    "timer.stop": "Durdur",
    "timer.reset": "Sıfırla",
    "interval.presetsDefault": "Hazır Ayarlar",
    "interval.selectPresetAriaLabel": "Hazır ayar seç",
    "interval.presetsListAriaLabel": "Hazır Ayarlar",
    "interval.addPreset": "+ Yeni hazır ayar",
    "interval.currentLoop": "Mevcut Döngü:",
    "interval.start": "Başlat",
    "interval.pause": "Duraklat",
    "interval.continue": "Devam Et",
    "interval.reset": "Sıfırla",
    "interval.workMinutes": "Çalışma Dakikası:",
    "interval.workSeconds": "Çalışma Saniyesi:",
    "interval.breakMinutes": "Mola Dakikası:",
    "interval.breakSeconds": "Mola Saniyesi:",
    "interval.loopCount": "Döngü Sayısı:",
    "status.ready": "Durum: Hazır",
    "status.running": "Durum: Çalışıyor",
    "status.paused": "Durum: Duraklatıldı",
    "status.stopped": "Durum: Durduruldu",
    "status.completed": "Durum: Tamamlandı",
    "phase.label": "Evre",
    "phase.work": "Çalışma",
    "phase.break": "Mola",
    "phase.empty": "Evre: -",
    "mini.timer": "SAYAÇ",
    "mini.interval": "ARALIK",
    "mini.ready": "HAZIR",
    "mini.paused": "DURAKLATILDI",
    "mini.completed": "TAMAMLANDI",
    "mini.loop": "DÖNGÜ {current} / {total}",
    "mini.closeAriaLabel": "Mini görünümü kapat",
    "mini.pauseTitle": "Duraklat",
    "mini.pauseAriaLabel": "Sayacı duraklat",
    "mini.continueTitle": "Devam Et",
    "mini.continueAriaLabel": "Sayaca devam et",
    "mini.startTitle": "Başlat",
    "mini.resetTitle": "Sıfırla",
    "mini.resetAriaLabel": "Sayacı sıfırla",
    "presets.emptyState": "Henüz hazır ayar yok.",
    "presets.maxReachedTitle": "En fazla {max} hazır ayara ulaşıldı",
    "presets.loadAriaLabel": "{name} yükle",
    "presets.editTitle": "Düzenle",
    "presets.editAriaLabel": "{name} düzenle",
    "presets.deleteTitle": "Sil",
    "presets.deleteAriaLabel": "{name} sil",
    "presets.cannotDeleteDefaultTitle": "Varsayılan silinemez",
    "presets.deleteConfirm": "Silinsin mi?",
    "presets.confirmYes": "Evet",
    "presets.confirmNo": "Hayır",
    "presets.editFormTitle": "Hazır Ayarı Düzenle",
    "presets.newFormTitle": "Yeni Hazır Ayar",
    "presets.nameLabel": "İsim",
    "presets.namePlaceholder": "örn. Sabah Odaklanması",
    "presets.workMinLabel": "Çalışma dk",
    "presets.workSecLabel": "Çalışma sn",
    "presets.breakMinLabel": "Mola dk",
    "presets.breakSecLabel": "Mola sn",
    "presets.loopsLabel": "Döngü",
    "presets.saveChanges": "Değişiklikleri kaydet",
    "presets.createPreset": "Hazır ayar oluştur",
    "presets.cancel": "İptal",
    "presets.errorNameRequired": "Lütfen bir isim girin.",
    "presets.errorWorkDuration": "Çalışma süresi 0'dan büyük olmalı.",
    "presets.errorDuplicateName": "\"{name}\" isimli bir hazır ayar zaten var.",
    "confirm.quitRunning": "Şu anda bir sayaç çalışıyor. Yine de çıkılsın mı?",
  },
};
```

- [ ] **Step 2: Create `js/i18n/i18n.js`**

```js
import { translations } from "./translations.js";

const DEFAULT_LANGUAGE = "en";
let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();

export function getLanguage() {
  return currentLanguage;
}

export function t(key) {
  return (
    translations[currentLanguage]?.[key] ??
    translations[DEFAULT_LANGUAGE]?.[key] ??
    key
  );
}

export function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
    str,
  );
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
}

export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function setLanguage(lang, { persist = true } = {}) {
  if (!translations[lang] || lang === currentLanguage) return;
  currentLanguage = lang;
  applyTranslations(document);
  listeners.forEach(cb => cb(lang));
  if (persist) {
    try {
      await window.electronAPI.languageSet(lang);
    } catch (e) {
      console.warn("Failed to persist language:", e);
    }
  }
}

export async function initLanguage() {
  try {
    const stored = await window.electronAPI.languageGet();
    currentLanguage = translations[stored] ? stored : DEFAULT_LANGUAGE;
  } catch (e) {
    console.warn("Failed to read stored language:", e);
    currentLanguage = DEFAULT_LANGUAGE;
  }
  applyTranslations(document);
  window.electronAPI.onLanguageChanged(lang => {
    if (!translations[lang] || lang === currentLanguage) return;
    currentLanguage = lang;
    applyTranslations(document);
    listeners.forEach(cb => cb(lang));
  });
}
```

- [ ] **Step 3: Verify the pure lookup logic in isolation**

Run (from the repo root):

```bash
node --input-type=module -e "
import { translations } from './js/i18n/translations.js';
console.log(Object.keys(translations.en).length, Object.keys(translations.tr).length);
const missing = Object.keys(translations.en).filter(k => !(k in translations.tr));
console.log('missing in tr:', missing);
"
```

Expected: both counts print the same number (every `en` key exists in `tr`), and `missing in tr:` is an empty array. This does **not** exercise `t()`/`applyTranslations()` (those touch `document`/`window.electronAPI`, unavailable under plain Node) — that happens end-to-end once Task 3 wires it into the renderer.

- [ ] **Step 4: Commit**

```bash
git add js/i18n/translations.js js/i18n/i18n.js
git commit -m "feat(i18n): add translation dictionaries and i18n lookup module"
```

---

### Task 2: Main-process language persistence + preload bridge

**Files:**
- Create: `lib/settingsIpc.js`
- Modify: `main.js:29-66` (store defaults), `main.js:20-21` and `main.js:85` (import + register)
- Modify: `preload.cjs:36` (before the closing brace)

**Interfaces:**
- Consumes: `lib/windows.js`'s existing `export function getMiniWindow()`.
- Produces: IPC channels `settings:get-language` (invoke, returns `"en"|"tr"`), `settings:set-language` (invoke with a language string, returns `{ language }` or `{ error }`), `language-changed` (main→mini push event). `window.electronAPI.languageGet()`, `window.electronAPI.languageSet(lang)`, `window.electronAPI.onLanguageChanged(cb)` — these are what Task 1's `i18n.js` calls.

- [ ] **Step 1: Create `lib/settingsIpc.js`**

```js
import { ipcMain } from "electron";

import { createLogger } from "./logger.js";
import { getMiniWindow } from "./windows.js";

const log = createLogger("settings");

const SUPPORTED_LANGUAGES = ["en", "tr"];
const DEFAULT_LANGUAGE = "en";

export function registerSettingsIpc(store) {
  ipcMain.handle("settings:get-language", () => {
    try {
      const lang = store.get("language");
      return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
    } catch (e) {
      log.error("settings:get-language error:", e);
      return DEFAULT_LANGUAGE;
    }
  });

  ipcMain.handle("settings:set-language", (_event, lang) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return { error: "Unsupported language." };
    }
    try {
      store.set("language", lang);
      const miniWindow = getMiniWindow();
      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send("language-changed", lang);
      }
      return { language: lang };
    } catch (e) {
      log.error("settings:set-language error:", e);
      return { error: "Failed to save language." };
    }
  });
}
```

- [ ] **Step 2: Add the `language` default to the store in `main.js`**

Find this block (around line 29-66):

```js
const store = new Store({
  name: "timer-config",
  defaults: {
    presets: [
```

Change the `defaults` object to add `language` alongside the existing `presets`/`activePresetId` keys — insert right after the closing `],` of `activePresetId: "default-pomodoro",`:

```js
    activePresetId: "default-pomodoro",
    language: "en",
  },
});
```

- [ ] **Step 3: Wire up the new IPC module in `main.js`**

Find:

```js
import { registerPresetsIpc } from "./lib/presetsIpc.js";
```

Add right after it:

```js
import { registerSettingsIpc } from "./lib/settingsIpc.js";
```

Find:

```js
registerPresetsIpc(store);
```

Add right after it:

```js
registerSettingsIpc(store);
```

- [ ] **Step 4: Add the bridge methods in `preload.cjs`**

Find the `// Presets` section and add a new section right after the `spotifyClearTokens` line, before the closing `});`:

```js
  // Language
  languageGet: () => ipcRenderer.invoke("settings:get-language"),
  languageSet: lang => ipcRenderer.invoke("settings:set-language", lang),
  onLanguageChanged: cb =>
    ipcRenderer.on("language-changed", (_e, lang) => cb(lang)),
```

- [ ] **Step 5: Verify manually**

```bash
npm start
```

With the app running, open DevTools on the main window (Ctrl+Shift+I) and run in the console:

```js
await window.electronAPI.languageGet()          // → "en"
await window.electronAPI.languageSet("tr")      // → { language: "tr" }
await window.electronAPI.languageGet()          // → "tr"
await window.electronAPI.languageSet("fr")      // → { error: "Unsupported language." }
```

Then quit the app (close the window fully, not just hide it — use the tray "Quit" or the in-app Quit button) and relaunch with `npm start`; run `await window.electronAPI.languageGet()` again and confirm it still returns `"tr"` (electron-store persisted it to `timer-config.json`). Finally run `await window.electronAPI.languageSet("en")` to reset state for the next task.

- [ ] **Step 6: Commit**

```bash
git add lib/settingsIpc.js main.js preload.cjs
git commit -m "feat(i18n): persist language preference via electron-store + IPC"
```

---

### Task 3: Static markup wiring + toggle button (main window)

**Files:**
- Modify: `index.html`
- Modify: `js/views/timerView.js`
- Modify: `js/views/intervalTimerView.js`
- Modify: `js/renderer.js`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes: `initLanguage`, `setLanguage`, `getLanguage`, `t` from `js/i18n/i18n.js` (Task 1); `window.electronAPI.languageGet/languageSet/onLanguageChanged` (Task 2, already verified working).
- Produces: `#languageBtn` in the DOM (consumed visually only, no other task reads it), and the app-wide startup call to `initLanguage()` that every later task's `onLanguageChange` subscription relies on having run once.

- [ ] **Step 1: Add `data-i18n*` attributes to `index.html`'s static text**

Apply these exact replacements (each shown as before → after):

Title:
```html
<h1 class="gradient-title">Timer App</h1>
```
→
```html
<h1 class="gradient-title" data-i18n="app.title">Timer App</h1>
```

Tab buttons:
```html
<button type="button" class="active" data-tab="interval">Interval Timer</button>
<button type="button" data-tab="timer">Timer</button>
```
→
```html
<button type="button" class="active" data-tab="interval" data-i18n="tabs.interval">Interval Timer</button>
<button type="button" data-tab="timer" data-i18n="tabs.timer">Timer</button>
```

Top-bar icon buttons — add `data-i18n-aria-label` and, for `quitAppBtn`, wrap its text node in a `<span>` (a bare `data-i18n` on the button would wipe out its `<img>` sibling since `applyTranslations` sets `textContent`), and insert the new `#languageBtn` right before it:

```html
        <div class="modal-buttons">
            <button type="button" id="settingsIcon" class="icon-btn" aria-label="Open settings">
                <img src="assets/adjust.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="alarmFolderBtn" class="icon-btn" aria-label="Choose alarm sound">
                <img src="assets/alarm-clock.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="alwaysOnTopBtn" class="icon-btn" aria-label="Pin window on top" aria-pressed="false">
                <img src="assets/pinned.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="quitAppBtn" class="icon-btn quit-btn" aria-label="Quit application">
                <img src="assets/power.png" alt="" class="icon-img" />
                Quit
            </button>

        </div>
```
→
```html
        <div class="modal-buttons">
            <button type="button" id="settingsIcon" class="icon-btn" aria-label="Open settings"
                data-i18n-aria-label="topbar.settingsBtn.ariaLabel">
                <img src="assets/adjust.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="alarmFolderBtn" class="icon-btn" aria-label="Choose alarm sound"
                data-i18n-aria-label="topbar.alarmBtn.ariaLabel">
                <img src="assets/alarm-clock.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="alwaysOnTopBtn" class="icon-btn" aria-label="Pin window on top" aria-pressed="false"
                data-i18n-aria-label="topbar.pinBtn.ariaLabel.pin">
                <img src="assets/pinned.png" alt="" class="icon-img" />
            </button>
            <button type="button" id="languageBtn" class="icon-btn lang-btn" aria-label="Switch language"
                data-i18n-aria-label="topbar.languageBtn.ariaLabel">EN</button>
            <button type="button" id="quitAppBtn" class="icon-btn quit-btn" aria-label="Quit application"
                data-i18n-aria-label="topbar.quitBtn.ariaLabel">
                <img src="assets/power.png" alt="" class="icon-img" />
                <span data-i18n="topbar.quitBtn.label">Quit</span>
            </button>

        </div>
```

Settings modal — wrap each label's text in a `<span>` (matching the pattern already used in `js/views/timerView.js`/`intervalTimerView.js`, since a bare `data-i18n` on the `<label>` would wipe out the nested `<input>`):

```html
            <h2 id="settingsTitle">Alarm Settings</h2>
            <div id="timerSettings" class="settings-group hidden">
                <label for="timerAlarmLength">
                    Alarm Length (seconds)
                    <input type="number" id="timerAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div id="intervalSettings" class="settings-group hidden">
                <label for="workAlarmLength">
                    Work Alarm (seconds)
                    <input type="number" id="workAlarmLength" min="1" value="5" />
                </label>
                <label for="breakAlarmLength">
                    Break Alarm (seconds)
                    <input type="number" id="breakAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div class="button-group">
                <button type="button" id="saveSettingsBtn">Save</button>
                <button type="button" id="closeSettingsBtn">Close</button>
            </div>
```
→
```html
            <h2 id="settingsTitle" data-i18n="settings.title">Alarm Settings</h2>
            <div id="timerSettings" class="settings-group hidden">
                <label for="timerAlarmLength">
                    <span data-i18n="settings.timerAlarmLength">Alarm Length (seconds)</span>
                    <input type="number" id="timerAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div id="intervalSettings" class="settings-group hidden">
                <label for="workAlarmLength">
                    <span data-i18n="settings.workAlarmLength">Work Alarm (seconds)</span>
                    <input type="number" id="workAlarmLength" min="1" value="5" />
                </label>
                <label for="breakAlarmLength">
                    <span data-i18n="settings.breakAlarmLength">Break Alarm (seconds)</span>
                    <input type="number" id="breakAlarmLength" min="1" value="5" />
                </label>
            </div>
            <div class="button-group">
                <button type="button" id="saveSettingsBtn" data-i18n="settings.save">Save</button>
                <button type="button" id="closeSettingsBtn" data-i18n="settings.close">Close</button>
            </div>
```

Alarm Sound modal — static parts only (dynamic bits like `alarmCurrentFile`, `alarmProviderTag`, `spotifyStatusLabel`, button toggle states, and `alarmFeedback` are handled in Task 7 via direct `t()` calls, per the Global Constraints rule):

```html
            <h2 id="alarmTitle">Alarm Sound</h2>

            <!-- Mevcut kaynak -->
            <div class="alarm-current">
                <span class="alarm-current-label">Current</span>
                <span class="alarm-current-file" id="alarmCurrentFile">alarm.mp3 (default)</span>
                <span class="alarm-provider-tag hidden" id="alarmProviderTag"></span>
            </div>

            <!-- Local dosya seçimi -->
            <div class="alarm-section">
                <p class="alarm-section-label">Local file</p>
                <button type="button" id="chooseAlarmBtn" class="btn-primary">Choose file…</button>
            </div>

            <!-- URL ile yükleme -->
            <div class="alarm-section">
                <p class="alarm-section-label">YouTube or Spotify URL</p>
                <div class="alarm-url-row">
                    <input id="alarmUrlInput" type="url" placeholder="https://youtube.com/watch?v=… or spotify link"
                        autocomplete="off" spellcheck="false" />
                    <button type="button" id="alarmUrlLoadBtn">Load</button>
                </div>
                <p class="alarm-url-hint">
                    Paste a YouTube video or Spotify track URL. Spotify links
                    require connecting your account and play through the real
                    Spotify app (not an in-app preview).
                    If unavailable, local alarm will be used as fallback.
                </p>
            </div>

            <!-- Spotify account -->
            <div class="alarm-section">
                <p class="alarm-section-label">Spotify</p>
                <div class="alarm-spotify-status" id="spotifyStatusRow">
                    <span id="spotifyStatusLabel">Not connected</span>
                    <button type="button" id="spotifyConnectBtn" class="btn-subtle">Connect Spotify</button>
                    <button type="button" id="spotifyLogoutBtn" class="btn-subtle hidden">Disconnect</button>
                </div>
            </div>

            <!-- Preview -->
            <div class="alarm-actions">
                <button type="button" id="previewAlarmBtn" aria-label="Preview alarm sound">
                    ▶ Preview
                </button>
                <button type="button" id="closeAlarmFolderBtn" class="btn-subtle">Done</button>
            </div>
```
→
```html
            <h2 id="alarmTitle" data-i18n="alarm.title">Alarm Sound</h2>

            <!-- Mevcut kaynak -->
            <div class="alarm-current">
                <span class="alarm-current-label" data-i18n="alarm.current">Current</span>
                <span class="alarm-current-file" id="alarmCurrentFile">alarm.mp3 (default)</span>
                <span class="alarm-provider-tag hidden" id="alarmProviderTag"></span>
            </div>

            <!-- Local dosya seçimi -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.localSectionLabel">Local file</p>
                <button type="button" id="chooseAlarmBtn" class="btn-primary" data-i18n="alarm.chooseFile">Choose file…</button>
            </div>

            <!-- URL ile yükleme -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.urlSectionLabel">YouTube or Spotify URL</p>
                <div class="alarm-url-row">
                    <input id="alarmUrlInput" type="url" placeholder="https://youtube.com/watch?v=… or spotify link"
                        data-i18n-placeholder="alarm.urlPlaceholder"
                        autocomplete="off" spellcheck="false" />
                    <button type="button" id="alarmUrlLoadBtn" data-i18n="alarm.urlLoad">Load</button>
                </div>
                <p class="alarm-url-hint" data-i18n="alarm.urlHint">
                    Paste a YouTube video or Spotify track URL. Spotify links
                    require connecting your account and play through the real
                    Spotify app (not an in-app preview).
                    If unavailable, local alarm will be used as fallback.
                </p>
            </div>

            <!-- Spotify account -->
            <div class="alarm-section">
                <p class="alarm-section-label" data-i18n="alarm.spotifySectionLabel">Spotify</p>
                <div class="alarm-spotify-status" id="spotifyStatusRow">
                    <span id="spotifyStatusLabel">Not connected</span>
                    <button type="button" id="spotifyConnectBtn" class="btn-subtle" data-i18n="alarm.spotifyConnect">Connect Spotify</button>
                    <button type="button" id="spotifyLogoutBtn" class="btn-subtle hidden" data-i18n="alarm.spotifyDisconnect">Disconnect</button>
                </div>
            </div>

            <!-- Preview -->
            <div class="alarm-actions">
                <button type="button" id="previewAlarmBtn" aria-label="Preview alarm sound" data-i18n-aria-label="alarm.previewAriaLabel">
                    ▶ Preview
                </button>
                <button type="button" id="closeAlarmFolderBtn" class="btn-subtle" data-i18n="alarm.done">Done</button>
            </div>
```

- [ ] **Step 2: Add `data-i18n` to `js/views/timerView.js`**

```js
export function renderTimerView() {
  return `
    <div class="timer-container">

      <div class="input-group">
        <label for="minutes">
          <span>Minutes:</span>
          <input type="number" id="minutes" min="0" value="0" />
        </label>
        <label for="seconds">
          <span>Seconds:</span>
          <input type="number" id="seconds" min="0" max="59" value="0" />
        </label>
      </div>

      <h2 id="countdown">00:00</h2>
      <p id="timerStatus">Status: Ready</p>

      <div class="button-group">
        <button id="startBtn">Start</button>
        <button id="pauseBtn">Pause</button>
        <button id="continueBtn">Continue</button>
        <button id="stopBtn">Stop</button>
        <button id="resetBtn">Reset</button>
      </div>

    </div>
  `;
}
```
→
```js
export function renderTimerView() {
  return `
    <div class="timer-container">

      <div class="input-group">
        <label for="minutes">
          <span data-i18n="timer.minutes">Minutes:</span>
          <input type="number" id="minutes" min="0" value="0" />
        </label>
        <label for="seconds">
          <span data-i18n="timer.seconds">Seconds:</span>
          <input type="number" id="seconds" min="0" max="59" value="0" />
        </label>
      </div>

      <h2 id="countdown">00:00</h2>
      <p id="timerStatus">Status: Ready</p>

      <div class="button-group">
        <button id="startBtn" data-i18n="timer.start">Start</button>
        <button id="pauseBtn" data-i18n="timer.pause">Pause</button>
        <button id="continueBtn" data-i18n="timer.continue">Continue</button>
        <button id="stopBtn" data-i18n="timer.stop">Stop</button>
        <button id="resetBtn" data-i18n="timer.reset">Reset</button>
      </div>

    </div>
  `;
}
```

Note `#timerStatus` deliberately gets **no** `data-i18n` — it's state-driven (Task 4 handles it via `t()` inside `timerStateBroadcast.js`).

- [ ] **Step 3: Add `data-i18n` to `js/views/intervalTimerView.js`**

```js
export function renderIntervalView() {
  return `
    <div class="interval-timer-container">

      <!-- Preset dropdown trigger -->
      <div class="preset-dropdown-wrapper">
        <button class="preset-trigger" id="presetTriggerBtn"
          aria-haspopup="listbox" aria-expanded="false"
          aria-label="Select preset">
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
        </button>

        <div class="preset-dropdown" id="presetDropdown"
          role="listbox" aria-label="Presets" hidden>
          <ul class="preset-dropdown__list" id="presetsContainer"></ul>
          <div class="preset-dropdown__footer">
            <button id="addPresetBtn" class="preset-dropdown__add">
              + New preset
            </button>
          </div>
        </div>
      </div>

      <div class="currentLoop">
        <label>Current Loop:</label>
        <span id="currentLoop">0</span>
      </div>

      <h1 id="intervalCountdown">00:00</h1>
      <p id="intervalStatus">Status: Ready</p>
      <p id="intervalPhase">Phase: -</p>

      <div class="button-group">
        <button id="startLoopBtn">Start</button>
        <button id="pauseLoopBtn">Pause</button>
        <button id="continueLoopBtn">Continue</button>
        <button id="resetIntervalBtn">Reset</button>
      </div>

      <!-- Inputs -->
      <div class="input-group">
        <label for="workMinutes">
          <span>Work Minutes:</span>
          <input type="number" id="workMinutes" min="0" value="25" />
        </label>
        <label for="workSeconds">
          <span>Work Seconds:</span>
          <input type="number" id="workSeconds" min="0" max="59" value="0" />
        </label>
        <label for="breakMinutes">
          <span>Break Minutes:</span>
          <input type="number" id="breakMinutes" min="0" value="5" />
        </label>
        <label for="breakSeconds">
          <span>Break Seconds:</span>
          <input type="number" id="breakSeconds" min="0" max="59" value="0" />
        </label>
        <label for="loopCount">
          <span>Number of Loops:</span>
          <input type="number" id="loopCount" min="1" value="4" />
        </label>
      </div>

    </div>
  `;
}
```
→
```js
export function renderIntervalView() {
  return `
    <div class="interval-timer-container">

      <!-- Preset dropdown trigger -->
      <div class="preset-dropdown-wrapper">
        <button class="preset-trigger" id="presetTriggerBtn"
          aria-haspopup="listbox" aria-expanded="false"
          aria-label="Select preset" data-i18n-aria-label="interval.selectPresetAriaLabel">
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
        </button>

        <div class="preset-dropdown" id="presetDropdown"
          role="listbox" aria-label="Presets" data-i18n-aria-label="interval.presetsListAriaLabel" hidden>
          <ul class="preset-dropdown__list" id="presetsContainer"></ul>
          <div class="preset-dropdown__footer">
            <button id="addPresetBtn" class="preset-dropdown__add" data-i18n="interval.addPreset">
              + New preset
            </button>
          </div>
        </div>
      </div>

      <div class="currentLoop">
        <label data-i18n="interval.currentLoop">Current Loop:</label>
        <span id="currentLoop">0</span>
      </div>

      <h1 id="intervalCountdown">00:00</h1>
      <p id="intervalStatus">Status: Ready</p>
      <p id="intervalPhase">Phase: -</p>

      <div class="button-group">
        <button id="startLoopBtn" data-i18n="interval.start">Start</button>
        <button id="pauseLoopBtn" data-i18n="interval.pause">Pause</button>
        <button id="continueLoopBtn" data-i18n="interval.continue">Continue</button>
        <button id="resetIntervalBtn" data-i18n="interval.reset">Reset</button>
      </div>

      <!-- Inputs -->
      <div class="input-group">
        <label for="workMinutes">
          <span data-i18n="interval.workMinutes">Work Minutes:</span>
          <input type="number" id="workMinutes" min="0" value="25" />
        </label>
        <label for="workSeconds">
          <span data-i18n="interval.workSeconds">Work Seconds:</span>
          <input type="number" id="workSeconds" min="0" max="59" value="0" />
        </label>
        <label for="breakMinutes">
          <span data-i18n="interval.breakMinutes">Break Minutes:</span>
          <input type="number" id="breakMinutes" min="0" value="5" />
        </label>
        <label for="breakSeconds">
          <span data-i18n="interval.breakSeconds">Break Seconds:</span>
          <input type="number" id="breakSeconds" min="0" max="59" value="0" />
        </label>
        <label for="loopCount">
          <span data-i18n="interval.loopCount">Number of Loops:</span>
          <input type="number" id="loopCount" min="1" value="4" />
        </label>
      </div>

    </div>
  `;
}
```

Note `#presetTriggerLabel`, `#intervalStatus`, and `#intervalPhase` deliberately get **no** `data-i18n` — all three are state-driven (active preset name / status / phase), handled directly via `t()` in Tasks 4 and 6.

- [ ] **Step 4: Wire `initLanguage()` and the toggle button in `js/renderer.js`**

Find the top imports:

```js
import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";
import { setupTabListeners, switchTab } from "./tabs.js";
import { enhanceNumberInputs } from "./numberStepper.js";
```

Add:

```js
import { initLanguage, setLanguage, getLanguage } from "./i18n/i18n.js";
```

Find:

```js
// Setup both controllers once — they wire up to already-existing DOM
setupIntervalTimer(alarmSettings);
setupTimer(alarmSettings);

// Replace native number-input spin buttons with themed ones
// (covers the timer/interval views above plus the static settings modal)
enhanceNumberInputs(document);
```

Add right after `enhanceNumberInputs(document);`:

```js
// ── Language ───────────────────────────────────────────────────
const languageBtn = document.getElementById("languageBtn");
initLanguage().then(() => {
  if (languageBtn) languageBtn.textContent = getLanguage().toUpperCase();
});

if (languageBtn) {
  languageBtn.addEventListener("click", async () => {
    const next = getLanguage() === "en" ? "tr" : "en";
    await setLanguage(next);
    languageBtn.textContent = next.toUpperCase();
  });
}
```

- [ ] **Step 5: Add the `.lang-btn` style to `css/styles.css`**

Find the `.quit-btn` rule block (around line 210):

```css
.quit-btn {
  margin-left: var(--sp-3);
  padding-left: var(--sp-3);
  border-left: 1px solid #333;
  border-radius: 0;
  width: auto;
  gap: var(--sp-1);
  color: var(--danger);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 600;
}
```

Add right after it:

```css
.lang-btn {
  width: auto;
  padding: var(--sp-2) var(--sp-3);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 6: Verify manually**

```bash
npm start
```

Confirm: the app launches in English, `#languageBtn` reads "EN" and sits right before the Quit button. Click it — confirm the tab labels, both modal titles/fields/buttons, and the preset "+ New preset" button switch to Turkish, and the button now reads "TR". Click again to confirm it switches back to English. Open DevTools and confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html js/views/timerView.js js/views/intervalTimerView.js js/renderer.js css/styles.css
git commit -m "feat(i18n): wire static UI text and language toggle button into main window"
```

---

### Task 4: Status/phase correctness fix + translation (Timer + Interval Timer tabs)

**Files:**
- Modify: `js/timerStateBroadcast.js`
- Modify: `js/timer.js`
- Modify: `js/intervalTimer.js`
- Modify: `js/renderer.js` (quit-confirmation fix)

**Interfaces:**
- Consumes: `t`, `format`, `onLanguageChange` from `js/i18n/i18n.js` (Task 1).
- Produces: `js/timer.js` exports `getTimerStatus(): string` (in addition to its existing `setupTimer`). `js/intervalTimer.js` exports `getIntervalStatus(): string` (in addition to its existing `setupIntervalTimer`). The interval broadcast payload's `phase` field is now always the raw enum (`"work"`/`"break"`/`""`), never parsed from translated DOM text — Task 5 (`mini.js`) depends on this.

- [ ] **Step 1: Translate status labels in `js/timerStateBroadcast.js`**

```js
// ── Status label text ──────────────────────────────────────────
const STATUS_LABELS = {
  ready: "Status: Ready",
  running: "Status: Running",
  paused: "Status: Paused",
  stopped: "Status: Stopped",
  completed: "Status: Completed",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? `Status: ${status}`;
}
```
→
```js
// ── Status label text ──────────────────────────────────────────
import { t } from "./i18n/i18n.js";

const STATUS_KEYS = {
  ready: "status.ready",
  running: "status.running",
  paused: "status.paused",
  stopped: "status.stopped",
  completed: "status.completed",
};

export function statusLabel(status) {
  return STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : `Status: ${status}`;
}
```

Add the import at the very top of the file (it currently has no imports), i.e. the `import { t } from "./i18n/i18n.js";` line above should be the first line of the file, not inline where shown — place it alongside the file's existing header comment, before `export function formatDuration`.

- [ ] **Step 2: Make `js/timerStateBroadcast.js`'s broadcaster re-emit on language change**

Find:

```js
export function createTimerStateBroadcaster({ statusElementId, getBaseState }) {
  let status = "ready";

  function broadcast(overrides = {}) {
    broadcastTimerState({ ...getBaseState(status), ...overrides });
  }

  function setStatus(newStatus) {
    status = newStatus;
    const el = document.getElementById(statusElementId);
    if (el) el.textContent = statusLabel(status);
    broadcast();
  }

  function getStatus() {
    return status;
  }

  return { broadcast, setStatus, getStatus };
}
```
→
```js
export function createTimerStateBroadcaster({ statusElementId, getBaseState }) {
  let status = "ready";

  function broadcast(overrides = {}) {
    broadcastTimerState({ ...getBaseState(status), ...overrides });
  }

  function refreshStatusLabel() {
    const el = document.getElementById(statusElementId);
    if (el) el.textContent = statusLabel(status);
  }

  function setStatus(newStatus) {
    status = newStatus;
    refreshStatusLabel();
    broadcast();
  }

  function getStatus() {
    return status;
  }

  onLanguageChange(() => {
    refreshStatusLabel();
    broadcast();
  });

  return { broadcast, setStatus, getStatus };
}
```

Add `onLanguageChange` to the existing import line you just added in Step 1, i.e. it becomes:

```js
import { t, onLanguageChange } from "./i18n/i18n.js";
```

- [ ] **Step 3: Export `getTimerStatus` from `js/timer.js`**

Find (the `stateBroadcaster` is already module-scoped in this file, near the top):

```js
// ── State yayını ──────────────────────────────────────────────
const stateBroadcaster = createTimerStateBroadcaster({
```

No change needed to this declaration. Instead, add a new export anywhere after it, e.g. right before `export function setupTimer(settings) {`:

```js
export function getTimerStatus() {
  return stateBroadcaster.getStatus();
}

```

- [ ] **Step 4: Lift `stateBroadcaster` to module scope in `js/intervalTimer.js` and export `getIntervalStatus`**

Find the top of the file:

```js
import { IntervalTimer } from "./logic/IntervalTimer.js";
import { setupPresets } from "./presets.js";
import { alarmManager } from "./alarm/AlarmManager.js";

import {
  createTimerStateBroadcaster,
  formatDuration,
} from "./timerStateBroadcast.js";
import { toFileUrl } from "./alarmModal.js";

// `alarmSettings` is passed in by renderer.js rather than imported from it —
// importing it back from renderer.js would recreate the renderer.js <->
// intervalTimer.js cycle that this module's other imports were fixed to avoid.
export function setupIntervalTimer(alarmSettings) {
```
→
```js
import { IntervalTimer } from "./logic/IntervalTimer.js";
import { setupPresets } from "./presets.js";
import { alarmManager } from "./alarm/AlarmManager.js";

import {
  createTimerStateBroadcaster,
  formatDuration,
} from "./timerStateBroadcast.js";
import { toFileUrl } from "./alarmModal.js";
import { t } from "./i18n/i18n.js";

let stateBroadcaster = null;

export function getIntervalStatus() {
  return stateBroadcaster?.getStatus() ?? "ready";
}

// `alarmSettings` is passed in by renderer.js rather than imported from it —
// importing it back from renderer.js would recreate the renderer.js <->
// intervalTimer.js cycle that this module's other imports were fixed to avoid.
export function setupIntervalTimer(alarmSettings) {
```

Find inside `setupIntervalTimer`:

```js
  let intervalTimer = null;
  let currentLoop = 0;
  let totalLoops = 0;
  let pausedTime = 0;
  let isCompleted = false;

  let isAlarmPlaying = false;
  let alarmPaused = false;

  // ── State yayını — her değişimde çağrılır ─────────────────
  const stateBroadcaster = createTimerStateBroadcaster({
    statusElementId: "intervalStatus",
    getBaseState: status => ({
      time:
        document.getElementById("intervalCountdown")?.textContent ?? "00:00",
      phase:
        document
          .getElementById("intervalPhase")
          ?.textContent?.replace("Phase: ", "") ?? "",
      status,
      tab: "interval",
      loop: currentLoop,
      total: totalLoops,
    }),
  });

  function updateDisplay(remaining, phase) {
    const cd = document.getElementById("intervalCountdown");
    const ph = document.getElementById("intervalPhase");
    if (cd) cd.textContent = formatDuration(remaining);
    if (ph) ph.textContent = `Phase: ${phase}`;
  }
```
→
```js
  let intervalTimer = null;
  let currentLoop = 0;
  let totalLoops = 0;
  let pausedTime = 0;
  let isCompleted = false;
  let currentPhase = "";

  let isAlarmPlaying = false;
  let alarmPaused = false;

  function phaseDisplay(phase) {
    return phase ? `${t("phase.label")}: ${t(`phase.${phase}`)}` : t("phase.empty");
  }

  function renderPhaseLabel() {
    const ph = document.getElementById("intervalPhase");
    if (ph) ph.textContent = phaseDisplay(currentPhase);
  }

  // ── State yayını — her değişimde çağrılır ─────────────────
  stateBroadcaster = createTimerStateBroadcaster({
    statusElementId: "intervalStatus",
    getBaseState: status => ({
      time:
        document.getElementById("intervalCountdown")?.textContent ?? "00:00",
      phase: currentPhase,
      status,
      tab: "interval",
      loop: currentLoop,
      total: totalLoops,
    }),
  });

  function updateDisplay(remaining, phase) {
    currentPhase = phase;
    const cd = document.getElementById("intervalCountdown");
    if (cd) cd.textContent = formatDuration(remaining);
    renderPhaseLabel();
  }
```

Find the `handleCompletion` function:

```js
  // ── Completion ────────────────────────────────────────────
  function handleCompletion() {
    if (isCompleted) return;
    isCompleted = true;
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    playAlarm(alarmSettings.breakAlarmLength); // ← initAlarmManager yerine playAlarm

    const cd = document.getElementById("intervalCountdown");
    if (cd) {
      cd.classList.remove("countdown-pulse", "countdown-complete");
      void cd.offsetWidth;
      cd.classList.add("countdown-complete");
      cd.textContent = "00:00";
    }
    const ph = document.getElementById("intervalPhase");
    if (ph) ph.textContent = "Phase: -";

    stateBroadcaster.setStatus("completed"); // broadcast içinde çağrılıyor
  }
```
→
```js
  // ── Completion ────────────────────────────────────────────
  function handleCompletion() {
    if (isCompleted) return;
    isCompleted = true;
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    playAlarm(alarmSettings.breakAlarmLength); // ← initAlarmManager yerine playAlarm

    const cd = document.getElementById("intervalCountdown");
    if (cd) {
      cd.classList.remove("countdown-pulse", "countdown-complete");
      void cd.offsetWidth;
      cd.classList.add("countdown-complete");
      cd.textContent = "00:00";
    }
    currentPhase = "";
    renderPhaseLabel();

    stateBroadcaster.setStatus("completed"); // broadcast içinde çağrılıyor
  }
```

Find the `resetBtn.onclick` handler:

```js
  // ── Reset ─────────────────────────────────────────────────
  resetBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    stopAlarmSound();
    isCompleted = false;
    currentLoop = 0;
    pausedTime = 0;
    totalLoops = 0;

    const loopEl = document.getElementById("currentLoop");
    const cd = document.getElementById("intervalCountdown");
    const ph = document.getElementById("intervalPhase");
    if (loopEl) loopEl.textContent = 0;
    if (cd) {
      cd.textContent = "00:00";
      cd.classList.remove("countdown-pulse", "countdown-complete");
    }
    if (ph) ph.textContent = "Phase: -";

    stateBroadcaster.setStatus("ready"); // broadcast tetiklenir — mini UI güncellenir
  };
```
→
```js
  // ── Reset ─────────────────────────────────────────────────
  resetBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    stopAlarmSound();
    isCompleted = false;
    currentLoop = 0;
    pausedTime = 0;
    totalLoops = 0;
    currentPhase = "";

    const loopEl = document.getElementById("currentLoop");
    const cd = document.getElementById("intervalCountdown");
    if (loopEl) loopEl.textContent = 0;
    if (cd) {
      cd.textContent = "00:00";
      cd.classList.remove("countdown-pulse", "countdown-complete");
    }
    renderPhaseLabel();

    stateBroadcaster.setStatus("ready"); // broadcast tetiklenir — mini UI güncellenir
  };
```

Finally, add a language-change subscription so the phase label re-renders in the new language immediately. Add this near the end of `setupIntervalTimer`, right after the `resetBtn.onclick = ...` block closes (before the function's closing `}`):

```js
  onLanguageChange(() => renderPhaseLabel());
```

This needs `onLanguageChange` imported — update the import line from Step (top of file) to:

```js
import { t, onLanguageChange } from "./i18n/i18n.js";
```

- [ ] **Step 5: Fix the quit-confirmation text-parsing bug in `js/renderer.js`**

Find:

```js
// ── Quit ───────────────────────────────────────────────────────
document.getElementById("quitAppBtn").onclick = () => {
  const intervalStatus =
    document.getElementById("intervalStatus")?.textContent ?? "";
  const timerStatus =
    document.getElementById("timerStatus")?.textContent ?? "";
  const isTimerActive = [intervalStatus, timerStatus].some(
    text => text.includes("Running") || text.includes("Paused"),
  );

  if (isTimerActive) {
    const confirmed = window.confirm(
      "A timer is currently running. Quit anyway?",
    );
    if (!confirmed) return;
  }

  window.electronAPI.quitApp();
};
```
→
```js
// ── Quit ───────────────────────────────────────────────────────
document.getElementById("quitAppBtn").onclick = () => {
  const activeStatuses = ["running", "paused"];
  const isTimerActive =
    activeStatuses.includes(getTimerStatus()) ||
    activeStatuses.includes(getIntervalStatus());

  if (isTimerActive) {
    const confirmed = window.confirm(t("confirm.quitRunning"));
    if (!confirmed) return;
  }

  window.electronAPI.quitApp();
};
```

Add the two new imports to `js/renderer.js`'s top (alongside the `initLanguage`/`setLanguage`/`getLanguage` import added in Task 3):

```js
import { initLanguage, setLanguage, getLanguage, t } from "./i18n/i18n.js";
import { setupTimer, getTimerStatus } from "./timer.js";
import { setupIntervalTimer, getIntervalStatus } from "./intervalTimer.js";
```

(These replace the existing plain `import { setupTimer } from "./timer.js";` and `import { setupIntervalTimer } from "./intervalTimer.js";` lines — add the new named exports to the same import statements rather than duplicating them.)

- [ ] **Step 6: Verify manually**

```bash
npm start
```

- Switch to Turkish. Start the Timer tab's countdown — confirm `#timerStatus` shows "Durum: Çalışıyor". Pause it — confirm "Durum: Duraklatıldı".
- Switch to the Interval tab, start a loop — confirm `#intervalStatus` and `#intervalPhase` both show Turkish text (e.g. "Durum: Çalışıyor" / "Evre: Çalışma"), and toggling the language button mid-run updates both immediately without resetting the countdown.
- With the interval timer running or paused, click Quit — confirm the confirmation dialog appears in Turkish and Cancel keeps the app open.
- Reset the interval timer to idle, click Quit — confirm **no** confirmation dialog appears (regression check: idle state must not falsely trigger it).

- [ ] **Step 7: Commit**

```bash
git add js/timerStateBroadcast.js js/timer.js js/intervalTimer.js js/renderer.js
git commit -m "fix(i18n): track status/phase as real values instead of parsing translated DOM text"
```

---

### Task 5: Mini window translation + language sync

**Files:**
- Modify: `mini.html`
- Modify: `js/mini.js`

**Interfaces:**
- Consumes: `t`, `format`, `initLanguage`, `onLanguageChange` from `js/i18n/i18n.js`; the interval broadcast's raw `state.phase` enum from Task 4.

- [ ] **Step 1: Make `mini.html`'s script a module and add static `data-i18n*` attributes**

```html
<body>
    <div class="mini-container">

        <div class="mini-header">
            <span class="mini-label" id="miniLabel">TIMER</span>
            <button type="button" class="mini-close" id="miniCloseBtn" aria-label="Close mini view">✕</button>
        </div>

        <div class="mini-countdown" id="miniCountdown">00:00</div>
        <div class="mini-phase" id="miniPhase">READY</div>
        <div class="mini-loop" id="miniLoop"></div>

        <div class="mini-controls">
            <button type="button" class="mini-btn" id="miniPauseBtn" data-action="pause" aria-label="Pause timer"
                title="Pause">⏸</button>
            <button type="button" class="mini-btn" id="miniContinueBtn" data-action="continue" aria-label="Continue timer"
                title="Continue">▶</button>
            <button type="button" class="mini-btn" id="miniResetBtn" data-action="reset" aria-label="Reset timer"
                title="Reset">↺</button>
        </div>

    </div>
    <script src="js/mini.js"></script>
</body>
```
→
```html
<body>
    <div class="mini-container">

        <div class="mini-header">
            <span class="mini-label" id="miniLabel">TIMER</span>
            <button type="button" class="mini-close" id="miniCloseBtn" aria-label="Close mini view"
                data-i18n-aria-label="mini.closeAriaLabel">✕</button>
        </div>

        <div class="mini-countdown" id="miniCountdown">00:00</div>
        <div class="mini-phase" id="miniPhase">READY</div>
        <div class="mini-loop" id="miniLoop"></div>

        <div class="mini-controls">
            <button type="button" class="mini-btn" id="miniPauseBtn" data-action="pause" aria-label="Pause timer"
                data-i18n-aria-label="mini.pauseAriaLabel" data-i18n-title="mini.pauseTitle" title="Pause">⏸</button>
            <button type="button" class="mini-btn" id="miniContinueBtn" data-action="continue" aria-label="Continue timer"
                title="Continue">▶</button>
            <button type="button" class="mini-btn" id="miniResetBtn" data-action="reset" aria-label="Reset timer"
                data-i18n-aria-label="mini.resetAriaLabel" data-i18n-title="mini.resetTitle" title="Reset">↺</button>
        </div>

    </div>
    <script type="module" src="js/mini.js"></script>
</body>
```

`miniLabel`, `miniCountdown`, `miniPhase`, `miniLoop`, and `miniContinueBtn`'s `title`/`aria-label` deliberately get **no** `data-i18n*` — all are state-driven, rewritten directly in `js/mini.js` on every `timer-state` event (Step 2 below).

- [ ] **Step 2: Translate the state-driven text in `js/mini.js`**

```js
const countdown = document.getElementById("miniCountdown");
const phase = document.getElementById("miniPhase");
const loopEl = document.getElementById("miniLoop");
const label = document.getElementById("miniLabel");
const pauseBtn = document.getElementById("miniPauseBtn");
const continueBtn = document.getElementById("miniContinueBtn");
const resetBtn = document.getElementById("miniResetBtn");
const closeBtn = document.getElementById("miniCloseBtn");

let lastStatus = "ready";

// ── Timer state sync ──────────────────────────────────────────
window.electronAPI.onTimerState(state => {
  lastStatus = state.status;

  if (countdown) countdown.textContent = state.time ?? "00:00";

  // Phase / status metni
  if (phase) {
    if (state.status === "completed") {
      phase.textContent = "COMPLETED";
      phase.style.color = "var(--accent)";
    } else if (state.status === "paused") {
      phase.textContent = "PAUSED";
      phase.style.color = "var(--ink-muted)";
    } else if (state.status === "ready" || state.status === "stopped") {
      phase.textContent = "READY";
      phase.style.color = "var(--ink-muted)";
    } else if (state.phase) {
      phase.textContent = state.phase.toUpperCase();
      phase.style.color = "var(--accent)";
    } else {
      phase.textContent = "";
    }
  }

  // Tab label
  if (label) {
    label.textContent = state.tab === "interval" ? "INTERVAL" : "TIMER";
  }

  // Loop bilgisi
  if (loopEl) {
    if (state.tab === "interval" && state.total > 0) {
      loopEl.textContent = `LOOP ${state.loop ?? 0} / ${state.total}`;
    } else {
      loopEl.textContent = "";
    }
  }

  const isRunning = state.status === "running";
  const isPaused = state.status === "paused";
  const isCompleted = state.status === "completed";
  const isIdle = state.status === "ready" || state.status === "stopped";

  // Pause: sadece running'de aktif
  if (pauseBtn) pauseBtn.disabled = !isRunning;

  // Continue: paused'da "continue", idle/completed'da "start" görevi
  if (continueBtn) {
    continueBtn.disabled = false; // her zaman tıklanabilir
    if (isPaused) {
      continueBtn.title = "Continue";
      continueBtn.dataset.action = "continue";
    } else if (isIdle || isCompleted) {
      continueBtn.title = "Start";
      continueBtn.dataset.action = "start";
    } else {
      // running — start zaten çalışıyor, butonu pasif yap
      continueBtn.disabled = true;
    }
  }

  // Reset: sadece bir şey başlamışsa aktif
  if (resetBtn) {
    resetBtn.disabled = isIdle && !isCompleted;
  }

  // Completion görsel
  if (countdown) {
    countdown.classList.toggle("complete", isCompleted);
  }
});

// ── Buton aksiyonları ─────────────────────────────────────────
[pauseBtn, continueBtn, resetBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener("click", () => {
    window.electronAPI.sendMiniAction(btn.dataset.action);
  });
});

// ── Kapat ─────────────────────────────────────────────────────
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.electronAPI.setAlwaysOnTop(false);
  });
}
```
→
```js
import { initLanguage, t, format, onLanguageChange } from "./i18n/i18n.js";

const countdown = document.getElementById("miniCountdown");
const phase = document.getElementById("miniPhase");
const loopEl = document.getElementById("miniLoop");
const label = document.getElementById("miniLabel");
const pauseBtn = document.getElementById("miniPauseBtn");
const continueBtn = document.getElementById("miniContinueBtn");
const resetBtn = document.getElementById("miniResetBtn");
const closeBtn = document.getElementById("miniCloseBtn");

let lastState = { status: "ready", tab: "timer", time: "00:00" };

function render(state) {
  lastState = state;

  if (countdown) countdown.textContent = state.time ?? "00:00";

  // Phase / status metni
  if (phase) {
    if (state.status === "completed") {
      phase.textContent = t("mini.completed");
      phase.style.color = "var(--accent)";
    } else if (state.status === "paused") {
      phase.textContent = t("mini.paused");
      phase.style.color = "var(--ink-muted)";
    } else if (state.status === "ready" || state.status === "stopped") {
      phase.textContent = t("mini.ready");
      phase.style.color = "var(--ink-muted)";
    } else if (state.phase) {
      phase.textContent = t(`phase.${state.phase}`).toUpperCase();
      phase.style.color = "var(--accent)";
    } else {
      phase.textContent = "";
    }
  }

  // Tab label
  if (label) {
    label.textContent = state.tab === "interval" ? t("mini.interval") : t("mini.timer");
  }

  // Loop bilgisi
  if (loopEl) {
    if (state.tab === "interval" && state.total > 0) {
      loopEl.textContent = format(t("mini.loop"), {
        current: state.loop ?? 0,
        total: state.total,
      });
    } else {
      loopEl.textContent = "";
    }
  }

  const isRunning = state.status === "running";
  const isPaused = state.status === "paused";
  const isCompleted = state.status === "completed";
  const isIdle = state.status === "ready" || state.status === "stopped";

  // Pause: sadece running'de aktif
  if (pauseBtn) pauseBtn.disabled = !isRunning;

  // Continue: paused'da "continue", idle/completed'da "start" görevi
  if (continueBtn) {
    continueBtn.disabled = false; // her zaman tıklanabilir
    if (isPaused) {
      continueBtn.title = t("mini.continueTitle");
      continueBtn.setAttribute("aria-label", t("mini.continueAriaLabel"));
      continueBtn.dataset.action = "continue";
    } else if (isIdle || isCompleted) {
      continueBtn.title = t("mini.startTitle");
      continueBtn.setAttribute("aria-label", t("mini.startTitle"));
      continueBtn.dataset.action = "start";
    } else {
      // running — start zaten çalışıyor, butonu pasif yap
      continueBtn.disabled = true;
    }
  }

  // Reset: sadece bir şey başlamışsa aktif
  if (resetBtn) {
    resetBtn.disabled = isIdle && !isCompleted;
  }

  // Completion görsel
  if (countdown) {
    countdown.classList.toggle("complete", isCompleted);
  }
}

// ── Timer state sync ──────────────────────────────────────────
window.electronAPI.onTimerState(render);

// ── Buton aksiyonları ─────────────────────────────────────────
[pauseBtn, continueBtn, resetBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener("click", () => {
    window.electronAPI.sendMiniAction(btn.dataset.action);
  });
});

// ── Kapat ─────────────────────────────────────────────────────
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.electronAPI.setAlwaysOnTop(false);
  });
}

// ── Language ───────────────────────────────────────────────────
initLanguage();
onLanguageChange(() => render(lastState));
```

- [ ] **Step 3: Verify manually**

```bash
npm start
```

Toggle to Turkish in the main window, start an interval loop, then click the pin/always-on-top button to open the mini window — confirm it opens already in Turkish (label "ARALIK", phase "ÇALIŞMA", loop "DÖNGÜ 1 / 4"). While the mini window is open, click the main window's language button back to English — confirm the mini window updates live without needing to be reopened. Confirm the pause/continue/reset buttons' hover tooltips (native `title`) show translated text.

- [ ] **Step 4: Commit**

```bash
git add mini.html js/mini.js
git commit -m "feat(i18n): translate mini window and sync language changes live"
```

---

### Task 6: Presets dropdown/form translation

**Files:**
- Modify: `js/presets.js`

**Interfaces:**
- Consumes: `t`, `format`, `onLanguageChange` from `js/i18n/i18n.js`.

- [ ] **Step 1: Import i18n helpers**

Find:

```js
import { enhanceNumberInputs } from "./numberStepper.js";
```

Add:

```js
import { t, format, onLanguageChange } from "./i18n/i18n.js";
```

- [ ] **Step 2: Translate `renderPresets`' dynamic labels**

Find:

```js
    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? "Presets";
    }

    // Empty state
    if (!presets || presets.length === 0) {
      const li = document.createElement("li");
      li.className = "preset-empty";
      li.textContent = "No presets yet.";
      container.appendChild(li);
      addBtn.disabled = false;
      return;
    }
```
→
```js
    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? t("interval.presetsDefault");
    }

    // Empty state
    if (!presets || presets.length === 0) {
      const li = document.createElement("li");
      li.className = "preset-empty";
      li.textContent = t("presets.emptyState");
      container.appendChild(li);
      addBtn.disabled = false;
      return;
    }
```

Find:

```js
    // Max limitte + New disabled
    addBtn.disabled = presets.length >= MAX_PRESETS;
    addBtn.title =
      presets.length >= MAX_PRESETS
        ? `Maximum ${MAX_PRESETS} presets reached`
        : "";
```
→
```js
    // Max limitte + New disabled
    addBtn.disabled = presets.length >= MAX_PRESETS;
    addBtn.title =
      presets.length >= MAX_PRESETS
        ? format(t("presets.maxReachedTitle"), { max: MAX_PRESETS })
        : "";
```

- [ ] **Step 3: Translate `buildPresetItem`'s generated markup**

Find:

```js
  li.innerHTML = `
    <button class="preset-item__load" aria-label="Load ${escapeHtml(preset.name)}">
      <span class="preset-item__name">${escapeHtml(preset.name)}</span>
      <span class="preset-item__meta">
        ⏱ ${workLabel}
        <span aria-hidden="true">·</span>
        ☕ ${breakLabel}
        <span aria-hidden="true">·</span>
        ↻ ${loopLabel}
      </span>
    </button>
    <div class="preset-item__actions">
      <button class="preset-item__btn preset-item__btn--edit"
        aria-label="Edit ${escapeHtml(preset.name)}"
        title="Edit"
        ${isDefault ? "disabled" : ""}>✎</button>
      <button class="preset-item__btn preset-item__btn--delete"
        aria-label="Delete ${escapeHtml(preset.name)}"
        title="${isDefault ? "Cannot delete default" : "Delete"}"
        ${isDefault ? "disabled" : ""}>✕</button>
    </div>
    <div class="preset-item__confirm hidden">
      <span>Delete?</span>
      <button class="preset-item__btn preset-item__btn--yes">Yes</button>
      <button class="preset-item__btn preset-item__btn--no">No</button>
    </div>
  `;
```
→
```js
  li.innerHTML = `
    <button class="preset-item__load" aria-label="${format(t("presets.loadAriaLabel"), { name: escapeHtml(preset.name) })}">
      <span class="preset-item__name">${escapeHtml(preset.name)}</span>
      <span class="preset-item__meta">
        ⏱ ${workLabel}
        <span aria-hidden="true">·</span>
        ☕ ${breakLabel}
        <span aria-hidden="true">·</span>
        ↻ ${loopLabel}
      </span>
    </button>
    <div class="preset-item__actions">
      <button class="preset-item__btn preset-item__btn--edit"
        aria-label="${format(t("presets.editAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${t("presets.editTitle")}"
        ${isDefault ? "disabled" : ""}>✎</button>
      <button class="preset-item__btn preset-item__btn--delete"
        aria-label="${format(t("presets.deleteAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${isDefault ? t("presets.cannotDeleteDefaultTitle") : t("presets.deleteTitle")}"
        ${isDefault ? "disabled" : ""}>✕</button>
    </div>
    <div class="preset-item__confirm hidden">
      <span>${t("presets.deleteConfirm")}</span>
      <button class="preset-item__btn preset-item__btn--yes">${t("presets.confirmYes")}</button>
      <button class="preset-item__btn preset-item__btn--no">${t("presets.confirmNo")}</button>
    </div>
  `;
```

- [ ] **Step 4: Translate `showPresetForm`'s generated markup**

Find:

```js
  overlay.innerHTML = `
    <div class="preset-form" role="dialog" aria-modal="true"
      aria-labelledby="pfTitle">
      <h3 class="preset-form__title" id="pfTitle">
        ${isEdit ? "Edit Preset" : "New Preset"}
      </h3>

      <div class="preset-form__field">
        <label for="pf-name">Name</label>
        <input id="pf-name" type="text" maxlength="32"
          value="${escapeHtml(p.name)}"
          placeholder="e.g. Morning Focus"
          autocomplete="off" />
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-wm">Work min</label>
          <input id="pf-wm" type="number" min="0" max="99"
            value="${p.workMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-ws">Work sec</label>
          <input id="pf-ws" type="number" min="0" max="59"
            value="${p.workSeconds}" />
        </div>
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-bm">Break min</label>
          <input id="pf-bm" type="number" min="0" max="99"
            value="${p.breakMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-bs">Break sec</label>
          <input id="pf-bs" type="number" min="0" max="59"
            value="${p.breakSeconds}" />
        </div>
      </div>

      <div class="preset-form__field">
        <label for="pf-loops">Loops</label>
        <input id="pf-loops" type="number" min="1" max="99"
          value="${p.loops}" />
      </div>

      <p class="preset-form__error hidden" id="pfError"
        role="alert" aria-live="assertive"></p>

      <div class="preset-form__btns">
        <button id="pfSaveBtn" class="btn-primary">
          ${isEdit ? "Save changes" : "Create preset"}
        </button>
        <button id="pfCancelBtn">Cancel</button>
      </div>
    </div>
  `;
```
→
```js
  overlay.innerHTML = `
    <div class="preset-form" role="dialog" aria-modal="true"
      aria-labelledby="pfTitle">
      <h3 class="preset-form__title" id="pfTitle">
        ${isEdit ? t("presets.editFormTitle") : t("presets.newFormTitle")}
      </h3>

      <div class="preset-form__field">
        <label for="pf-name">${t("presets.nameLabel")}</label>
        <input id="pf-name" type="text" maxlength="32"
          value="${escapeHtml(p.name)}"
          placeholder="${t("presets.namePlaceholder")}"
          autocomplete="off" />
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-wm">${t("presets.workMinLabel")}</label>
          <input id="pf-wm" type="number" min="0" max="99"
            value="${p.workMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-ws">${t("presets.workSecLabel")}</label>
          <input id="pf-ws" type="number" min="0" max="59"
            value="${p.workSeconds}" />
        </div>
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-bm">${t("presets.breakMinLabel")}</label>
          <input id="pf-bm" type="number" min="0" max="99"
            value="${p.breakMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-bs">${t("presets.breakSecLabel")}</label>
          <input id="pf-bs" type="number" min="0" max="59"
            value="${p.breakSeconds}" />
        </div>
      </div>

      <div class="preset-form__field">
        <label for="pf-loops">${t("presets.loopsLabel")}</label>
        <input id="pf-loops" type="number" min="1" max="99"
          value="${p.loops}" />
      </div>

      <p class="preset-form__error hidden" id="pfError"
        role="alert" aria-live="assertive"></p>

      <div class="preset-form__btns">
        <button id="pfSaveBtn" class="btn-primary">
          ${isEdit ? t("presets.saveChanges") : t("presets.createPreset")}
        </button>
        <button id="pfCancelBtn">${t("presets.cancel")}</button>
      </div>
    </div>
  `;
```

Find the validation error strings inside `validate()`:

```js
    if (!name) {
      showError("Please enter a name.");
      nameInput.focus();
      return;
    }
    if (workMinutes === 0 && workSeconds === 0) {
      showError("Work duration must be greater than 0.");
      return;
    }

    const allPresets = await window.electronAPI.presetsGetAll();
    const duplicate = allPresets.find(
      pr => pr.name.toLowerCase() === name.toLowerCase() && pr.id !== p.id,
    );
    if (duplicate) {
      showError(`A preset named "${name}" already exists.`);
      nameInput.focus();
      return;
    }
```
→
```js
    if (!name) {
      showError(t("presets.errorNameRequired"));
      nameInput.focus();
      return;
    }
    if (workMinutes === 0 && workSeconds === 0) {
      showError(t("presets.errorWorkDuration"));
      return;
    }

    const allPresets = await window.electronAPI.presetsGetAll();
    const duplicate = allPresets.find(
      pr => pr.name.toLowerCase() === name.toLowerCase() && pr.id !== p.id,
    );
    if (duplicate) {
      showError(format(t("presets.errorDuplicateName"), { name }));
      nameInput.focus();
      return;
    }
```

- [ ] **Step 5: Re-render on language change, and close any open form so it can't show stale-language text**

Find the end of `setupPresets`:

```js
  await renderPresets();
}
```
→
```js
  await renderPresets();

  onLanguageChange(() => {
    document.getElementById("presetFormOverlay")?.remove();
    renderPresets();
  });
}
```

- [ ] **Step 6: Verify manually**

```bash
npm start
```

Switch to Turkish. Open the preset dropdown — confirm the trigger label (if no preset explicitly loaded, "Hazır Ayarlar"), "+ Yeni hazır ayar", and each preset's edit/delete tooltips are Turkish. Click "+ Yeni hazır ayar" — confirm all field labels/buttons are Turkish; try saving with an empty name and confirm the Turkish validation error shows. Delete a non-default preset — confirm the inline "Silinsin mi?" / "Evet" / "Hayır" confirm shows.

- [ ] **Step 7: Commit**

```bash
git add js/presets.js
git commit -m "feat(i18n): translate preset dropdown, edit form, and validation messages"
```

---

### Task 7: Alarm modal translation

**Files:**
- Modify: `js/alarmModal.js`

**Interfaces:**
- Consumes: `t`, `format`, `onLanguageChange` from `js/i18n/i18n.js`.

- [ ] **Step 1: Import i18n helpers**

Find:

```js
import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import { createLogger } from "../lib/logger.js";
```

Add:

```js
import { t, format, onLanguageChange } from "./i18n/i18n.js";
```

- [ ] **Step 2: Translate the helper functions**

Find:

```js
  function updateCurrentFile(label) {
    if (!alarmCurrentFile) return;
    alarmCurrentFile.textContent = label || "Default alarm";
  }

  function updateProviderTag(type) {
    if (urlProviderTag) {
      const labels = { youtube: "YouTube", spotify: "Spotify" };
      const label = labels[type];
      if (label) {
        urlProviderTag.textContent = label;
        urlProviderTag.classList.remove("hidden");
      } else {
        urlProviderTag.classList.add("hidden");
      }
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? "Preview isn't available for Spotify — playing opens the Spotify app directly."
        : "";
    }
  }

  function resetPreviewBtn() {
    isPreviewing = false;
    if (previewAlarmBtn) {
      previewAlarmBtn.textContent = "▶ Preview";
      previewAlarmBtn.setAttribute("aria-label", "Preview alarm sound");
    }
  }

  function setUrlLoadBtnState(loading) {
    if (!urlLoadBtn) return;
    urlLoadBtn.disabled = loading;
    urlLoadBtn.textContent = loading ? "Loading…" : "Load";
  }
```
→
```js
  function updateCurrentFile(label) {
    if (!alarmCurrentFile) return;
    alarmCurrentFile.textContent = label || t("alarm.defaultLabel");
  }

  function updateProviderTag(type) {
    if (urlProviderTag) {
      // Provider brand names — not translated (see design spec).
      const labels = { youtube: "YouTube", spotify: "Spotify" };
      const label = labels[type];
      if (label) {
        urlProviderTag.textContent = label;
        urlProviderTag.classList.remove("hidden");
      } else {
        urlProviderTag.classList.add("hidden");
      }
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? t("alarm.previewDisabledTitle")
        : "";
    }
  }

  function resetPreviewBtn() {
    isPreviewing = false;
    if (previewAlarmBtn) {
      previewAlarmBtn.textContent = t("alarm.preview");
      previewAlarmBtn.setAttribute("aria-label", t("alarm.previewAriaLabel"));
    }
  }

  function setUrlLoadBtnState(loading) {
    if (!urlLoadBtn) return;
    urlLoadBtn.disabled = loading;
    urlLoadBtn.textContent = loading ? t("alarm.urlLoading") : t("alarm.urlLoad");
  }
```

- [ ] **Step 3: Translate the feedback-message call sites**

Find each `showFeedback(...)` call and replace its literal string with the matching key (provider labels stay as the raw brand strings, only the surrounding sentence is translated):

```js
      if (!filePath) {
        showFeedback("No file selected.", "error");
        return;
      }
```
→
```js
      if (!filePath) {
        showFeedback(t("alarm.feedback.noFileSelected"), "error");
        return;
      }
```

```js
      showFeedback(`"${getFileName(filePath)}" loaded as alarm.`, "success");
```
→
```js
      showFeedback(
        format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
        "success",
      );
```

```js
      log.error("File pick error:", err);
      showFeedback("Could not load audio file.", "error");
```
→
```js
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
```

```js
    if (!rawUrl) {
      showFeedback("Please enter a YouTube or Spotify URL.", "error");
      urlInput.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback("Please enter a valid YouTube or Spotify URL.", "error");
      return;
    }
```
→
```js
    if (!rawUrl) {
      showFeedback(t("alarm.feedback.enterUrl"), "error");
      urlInput.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback(t("alarm.feedback.invalidUrl"), "error");
      return;
    }
```

```js
      if (result.usedFallback) {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          `${providerLabel} unavailable. Using local alarm as fallback.`,
          "error",
        );
        updateProviderTag("local");
        updateCurrentFile("alarm.mp3 (fallback)");
      } else {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(`${providerLabel} alarm loaded.`, "success");
        updateProviderTag(detectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      urlInput.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        `Failed to load: ${err.message ?? "Unknown error"}`,
        "error",
      );
```
→
```js
      if (result.usedFallback) {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          format(t("alarm.feedback.providerFallback"), { provider: providerLabel }),
          "error",
        );
        updateProviderTag("local");
        updateCurrentFile(t("alarm.fallbackFile"));
      } else {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), { provider: providerLabel }),
          "success",
        );
        updateProviderTag(detectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      urlInput.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        format(t("alarm.feedback.loadFailed"), { message: err.message ?? "Unknown error" }),
        "error",
      );
```

```js
      if (!alarmManager.isReady()) {
        showFeedback("No alarm loaded. Choose a file or URL first.", "error");
        return;
      }

      try {
        await alarmManager.play(0);
        isPreviewing = true;
        previewAlarmBtn.textContent = "⏹ Stop";
        previewAlarmBtn.setAttribute("aria-label", "Stop preview");
      } catch (err) {
        log.warn("Preview failed:", err);
        showFeedback("Could not play alarm. Check the source.", "error");
        resetPreviewBtn();
      }
```
→
```js
      if (!alarmManager.isReady()) {
        showFeedback(t("alarm.feedback.noAlarmLoaded"), "error");
        return;
      }

      try {
        await alarmManager.play(0);
        isPreviewing = true;
        previewAlarmBtn.textContent = t("alarm.stopPreview");
        previewAlarmBtn.setAttribute("aria-label", t("alarm.stopPreviewAriaLabel"));
      } catch (err) {
        log.warn("Preview failed:", err);
        showFeedback(t("alarm.feedback.playFailed"), "error");
        resetPreviewBtn();
      }
```

```js
  async function updateSpotifyAuthUI() {
    const connected = await hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected ? "Connected" : "Not connected";
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
  }

  if (spotifyConnectBtn) {
    spotifyConnectBtn.addEventListener("click", async () => {
      spotifyConnectBtn.disabled = true;
      spotifyConnectBtn.textContent = "Connecting…";
      try {
        const tokens = await window.electronAPI.spotifyLogin();
        await alarmManager._saveSpotifyTokens(tokens);
        await updateSpotifyAuthUI();
        showFeedback("Spotify connected.", "success");
      } catch (err) {
        log.error("Spotify login error:", err);
        showFeedback(
          `Spotify connection failed: ${err.message ?? "Unknown error"}`,
          "error",
        );
      } finally {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.textContent = "Connect Spotify";
      }
    });
  }
```
→
```js
  async function updateSpotifyAuthUI() {
    const connected = await hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected
        ? t("alarm.spotifyConnected")
        : t("alarm.spotifyNotConnected");
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
  }

  if (spotifyConnectBtn) {
    spotifyConnectBtn.addEventListener("click", async () => {
      spotifyConnectBtn.disabled = true;
      spotifyConnectBtn.textContent = t("alarm.spotifyConnecting");
      try {
        const tokens = await window.electronAPI.spotifyLogin();
        await alarmManager._saveSpotifyTokens(tokens);
        await updateSpotifyAuthUI();
        showFeedback(t("alarm.feedback.spotifyConnected"), "success");
      } catch (err) {
        log.error("Spotify login error:", err);
        showFeedback(
          format(t("alarm.feedback.spotifyConnectFailed"), { message: err.message ?? "Unknown error" }),
          "error",
        );
      } finally {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.textContent = t("alarm.spotifyConnect");
      }
    });
  }
```

```js
      showFeedback("Spotify disconnected.", "success");
      updateProviderTag("local");
      await updateSpotifyAuthUI();
```
→
```js
      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateProviderTag("local");
      await updateSpotifyAuthUI();
```

Also find the fallback callback near the top:

```js
  alarmManager.setCallbacks({
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(
        "External alarm unavailable. Using local fallback.",
        "error",
      );
      updateProviderTag("local");
    },
```
→
```js
  alarmManager.setCallbacks({
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(t("alarm.feedback.fallback"), "error");
      updateProviderTag("local");
    },
```

- [ ] **Step 4: Re-render safely-refreshable dynamic bits on language change**

Find the very end of the `document.addEventListener("DOMContentLoaded", async () => { ... })` block, right before its closing `});`:

```js
  await updateSpotifyAuthUI();
});
```
→
```js
  await updateSpotifyAuthUI();

  onLanguageChange(() => {
    if (!isPreviewing) resetPreviewBtn();
    updateSpotifyAuthUI();
  });
});
```

(The current alarm-file label and provider tag are intentionally left alone here — see the design spec's Scope section on why they only re-sync in the language the user was in when they were last set, a documented minor gap.)

- [ ] **Step 5: Verify manually**

```bash
npm start
```

Switch to Turkish, open the Alarm Sound modal. Pick a local file — confirm the feedback banner reads in Turkish (e.g. `"dosya.mp3" alarm olarak yüklendi.`). Type an invalid URL and click Yükle — confirm the Turkish invalid-URL feedback shows. Click "▶ Önizle" — confirm it flips to "⏹ Durdur" and back on click.

- [ ] **Step 6: Commit**

```bash
git add js/alarmModal.js
git commit -m "feat(i18n): translate alarm modal labels and feedback messages"
```

---

### Task 8: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the spec's full manual verification checklist**

```bash
npm start
```

Work through every item in `docs/superpowers/specs/2026-07-09-app-language-toggle-design.md`'s "Verification plan" section (8 items: fresh launch in English, toggle to Turkish across all static UI, live status/phase updates on both tabs, mini-window sync, preset form/delete-confirm translation, alarm-modal feedback translation, quit-confirmation dialog + idle-quit regression check, and restart persistence in both directions).

- [ ] **Step 2: Fix anything that fails**

If any check fails, identify which task's file is responsible (this plan's task boundaries map 1:1 to the files above) and fix it there before moving on — don't leave a failing item for later.

- [ ] **Step 3: Final commit (only if Step 2 required changes)**

```bash
git add -A
git commit -m "fix(i18n): address issues found in end-to-end verification"
```

If Step 2 required no changes, skip this commit — there's nothing to commit.
