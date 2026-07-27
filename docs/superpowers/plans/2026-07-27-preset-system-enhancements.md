# Preset System Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all presets (including the three seeded defaults) fully editable/deletable, show "+ Add Preset" when the list is empty, auto-track unsaved timer-field edits in a "Last Session" preset, keep the preset list/form live-synced with alarm changes, and add an alarm-source navigator to the New/Edit Preset modals.

**Architecture:** Electron desktop app, vanilla JS ES modules, no framework/bundler/TypeScript, no test runner. All changes are renderer-side (`js/*.js`, `css/styles.css`, `js/i18n/translations.js`) plus one main-process fix (`lib/presetsIpc.js`). No new IPC channels are needed — everything reuses `presetsGetAll`/`presetsGetActive`/`presetsSave`/`presetsDelete`/`presetsSetActive` already exposed on `window.electronAPI` (see `preload.cjs:29-33`).

**Tech Stack:** Vanilla JS ES modules (`"type": "module"` in package.json), Electron, `electron-store` for persistence, no bundler.

## Global Constraints

- No test runner exists in this repo (`npm test` is a stub) — every task's "verify" step uses live manual/CDP-based verification instead of automated tests, per this project's established practice: launch with `--remote-debugging-port=<port>`, `curl http://127.0.0.1:<port>/json` for the `webSocketDebuggerUrl`, then drive it with Node's built-in `WebSocket` to send `Runtime.evaluate`/`Page.captureScreenshot` CDP commands. Always launch via `env -u ELECTRON_RUN_AS_NODE "node_modules/electron/dist/electron.exe" . --remote-debugging-port=<port>` (never set `ELECTRON_RUN_AS_NODE` — it breaks the app per this project's known gotcha).
- **Never delete/modify a preset via CDP that you didn't create in the current verification session** — confirm preset IDs before and after any cleanup `presetsDelete` call. A prior session in this project's history destroyed real user data this way.
- i18n: every new user-facing string needs both an English and a Turkish entry in `js/i18n/translations.js`, matching the existing `presets.*` key naming convention.
- All new async DOM updates must degrade silently on failure (no thrown errors surfaced to the user) — matches this codebase's existing pattern in `js/alarm/linkHealth.js` and `js/alarm/sourceNames.js`.
- Preset validation lives in `lib/presetsIpc.js`'s `isValidPreset()` (main process) — any new field written to a preset must already pass that validator; `alarmSource`/`alarmLinks` already do (see `VALID_ALARM_TYPES`, `isValidAlarmSource`, `isValidAlarmLinks`).

---

### Task 1: Default presets fully editable/deletable + empty-state trigger label

**Files:**
- Modify: `lib/presetsIpc.js:68-77` (`presets:get-active` handler)
- Modify: `js/presets.js:170-171` (remove `isDefault` gating), `js/presets.js:200-208` (edit/delete button markup), `js/presets.js:236, 250` (edit/delete listener guards), `js/presets.js:117-120` (trigger label)
- Modify: `js/i18n/translations.js` (new key `presets.addPresetCta`, English + Turkish)

**Interfaces:**
- Consumes: existing `window.electronAPI.presetsGetAll()`, `presetsGetActive()`, `presetsDelete(id)` (all already used in `js/presets.js`).
- Produces: no new exports — `buildPresetItem()` and `renderPresets()` keep their existing signatures, just with different internal behavior.

- [ ] **Step 1: Normalize the empty-store fallback in `presets:get-active`**

In `lib/presetsIpc.js`, find:

```js
  ipcMain.handle("presets:get-active", () => {
    try {
      const presets = store.get("presets");
      const activeId = store.get("activePresetId");
      return presets.find(p => p.id === activeId) ?? presets[0];
    } catch (e) {
      log.error("presets:get-active error:", e);
      return null;
    }
  });
```

Change the return line to:

```js
      return presets.find(p => p.id === activeId) ?? presets[0] ?? null;
```

- [ ] **Step 2: Add the "+ Add Preset" i18n key**

In `js/i18n/translations.js`, find the English block's `"presets.emptyState": "No presets yet.",` line and add directly after it:

```js
    "presets.addPresetCta": "+ Add Preset",
```

Find the Turkish block's `"presets.emptyState": "Henüz hazır ayar yok.",` line and add directly after it:

```js
    "presets.addPresetCta": "+ Hazır Ayar Ekle",
```

- [ ] **Step 3: Remove default-preset protection in `buildPresetItem()`**

In `js/presets.js`, remove the `isDefault` computation:

```js
function buildPresetItem(preset, isActive, onLoad, onRefresh, onClose, alarmBroken = false) {
  const isDefault = preset.id.startsWith("default-");

  const li = document.createElement("li");
```

becomes:

```js
function buildPresetItem(preset, isActive, onLoad, onRefresh, onClose, alarmBroken = false) {
  const li = document.createElement("li");
```

Then replace the edit/delete button markup:

```js
    <div class="preset-item__actions">
      <button class="preset-item__btn preset-item__btn--edit no-hover-lift"
        aria-label="${format(t("presets.editAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${t("presets.editTitle")}"
        ${isDefault ? "disabled" : ""}>✎</button>
      <button class="preset-item__btn preset-item__btn--delete no-hover-lift"
        aria-label="${format(t("presets.deleteAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${isDefault ? t("presets.cannotDeleteDefaultTitle") : t("presets.deleteTitle")}"
        ${isDefault ? "disabled" : ""}>✕</button>
    </div>
```

with:

```js
    <div class="preset-item__actions">
      <button class="preset-item__btn preset-item__btn--edit no-hover-lift"
        aria-label="${format(t("presets.editAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${t("presets.editTitle")}">✎</button>
      <button class="preset-item__btn preset-item__btn--delete no-hover-lift"
        aria-label="${format(t("presets.deleteAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${t("presets.deleteTitle")}">✕</button>
    </div>
```

Then update the two listener-attachment guards later in the same function:

```js
  const editBtn = li.querySelector(".preset-item__btn--edit");
  if (editBtn && !isDefault) {
```

becomes:

```js
  const editBtn = li.querySelector(".preset-item__btn--edit");
  if (editBtn) {
```

and:

```js
  if (deleteBtn && !isDefault) {
```

becomes:

```js
  if (deleteBtn) {
```

(`presets.cannotDeleteDefaultTitle` becomes an unused i18n key — leave it in `translations.js`; removing i18n keys is out of scope for this task and not worth the churn.)

- [ ] **Step 4: Show "+ Add Preset" on the trigger when the list is empty**

In `js/presets.js`'s `renderPresets()`, find:

```js
    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? t("interval.presetsDefault");
    }
```

Replace with:

```js
    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent =
        !presets || presets.length === 0
          ? t("presets.addPresetCta")
          : (active?.name ?? t("interval.presetsDefault"));
    }
```

(`presets` here is the array already destructured at the top of `renderPresets()` from `Promise.all([...])` — no new variable needed.)

- [ ] **Step 5: Verify live via CDP**

Launch the app with remote debugging (see Global Constraints), then in a `Runtime.evaluate` call:

```js
(async () => {
  // Confirm every preset — including the three seeded defaults — now
  // renders enabled edit/delete buttons.
  document.getElementById('presetTriggerBtn').click();
  const disabledButtons = [...document.querySelectorAll('.preset-item__btn')]
    .filter(b => b.disabled).length;
  return { disabledButtons }; // expect 0
})()
```

Then screenshot the open dropdown (`Page.captureScreenshot`) and visually confirm the ✎/✕ icons are no longer greyed out on "Pomodoro"/"Short Focus"/"Deep Work".

Next, confirm the empty-state trigger label using a **disposable copy of the store**, so the real seeded presets are never actually deleted:

1. Quit the running app.
2. Copy `%APPDATA%\interval-timer\timer-config.json` to `timer-config.json.bak` in the same folder.
3. Relaunch with remote debugging, then delete every preset through the running app:

```js
(async () => {
  const all = await window.electronAPI.presetsGetAll();
  for (const p of all) await window.electronAPI.presetsDelete(p.id);
  document.getElementById('presetTriggerBtn').click();
  return { label: document.getElementById('presetTriggerLabel').textContent.trim() };
})()
```

Expect `label` to be `"+ Add Preset"`. Screenshot the empty dropdown (shows the `.preset-empty` state + "+ New preset" footer) to confirm visually.

4. Quit the app, delete the mutated `timer-config.json`, rename `timer-config.json.bak` back to `timer-config.json`, and relaunch to confirm the three seeded defaults are back.

- [ ] **Step 6: Update CLAUDE.md**

In `CLAUDE.md`'s "Presets" section, change:

```
Three seeded default presets are not deletable by convention; user presets capped at `MAX_PRESETS = 20` (enforced in `main.js`, not the renderer).
```

to:

```
The three seeded default presets are ordinary presets — editable and deletable like any other; presets capped at `MAX_PRESETS = 20` (enforced in `lib/presetsIpc.js`, not the renderer). The preset trigger shows "+ Add Preset" when the list is empty.
```

- [ ] **Step 7: Commit**

```bash
git add lib/presetsIpc.js js/presets.js js/i18n/translations.js CLAUDE.md
git commit -m "feat: make default presets editable/deletable, show Add Preset when empty"
```

---

### Task 2: Live alarm → preset-list sync (`preset-data-changed` event)

**Files:**
- Modify: `js/alarmModal.js:437-443` (`applyLocalFile`), `js/alarmModal.js:520-528` (`resetToDefault`), `js/alarmModal.js:391-396` (`saveAlarmLink`), `js/alarmModal.js:824-829` (Spotify logout revert path)
- Modify: `js/presets.js:16-23` (add listener inside `setupPresets`)

**Interfaces:**
- Consumes: nothing new.
- Produces: a global `CustomEvent("preset-data-changed")` dispatched on `window` — any module may listen for "the active preset's stored data changed in place" (distinct from `preset-activated`, which means "a *different* preset became active").

- [ ] **Step 1: Dispatch `preset-data-changed` after `applyLocalFile`'s save**

In `js/alarmModal.js`, find:

```js
    const url = toFileUrl(filePath);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", filePath);
    const savedPreset = await saveActivePreset({
      alarmSource: { type: "local", value: filePath },
    });
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
```

Add one line right after the `updateAlarmHealthBadge(...)` call:

```js
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
    window.dispatchEvent(new CustomEvent("preset-data-changed"));
```

- [ ] **Step 2: Dispatch it after `resetToDefault`'s save**

Find:

```js
  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    const savedPreset = await saveActivePreset({ alarmSource: null });
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
```

Add the same dispatch line right after:

```js
    updateAlarmHealthBadge(
      savedPreset?.id ?? null,
      savedPreset?.alarmSource ?? null,
    );
    window.dispatchEvent(new CustomEvent("preset-data-changed"));
```

- [ ] **Step 3: Dispatch it after `saveAlarmLink`'s save**

Find:

```js
  async function saveAlarmLink(type, url) {
    const active = await getActivePreset();
    if (!active) return;
    const existing = active.alarmLinks?.[type] ?? [];
    const alarmLinks = {
      youtube: active.alarmLinks?.youtube ?? [],
      spotify: active.alarmLinks?.spotify ?? [],
      [type]: addLink(existing, url),
    };
    await window.electronAPI.presetsSave({
      ...active,
      alarmLinks,
      alarmSource: { type, value: url },
    });
    await renderLinkList(type);
  }
```

Add the dispatch before `await renderLinkList(type)`:

```js
    await window.electronAPI.presetsSave({
      ...active,
      alarmLinks,
      alarmSource: { type, value: url },
    });
    window.dispatchEvent(new CustomEvent("preset-data-changed"));
    await renderLinkList(type);
  }
```

- [ ] **Step 4: Dispatch it after the Spotify-logout revert save**

Find (inside the `spotifyLogoutBtn` click handler):

```js
          await alarmManager.load(DEFAULT_ALARM);
          alarmManager.setFallbackSource(DEFAULT_ALARM);
          localStorage.removeItem("selectedAlarmPath");
          const savedPreset = await saveActivePreset({ alarmSource: null });
          updateAlarmHealthBadge(
            savedPreset?.id ?? null,
            savedPreset?.alarmSource ?? null,
          );
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
```

Add the dispatch after `updateAlarmHealthBadge(...)`:

```js
          updateAlarmHealthBadge(
            savedPreset?.id ?? null,
            savedPreset?.alarmSource ?? null,
          );
          window.dispatchEvent(new CustomEvent("preset-data-changed"));
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
```

- [ ] **Step 5: Listen for it in `js/presets.js`**

In `setupPresets()`, right after the existing `preset-alarm-health` listener block:

```js
  window.addEventListener("preset-alarm-health", async e => {
    const current = await window.electronAPI.presetsGetActive();
    if (!current || current.id !== e.detail.presetId) return;
    activeAlarmBroken = e.detail.broken;
    applyAlarmBadgeDisplay();
  });
```

add:

```js
  // Fired by js/alarmModal.js whenever the active preset's alarmSource is
  // saved — re-render so an open (or later-opened) dropdown reflects the
  // change without needing to be closed/reopened.
  window.addEventListener("preset-data-changed", () => {
    renderPresets();
  });
```

(`renderPresets` is declared with `async function renderPresets()` further down in the same `setupPresets()` closure — function declarations are hoisted, so this reference is valid regardless of listener registration order relative to the declaration.)

- [ ] **Step 6: Verify live via CDP**

Launch the app with remote debugging. Open the presets dropdown, then in a separate `Runtime.evaluate` call, simulate an alarm change on the active preset and confirm the dropdown's `.preset-item__source` text updates without re-opening it:

```js
(async () => {
  const before = document.querySelector('.preset-item--active .preset-item__source')?.textContent.trim();
  const active = await window.electronAPI.presetsGetActive();
  await window.electronAPI.presetsSave({ ...active, alarmSource: { type: 'youtube', value: 'https://youtu.be/dQw4w9WgXcQ' } });
  window.dispatchEvent(new CustomEvent('preset-data-changed'));
  await new Promise(r => setTimeout(r, 50));
  const after = document.querySelector('.preset-item--active .preset-item__source')?.textContent.trim();
  return { before, after };
})()
```

Expect `before` to show the old source (e.g. "🎧 Local Audio File · alarm.mp3") and `after` to show "🎧 YouTube" (name fills in a moment later asynchronously — that's expected, matches existing behavior). Afterward, restore the preset's original `alarmSource` (re-save with the value captured in `before`'s underlying preset object, or simply reload the app without saving further — do not leave test data mutations on a real preset).

- [ ] **Step 7: Commit**

```bash
git add js/alarmModal.js js/presets.js
git commit -m "feat: live-refresh preset list when the active preset's alarm changes"
```

---

### Task 3: "Last Session" auto-tracking preset

**Files:**
- Modify: `js/intervalTimer.js:21-52` (add debounced sync + listeners)
- Modify: `js/i18n/translations.js` (new key `presets.lastSessionName`, English + Turkish)

**Interfaces:**
- Consumes: `window.electronAPI.presetsGetAll()`, `presetsGetActive()`, `presetsSave(preset)`, `presetsSetActive(id)` (all existing). Dispatches `preset-data-changed` (from Task 2) after each sync so the preset list/trigger label reflect the fork immediately.
- Produces: a preset with fixed `id: "last-session"` in the store. No new exported functions — this is self-contained inside `setupIntervalTimer()`.

- [ ] **Step 1: Add the default name i18n key**

In `js/i18n/translations.js`, add to the English block (next to the other `presets.*` keys):

```js
    "presets.lastSessionName": "Last Session",
```

and to the Turkish block:

```js
    "presets.lastSessionName": "Son Oturum",
```

- [ ] **Step 2: Add the debounced sync function and input listeners**

In `js/intervalTimer.js`, `setupIntervalTimer()` currently starts:

```js
export function setupIntervalTimer(alarmSettings) {
  const workDurationInput = document.getElementById("workMinutes");
  const breakDurationInput = document.getElementById("breakMinutes");
  const loopCountInput = document.getElementById("loopCount");
  const startBtn = document.getElementById("startLoopBtn");
  const pauseBtn = document.getElementById("pauseLoopBtn");
  const continueBtn = document.getElementById("continueLoopBtn");
  const resetBtn = document.getElementById("resetIntervalBtn");

  // ── Preset yüklendiğinde input'ları doldur ────────────────
  function applyPreset(preset) {
```

Insert a new block right after the `resetBtn` const and before `applyPreset`'s comment/definition:

```js
  const workSecondsInput = document.getElementById("workSeconds");
  const breakSecondsInput = document.getElementById("breakSeconds");

  // ── "Last Session" auto-tracking ──────────────────────────
  // Any real edit to the timer fields (typing, or the number-stepper
  // buttons, which also dispatch a native "input" event — see
  // js/numberStepper.js) forks the active preset into a dedicated
  // "last-session" preset so unsaved edits are never lost: it becomes
  // the active preset (so it reloads on next launch via the existing
  // applyPreset()-on-startup path below), and is a fully normal,
  // renameable/deletable preset once created. Debounced so rapid
  // typing doesn't hammer the store with a write per keystroke.
  const LAST_SESSION_ID = "last-session";
  let lastSessionSyncTimer = null;

  function readTimerFields() {
    return {
      workMinutes: parseInt(workDurationInput.value, 10) || 0,
      workSeconds: parseInt(workSecondsInput?.value, 10) || 0,
      breakMinutes: parseInt(breakDurationInput.value, 10) || 0,
      breakSeconds: parseInt(breakSecondsInput?.value, 10) || 0,
      loops: parseInt(loopCountInput.value, 10) || 1,
    };
  }

  async function syncLastSessionPreset() {
    try {
      const active = await window.electronAPI.presetsGetActive();
      const allPresets = await window.electronAPI.presetsGetAll();
      const existingLastSession = allPresets.find(p => p.id === LAST_SESSION_ID);

      const isAlreadyActive = active?.id === LAST_SESSION_ID;
      const base = isAlreadyActive ? active : existingLastSession;

      const payload = {
        id: LAST_SESSION_ID,
        name: base?.name ?? t("presets.lastSessionName"),
        ...readTimerFields(),
        alarmSource: active?.alarmSource ?? null,
        alarmLinks: base?.alarmLinks ?? { youtube: [], spotify: [] },
      };

      const result = await window.electronAPI.presetsSave(payload);
      if (result?.error) return;

      if (!isAlreadyActive) {
        await window.electronAPI.presetsSetActive(LAST_SESSION_ID);
      }

      // Not "preset-activated" — that would re-run applyPreset() and
      // stomp on the field values the user is actively editing. Only
      // the list/trigger-label UI needs to know something changed.
      window.dispatchEvent(new CustomEvent("preset-data-changed"));
    } catch (e) {
      console.error("syncLastSessionPreset failed:", e);
    }
  }

  function scheduleLastSessionSync() {
    clearTimeout(lastSessionSyncTimer);
    lastSessionSyncTimer = setTimeout(syncLastSessionPreset, 500);
  }

  [workDurationInput, workSecondsInput, breakDurationInput, breakSecondsInput, loopCountInput]
    .filter(Boolean)
    .forEach(input => {
      input.addEventListener("input", scheduleLastSessionSync);
    });

  // ── Preset yüklendiğinde input'ları doldur ────────────────
  function applyPreset(preset) {
```

- [ ] **Step 3: Verify live via CDP**

Launch the app with remote debugging. Confirm typing into Work Minutes forks to "Last Session":

```js
(async () => {
  const before = await window.electronAPI.presetsGetActive();
  const wm = document.getElementById('workMinutes');
  wm.value = '33';
  wm.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 700)); // past the 500ms debounce
  const after = await window.electronAPI.presetsGetActive();
  return { beforeId: before?.id, afterId: after?.id, afterWorkMinutes: after?.workMinutes };
})()
```

Expect `afterId === "last-session"` and `afterWorkMinutes === 33`. Then confirm a second edit doesn't create a duplicate:

```js
(async () => {
  const wm = document.getElementById('workMinutes');
  wm.value = '40';
  wm.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 700));
  const all = await window.electronAPI.presetsGetAll();
  return { lastSessionCount: all.filter(p => p.id === 'last-session').length, workMinutes: all.find(p => p.id === 'last-session')?.workMinutes };
})()
```

Expect `lastSessionCount === 1` and `workMinutes === 40`. Screenshot the preset trigger to confirm its label now reads "Last Session". Clean up afterward: `window.electronAPI.presetsDelete("last-session")` and `presetsSetActive("default-pomodoro")` (or whatever was active before this test) to leave the store as found.

- [ ] **Step 4: Commit**

```bash
git add js/intervalTimer.js js/i18n/translations.js
git commit -m "feat: auto-track unsaved timer edits in a Last Session preset"
```

---

### Task 4: Alarm-source navigator — shared renderer + New Preset form

**Files:**
- Modify: `js/presets.js:492-520` (export `alarmSourceInfo`), `js/presets.js:301-468` (`showPresetForm`)
- Modify: `css/styles.css` (new `.preset-form__alarm-nav` rules)
- Modify: `js/i18n/translations.js` (new keys `presets.alarmNavLabel`, English + Turkish)

**Interfaces:**
- Consumes: `alarmSourceInfo(alarmSource)` (already defined in this file — this task just adds `export`), `peekYoutubeTitle`/`peekSpotifyName`/`resolveYoutubeTitle`/`resolveSpotifyName` (already imported at the top of `js/presets.js`).
- Produces: `showPresetForm()` gains a rendered `#pfAlarmNav` row and a `refreshAlarmNavPreview()` closure function that Task 5 will also call. `validate()`'s save payload gains an `alarmSource` field (previously omitted for new presets).

- [ ] **Step 1: Export `alarmSourceInfo`**

In `js/presets.js`, change:

```js
function alarmSourceInfo(alarmSource) {
```

to:

```js
export function alarmSourceInfo(alarmSource) {
```

- [ ] **Step 2: Add the navigator row's i18n label**

In `js/i18n/translations.js`, English block:

```js
    "presets.alarmNavLabel": "Alarm",
```

Turkish block:

```js
    "presets.alarmNavLabel": "Alarm",
```

(Turkish also commonly uses "Alarm" as a loanword here; keep it identical rather than guessing a stilted translation — this matches how "Spotify"/"YouTube" are left untranslated elsewhere in this same file per `alarmModal.js`'s existing comment: "Provider brand names below... not translated.")

- [ ] **Step 3: Render the navigator row in the preset form**

In `js/presets.js`'s `showPresetForm()`, find the Loops field block and the error/buttons that follow it:

```js
      <div class="preset-form__field">
        <label for="pf-loops">${t("presets.loopsLabel")}</label>
        <input id="pf-loops" type="number" min="1" max="99"
          value="${p.loops}" />
      </div>

      <p class="preset-form__error hidden" id="pfError"
        role="alert" aria-live="assertive"></p>
```

Insert a new row between them:

```js
      <div class="preset-form__field">
        <label for="pf-loops">${t("presets.loopsLabel")}</label>
        <input id="pf-loops" type="number" min="1" max="99"
          value="${p.loops}" />
      </div>

      <div class="preset-form__field">
        <label>${t("presets.alarmNavLabel")}</label>
        <button type="button" class="preset-form__alarm-nav no-hover-lift" id="pfAlarmNav">
          <span class="preset-form__alarm-nav-text" id="pfAlarmNavText">🎧 …</span>
          <span class="preset-form__alarm-nav-chevron" aria-hidden="true">›</span>
        </button>
      </div>

      <p class="preset-form__error hidden" id="pfError"
        role="alert" aria-live="assertive"></p>
```

- [ ] **Step 4: Wire the navigator's preview + click behavior**

Still in `showPresetForm()`, after the existing:

```js
  const nameInput = overlay.querySelector("#pf-name");
  const errEl = overlay.querySelector("#pfError");

  setTimeout(() => nameInput?.focus(), 50);
```

add:

```js
  // ── Alarm-source navigator ─────────────────────────────────
  // For a NEW preset this previews whatever alarm is currently active —
  // that's exactly what gets baked into the new preset at save time (see
  // validate() below). For an EDIT (wired in a later task), it shows that
  // specific preset's own alarmSource instead.
  const alarmNavBtn = overlay.querySelector("#pfAlarmNav");
  const alarmNavText = overlay.querySelector("#pfAlarmNavText");
  let currentAlarmSource = null;

  function renderAlarmNavText(alarmSource) {
    const info = alarmSourceInfo(alarmSource);
    const nameHtml = info.name ? ` · ${escapeHtml(info.name)}` : "";
    alarmNavText.innerHTML = `🎧 ${escapeHtml(info.label)}<span class="preset-form__alarm-nav-name"></span>`;
    const nameEl = alarmNavText.querySelector(".preset-form__alarm-nav-name");
    if (nameHtml) {
      nameEl.before(" · ");
      nameEl.textContent = info.name;
    }
    if (!info.name && info.resolve) {
      info.resolve().then(name => {
        if (!name) return;
        nameEl.before(" · ");
        nameEl.textContent = name;
      });
    }
  }

  async function refreshAlarmNavPreview() {
    const active = await window.electronAPI.presetsGetActive();
    currentAlarmSource = active?.alarmSource ?? null;
    renderAlarmNavText(currentAlarmSource);
  }

  if (alarmNavBtn) {
    refreshAlarmNavPreview();

    alarmNavBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
      const alarmModal = document.getElementById("alarmFolderModal");
      alarmModal.classList.remove("hidden");

      const observer = new MutationObserver(() => {
        if (alarmModal.classList.contains("hidden")) {
          observer.disconnect();
          overlay.classList.remove("hidden");
          refreshAlarmNavPreview();
        }
      });
      observer.observe(alarmModal, { attributes: true, attributeFilter: ["class"] });
    });
  }
```

- [ ] **Step 5: Include the captured alarm source when saving a new preset**

In `validate()`, find:

```js
    const result = await window.electronAPI.presetsSave({
      ...p,
      name,
      workMinutes,
      workSeconds,
      breakMinutes,
      breakSeconds,
      loops,
    });
```

Change to:

```js
    const result = await window.electronAPI.presetsSave({
      ...p,
      name,
      workMinutes,
      workSeconds,
      breakMinutes,
      breakSeconds,
      loops,
      alarmSource: currentAlarmSource,
    });
```

(For edit mode this still just re-saves whatever `currentAlarmSource` was refreshed to, which — before Task 5 — is always `existingPreset`'s own original value at form-open time, since only the New-preset path can change it so far. Task 5 makes edit mode's navigator actually change the *right* preset's alarm.)

- [ ] **Step 6: Add navigator CSS**

In `css/styles.css`, near the existing `.preset-form__field` rules, add:

```css
.preset-form__alarm-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--modal-border);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.preset-form__alarm-nav:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--accent);
}

.preset-form__alarm-nav:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.preset-form__alarm-nav-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.preset-form__alarm-nav-chevron {
  color: var(--ink-muted);
  margin-left: var(--sp-2);
  flex-shrink: 0;
}
```

- [ ] **Step 7: Verify live via CDP**

Launch the app with remote debugging. Open the New Preset form and confirm the navigator shows the current alarm, then confirm clicking it opens the Alarm Sound modal and hides the preset form:

```js
(async () => {
  document.getElementById('addPresetBtn').click();
  await new Promise(r => setTimeout(r, 100));
  const navText = document.getElementById('pfAlarmNavText')?.textContent.trim();
  document.getElementById('pfAlarmNav').click();
  await new Promise(r => setTimeout(r, 100));
  const overlayHidden = document.getElementById('presetFormOverlay').classList.contains('hidden');
  const alarmModalHidden = document.getElementById('alarmFolderModal').classList.contains('hidden');
  return { navText, overlayHidden, alarmModalHidden };
})()
```

Expect `overlayHidden: true`, `alarmModalHidden: false`. Screenshot to visually confirm the Alarm Sound modal is now the visible/interactive one. Then close the Alarm modal (click `#closeAlarmFolderBtn`) and confirm the preset form reappears:

```js
(async () => {
  document.getElementById('closeAlarmFolderBtn').click();
  await new Promise(r => setTimeout(r, 100));
  return { overlayHidden: document.getElementById('presetFormOverlay').classList.contains('hidden') };
})()
```

Expect `overlayHidden: false`. Finally, save a new preset and confirm it received an `alarmSource`:

```js
(async () => {
  document.getElementById('pf-name').value = 'CDP Test Preset';
  document.getElementById('pfSaveBtn').click();
  await new Promise(r => setTimeout(r, 200));
  const all = await window.electronAPI.presetsGetAll();
  const created = all.find(p => p.name === 'CDP Test Preset');
  const result = { hasAlarmSource: created?.alarmSource !== undefined, alarmSource: created?.alarmSource };
  await window.electronAPI.presetsDelete(created.id); // clean up — only the preset this test created
  return result;
})()
```

- [ ] **Step 8: Commit**

```bash
git add js/presets.js css/styles.css js/i18n/translations.js
git commit -m "feat: add alarm-source navigator to the New Preset modal"
```

---

### Task 5: Alarm-source navigator — Edit Preset form

**Files:**
- Modify: `js/presets.js` (the `refreshAlarmNavPreview`/click-handler block added in Task 4, inside `showPresetForm()`)

**Interfaces:**
- Consumes: `isEdit`, `p` (the existing preset being edited — both already in scope inside `showPresetForm()`), `window.electronAPI.presetsGetActive()`/`presetsSetActive(id)`/`presetsGetAll()`.
- Produces: no new exports — refines the behavior added in Task 4 so Edit mode targets the correct preset.

- [ ] **Step 1: Make the preview source-aware of edit vs. new**

Replace the `refreshAlarmNavPreview()` function added in Task 4:

```js
  async function refreshAlarmNavPreview() {
    const active = await window.electronAPI.presetsGetActive();
    currentAlarmSource = active?.alarmSource ?? null;
    renderAlarmNavText(currentAlarmSource);
  }
```

with:

```js
  async function refreshAlarmNavPreview() {
    if (isEdit) {
      // Re-read by id rather than trusting the closed-over `p` — if the
      // navigator's alarm-modal flow just changed this preset's alarm,
      // the on-disk copy is newer than the object this form was opened
      // with.
      const all = await window.electronAPI.presetsGetAll();
      const latestSelf = all.find(pr => pr.id === p.id);
      currentAlarmSource = latestSelf?.alarmSource ?? null;
    } else {
      const active = await window.electronAPI.presetsGetActive();
      currentAlarmSource = active?.alarmSource ?? null;
    }
    renderAlarmNavText(currentAlarmSource);
  }
```

- [ ] **Step 2: Make the click handler activate the edited preset first (edit mode only)**

Replace the click handler added in Task 4:

```js
    alarmNavBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
      const alarmModal = document.getElementById("alarmFolderModal");
      alarmModal.classList.remove("hidden");

      const observer = new MutationObserver(() => {
        if (alarmModal.classList.contains("hidden")) {
          observer.disconnect();
          overlay.classList.remove("hidden");
          refreshAlarmNavPreview();
        }
      });
      observer.observe(alarmModal, { attributes: true, attributeFilter: ["class"] });
    });
```

with:

```js
    alarmNavBtn.addEventListener("click", async () => {
      // The Alarm Sound modal always edits "whichever preset is active"
      // (existing mechanism in js/alarmModal.js) — for an edit form on a
      // preset that isn't already active, switch to it first so the
      // change lands on the right preset. This is IPC-only bookkeeping;
      // it does not touch the main Interval tab's visible fields (those
      // only change via the separate preset-activated event, which this
      // does not fire).
      if (isEdit) {
        const active = await window.electronAPI.presetsGetActive();
        if (active?.id !== p.id) {
          await window.electronAPI.presetsSetActive(p.id);
        }
      }

      overlay.classList.add("hidden");
      const alarmModal = document.getElementById("alarmFolderModal");
      alarmModal.classList.remove("hidden");

      const observer = new MutationObserver(() => {
        if (alarmModal.classList.contains("hidden")) {
          observer.disconnect();
          overlay.classList.remove("hidden");
          refreshAlarmNavPreview();
        }
      });
      observer.observe(alarmModal, { attributes: true, attributeFilter: ["class"] });
    });
```

- [ ] **Step 3: Verify live via CDP**

Launch the app with remote debugging. Confirm editing a *non-active* preset's alarm targets the right one:

```js
(async () => {
  // Make sure Pomodoro is active and Short Focus is not, so this is a
  // genuine "editing a non-active preset" case.
  await window.electronAPI.presetsSetActive('default-pomodoro');

  document.getElementById('presetTriggerBtn').click();
  const rows = [...document.querySelectorAll('.preset-item')];
  const shortFocusRow = rows.find(li => li.querySelector('.preset-item__name')?.textContent === 'Short Focus');
  shortFocusRow.querySelector('.preset-item__btn--edit').click();
  await new Promise(r => setTimeout(r, 100));

  document.getElementById('pfAlarmNav').click();
  await new Promise(r => setTimeout(r, 100));
  const activeAfterClick = await window.electronAPI.presetsGetActive();
  return { activeAfterClick: activeAfterClick?.id }; // expect "default-short"
})()
```

Then, with the Alarm Sound modal now open and targeting "Short Focus", change its alarm and confirm it landed on the right preset (not "Pomodoro"):

```js
(async () => {
  const active = await window.electronAPI.presetsGetActive();
  await window.electronAPI.presetsSave({ ...active, alarmSource: { type: 'youtube', value: 'https://youtu.be/dQw4w9WgXcQ' } });
  window.dispatchEvent(new CustomEvent('preset-data-changed'));

  document.getElementById('closeAlarmFolderBtn').click();
  await new Promise(r => setTimeout(r, 100));

  const navText = document.getElementById('pfAlarmNavText')?.textContent.trim();
  const all = await window.electronAPI.presetsGetAll();
  const shortFocus = all.find(p => p.id === 'default-short');
  const pomodoro = all.find(p => p.id === 'default-pomodoro');
  return {
    navText, // expect it to now show "YouTube"
    shortFocusAlarmType: shortFocus?.alarmSource?.type, // expect "youtube"
    pomodoroAlarmType: pomodoro?.alarmSource?.type, // expect unaffected (whatever it was before)
  };
})()
```

Clean up: restore "Short Focus"'s `alarmSource` to whatever it was before this test (or `null` if it had none), and re-activate whichever preset was originally active, since this test intentionally mutates real seeded-preset data.

- [ ] **Step 4: Commit**

```bash
git add js/presets.js
git commit -m "feat: alarm-source navigator in Edit Preset modal targets the edited preset"
```

## Self-Review Notes

- **Spec coverage:** Part A → Task 1. Part B → Task 1. Part C → Task 3. Part D → Task 2. Part E → Tasks 4 + 5. All five spec sections have a task.
- **Placeholder scan:** no TBD/TODO; every step has literal before/after code.
- **Type/name consistency:** `preset-data-changed` (Task 2) is dispatched identically in `alarmModal.js` and `intervalTimer.js`, and listened for identically in `presets.js`. `alarmSourceInfo` (exported in Task 4) matches the name already used internally since before this plan. `LAST_SESSION_ID = "last-session"` (Task 3) matches the id checked against in Task 3's own verification steps. `refreshAlarmNavPreview`/`currentAlarmSource`/`alarmNavBtn` (Task 4) are the exact names Task 5 modifies.
