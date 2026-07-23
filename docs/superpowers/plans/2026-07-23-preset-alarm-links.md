# Preset Alarm Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each preset remembers its own alarm source (local file, YouTube link, or Spotify link) and auto-switches the loaded alarm when the active preset changes; YouTube/Spotify links become a per-preset, add/remove-managed list in the Alarm Sound modal.

**Architecture:** Preset switching (`js/presets.js` / `js/intervalTimer.js`) and alarm loading (`js/alarmModal.js`) stay in separate modules, connected by a `preset-activated` `CustomEvent` dispatched from `intervalTimer.js`'s `applyPreset()`. Alarm source data (`alarmSource`, `alarmLinks`) is stored directly on the preset object and persisted through the existing `presets:save` IPC handler — no new IPC channels.

**Tech Stack:** Vanilla JS ES modules (`"type": "module"`), Electron renderer process, `electron-store` (main process) for persistence. No bundler, no TypeScript, no test framework — see Global Constraints.

## Global Constraints

- No automated test suite or lint script exists in this repo (per `CLAUDE.md`) — do not add a test framework. "Testing" steps in this plan are manual verification (via `npm start` and/or Chrome DevTools Protocol), matching this project's established practice.
- ES modules only (`"type": "module"` in `package.json`); `preload.cjs` is the one `.cjs` exception and is not touched by this plan.
- No new IPC channels — all preset persistence goes through the existing `presets:save` handler (`lib/presetsIpc.js`).
- Saved link lists are MRU-ordered, capped at **5** entries per type per preset (matches the existing local-file "Recent" list convention in `js/alarm/recentAlarms.js`).
- Each `alarmSource.value` / saved link string is capped at **2000** characters in validation.
- Local audio files are **not** added to the new per-preset link list — they keep using the existing global `localStorage`-backed "Recent" list unchanged.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/alarm/presetAlarmLinks.js` | Create | Pure add/remove/cap logic for a per-preset link array (mirrors `recentAlarms.js`, generalized). |
| `lib/presetsIpc.js` | Modify | Extend `isValidPreset()` to validate optional `alarmSource`/`alarmLinks` fields. |
| `js/i18n/translations.js` | Modify | Add `alarm.savedLinksLabel` / `alarm.savedLinkRemoveAriaLabel` (en + tr). |
| `index.html` | Modify | Add saved-link `<ul>` containers under the YouTube and Spotify accordion sections. |
| `js/intervalTimer.js` | Modify | `applyPreset()` dispatches `preset-activated` on `window`. |
| `js/alarm/AlarmManager.js` | Modify | `initialize()` accepts the saved source as a parameter instead of reading `localStorage` itself. |
| `js/alarmModal.js` | Modify | Preset-aware initial load + migration (Task 5); saved-link list rendering/add/remove/activate (Task 6); local-file and Spotify-disconnect preset sync (Task 7). |

---

### Task 1: Per-preset link list helper (`js/alarm/presetAlarmLinks.js`)

**Files:**
- Create: `js/alarm/presetAlarmLinks.js`

**Interfaces:**
- Produces: `addLink(links: string[], newLink: string): string[]`, `removeLink(links: string[], linkToRemove: string): string[]` — both pure, no I/O. `addLink` dedupes, moves the link to the front, caps at 5. Consumed by Task 6.

- [ ] **Step 1: Write the module**

```js
// js/alarm/presetAlarmLinks.js
const MAX_LINKS = 5;

export function addLink(links, newLink) {
  const withoutDup = links.filter(l => l !== newLink);
  return [newLink, ...withoutDup].slice(0, MAX_LINKS);
}

export function removeLink(links, linkToRemove) {
  return links.filter(l => l !== linkToRemove);
}
```

- [ ] **Step 2: Manually verify the logic**

Run (from the repo root):

```bash
node --input-type=module -e "
import { addLink, removeLink } from './js/alarm/presetAlarmLinks.js';
let links = [];
links = addLink(links, 'a');
links = addLink(links, 'b');
links = addLink(links, 'a'); // re-add moves 'a' to front, no dup
console.log('after adds:', links); // expect [ 'a', 'b' ]
links = addLink(links, 'c');
links = addLink(links, 'd');
links = addLink(links, 'e');
links = addLink(links, 'f'); // 6th add evicts oldest ('b')
console.log('after cap:', links); // expect [ 'f','e','d','c','a' ], length 5
links = removeLink(links, 'd');
console.log('after remove:', links); // expect no 'd', length 4
"
```

Expected output:
```
after adds: [ 'a', 'b' ]
after cap: [ 'f', 'e', 'd', 'c', 'a' ]
after remove: [ 'f', 'e', 'c', 'a' ]
```

- [ ] **Step 3: Commit**

```bash
git add js/alarm/presetAlarmLinks.js
git commit -m "feat: add per-preset alarm link list helper"
```

---

### Task 2: Validate `alarmSource`/`alarmLinks` on presets (`lib/presetsIpc.js`)

**Files:**
- Modify: `lib/presetsIpc.js:9-22` (the `isValidPreset` function)

**Interfaces:**
- Consumes: nothing new.
- Produces: `isValidPreset(preset)` now also accepts presets carrying `alarmSource: {type, value} | null` and `alarmLinks: {youtube: string[], spotify: string[]}`. Both fields remain optional — a preset with neither is still valid (existing/seeded presets keep working unchanged). Later tasks (5, 6, 7) build presets with these fields and rely on `presets:save` accepting them.

- [ ] **Step 1: Replace `isValidPreset` with the extended version**

Find this in `lib/presetsIpc.js`:

```js
export function isValidPreset(preset) {
  if (!preset || typeof preset !== "object") return false;
  if (typeof preset.id !== "string" || !preset.id) return false;
  if (typeof preset.name !== "string" || preset.name.length > 100)
    return false;
  const isSmallNonNegInt = n => Number.isInteger(n) && n >= 0 && n <= 999;
  return (
    isSmallNonNegInt(preset.workMinutes) &&
    isSmallNonNegInt(preset.workSeconds) &&
    isSmallNonNegInt(preset.breakMinutes) &&
    isSmallNonNegInt(preset.breakSeconds) &&
    isSmallNonNegInt(preset.loops)
  );
}
```

Replace it with:

```js
const VALID_ALARM_TYPES = ["local", "youtube", "spotify"];
const MAX_LINK_LENGTH = 2000;
const MAX_LINKS_PER_TYPE = 5;

function isValidAlarmSource(alarmSource) {
  if (alarmSource === null || alarmSource === undefined) return true;
  if (typeof alarmSource !== "object") return false;
  if (!VALID_ALARM_TYPES.includes(alarmSource.type)) return false;
  return (
    typeof alarmSource.value === "string" &&
    alarmSource.value.length > 0 &&
    alarmSource.value.length <= MAX_LINK_LENGTH
  );
}

function isValidLinkArray(links) {
  return (
    Array.isArray(links) &&
    links.length <= MAX_LINKS_PER_TYPE &&
    links.every(l => typeof l === "string" && l.length <= MAX_LINK_LENGTH)
  );
}

function isValidAlarmLinks(alarmLinks) {
  if (alarmLinks === null || alarmLinks === undefined) return true;
  if (typeof alarmLinks !== "object") return false;
  return (
    isValidLinkArray(alarmLinks.youtube) && isValidLinkArray(alarmLinks.spotify)
  );
}

export function isValidPreset(preset) {
  if (!preset || typeof preset !== "object") return false;
  if (typeof preset.id !== "string" || !preset.id) return false;
  if (typeof preset.name !== "string" || preset.name.length > 100)
    return false;
  const isSmallNonNegInt = n => Number.isInteger(n) && n >= 0 && n <= 999;
  return (
    isSmallNonNegInt(preset.workMinutes) &&
    isSmallNonNegInt(preset.workSeconds) &&
    isSmallNonNegInt(preset.breakMinutes) &&
    isSmallNonNegInt(preset.breakSeconds) &&
    isSmallNonNegInt(preset.loops) &&
    isValidAlarmSource(preset.alarmSource) &&
    isValidAlarmLinks(preset.alarmLinks)
  );
}
```

- [ ] **Step 2: Manually verify validation behavior**

```bash
node --input-type=module -e "
import { isValidPreset } from './lib/presetsIpc.js';
const base = { id: 'p1', name: 'Test', workMinutes: 25, workSeconds: 0, breakMinutes: 5, breakSeconds: 0, loops: 4 };
console.log('no alarm fields:', isValidPreset(base)); // true
console.log('null alarmSource:', isValidPreset({ ...base, alarmSource: null })); // true
console.log('valid youtube source:', isValidPreset({ ...base, alarmSource: { type: 'youtube', value: 'https://youtube.com/watch?v=x' } })); // true
console.log('bad type:', isValidPreset({ ...base, alarmSource: { type: 'bogus', value: 'x' } })); // false
console.log('valid links:', isValidPreset({ ...base, alarmLinks: { youtube: ['a','b'], spotify: [] } })); // true
console.log('too many links:', isValidPreset({ ...base, alarmLinks: { youtube: ['1','2','3','4','5','6'], spotify: [] } })); // false
"
```

Expected output:
```
no alarm fields: true
null alarmSource: true
valid youtube source: true
bad type: false
valid links: true
too many links: false
```

- [ ] **Step 3: Commit**

```bash
git add lib/presetsIpc.js
git commit -m "feat: validate alarmSource/alarmLinks fields on presets"
```

---

### Task 3: Saved-link list markup + translations

**Files:**
- Modify: `index.html:141-151` (YouTube section body), `index.html:164-181` (Spotify section body)
- Modify: `js/i18n/translations.js` (both the `en` and `tr` blocks, near the existing `alarm.recent*` keys)

**Interfaces:**
- Produces: DOM elements `#youtubeLinksList` and `#spotifyLinksList` (empty `<ul class="alarm-recent-list">`, styled for free by the existing `.alarm-recent-item`/`.alarm-recent-name`/`.alarm-recent-remove`/`.alarm-recent-tag` CSS in `css/styles.css` — no new CSS needed). Translation keys `alarm.savedLinksLabel` and `alarm.savedLinkRemoveAriaLabel`. Consumed by Task 6's `renderLinkList()`.

- [ ] **Step 1: Add the YouTube saved-links list**

In `index.html`, find:

```html
                        <p class="alarm-url-hint" data-i18n="alarm.youtubeUrlHint">
                            Paste a YouTube video URL. If unavailable, local alarm will be used as fallback.
                        </p>
                    </div>
                </div>

                <!-- Spotify -->
```

Replace with:

```html
                        <p class="alarm-url-hint" data-i18n="alarm.youtubeUrlHint">
                            Paste a YouTube video URL. If unavailable, local alarm will be used as fallback.
                        </p>
                        <p class="alarm-section-label" data-i18n="alarm.savedLinksLabel">Saved</p>
                        <ul class="alarm-recent-list" id="youtubeLinksList"></ul>
                    </div>
                </div>

                <!-- Spotify -->
```

- [ ] **Step 2: Add the Spotify saved-links list**

In `index.html`, find:

```html
                        <p class="alarm-url-hint" data-i18n="alarm.spotifyUrlHint">
                            Connect your account, then paste a Spotify track URL. Plays through the real
                            Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.
                        </p>
                    </div>
                </div>

            </div>
```

Replace with:

```html
                        <p class="alarm-url-hint" data-i18n="alarm.spotifyUrlHint">
                            Connect your account, then paste a Spotify track URL. Plays through the real
                            Spotify app (not an in-app preview). If unavailable, local alarm will be used as fallback.
                        </p>
                        <p class="alarm-section-label" data-i18n="alarm.savedLinksLabel">Saved</p>
                        <ul class="alarm-recent-list" id="spotifyLinksList"></ul>
                    </div>
                </div>

            </div>
```

- [ ] **Step 3: Add translation keys**

In `js/i18n/translations.js`, find (inside the `en` block):

```js
    "alarm.recentRemoveAriaLabel": "Remove from recent",
    "alarm.resetDefault": "Reset to default",
```

Replace with:

```js
    "alarm.recentRemoveAriaLabel": "Remove from recent",
    "alarm.resetDefault": "Reset to default",
    "alarm.savedLinksLabel": "Saved",
    "alarm.savedLinkRemoveAriaLabel": "Remove saved link",
```

Find (inside the `tr` block):

```js
    "alarm.recentRemoveAriaLabel": "Son kullanılanlardan kaldır",
```

Replace with:

```js
    "alarm.recentRemoveAriaLabel": "Son kullanılanlardan kaldır",
    "alarm.savedLinksLabel": "Kaydedilenler",
    "alarm.savedLinkRemoveAriaLabel": "Kaydedilen bağlantıyı kaldır",
```

- [ ] **Step 4: Verify manually**

Run `npm start`, open the Alarm Sound modal, expand the YouTube section and the Spotify section. Confirm:
- A "Saved" label and an empty area appear under each section's URL input (no visible list items yet — that's expected, nothing populates them until Task 6).
- No console errors in DevTools.
- Switch the app language toggle (top bar) and confirm the "Saved" label re-translates to "Kaydedilenler".

- [ ] **Step 5: Commit**

```bash
git add index.html js/i18n/translations.js
git commit -m "feat: add saved-link list markup and translations to Alarm Sound modal"
```

---

### Task 4: Dispatch `preset-activated` on preset switch (`js/intervalTimer.js`)

**Files:**
- Modify: `js/intervalTimer.js:31-43` (the `applyPreset` function)

**Interfaces:**
- Consumes: nothing new (preset object already passed in by existing callers).
- Produces: a `window` `CustomEvent` named `"preset-activated"` with `detail: preset`, fired every time `applyPreset()` runs — which covers both the preset-dropdown "Load" click (via the `onPresetLoad` callback wired through `setupPresets`) and the initial active-preset application on startup. Consumed by Task 5's listener in `js/alarmModal.js`.

- [ ] **Step 1: Dispatch the event from `applyPreset`**

Find in `js/intervalTimer.js`:

```js
  // ── Preset yüklendiğinde input'ları doldur ────────────────
  function applyPreset(preset) {
    const wm = document.getElementById("workMinutes");
    const ws = document.getElementById("workSeconds");
    const bm = document.getElementById("breakMinutes");
    const bs = document.getElementById("breakSeconds");
    const lc = document.getElementById("loopCount");

    if (wm) wm.value = preset.workMinutes;
    if (ws) ws.value = preset.workSeconds;
    if (bm) bm.value = preset.breakMinutes;
    if (bs) bs.value = preset.breakSeconds;
    if (lc) lc.value = preset.loops;
  }
```

Replace with:

```js
  // ── Preset yüklendiğinde input'ları doldur ────────────────
  function applyPreset(preset) {
    const wm = document.getElementById("workMinutes");
    const ws = document.getElementById("workSeconds");
    const bm = document.getElementById("breakMinutes");
    const bs = document.getElementById("breakSeconds");
    const lc = document.getElementById("loopCount");

    if (wm) wm.value = preset.workMinutes;
    if (ws) ws.value = preset.workSeconds;
    if (bm) bm.value = preset.breakMinutes;
    if (bs) bs.value = preset.breakSeconds;
    if (lc) lc.value = preset.loops;

    window.dispatchEvent(new CustomEvent("preset-activated", { detail: preset }));
  }
```

- [ ] **Step 2: Verify manually via DevTools console**

Run `npm start`, open DevTools on the main window, and in the console run:

```js
window.addEventListener("preset-activated", e => console.log("preset-activated:", e.detail.name));
```

Then click a different preset in the preset dropdown. Expected: the console logs `preset-activated: <preset name>` immediately. Reload the app (or restart it) and confirm the same log line appears once on startup too (re-run the `addEventListener` line before reload finishes, or add it via a DevTools snippet that persists across reload).

- [ ] **Step 3: Commit**

```bash
git add js/intervalTimer.js
git commit -m "feat: dispatch preset-activated event when a preset is applied"
```

---

### Task 5: Preset-aware initial alarm load + migration (`js/alarm/AlarmManager.js`, `js/alarmModal.js`)

**Files:**
- Modify: `js/alarm/AlarmManager.js:26-71` (the `initialize` method)
- Modify: `js/alarmModal.js:150-181` (the "Başlangıç yükleme" startup block)

**Interfaces:**
- Consumes: `addLink` from `js/alarm/presetAlarmLinks.js` (Task 1, for migration only), `window.electronAPI.presetsGetActive()` / `presetsSave()` (existing preload API), the `preset-activated` event (Task 4).
- Produces: `AlarmManager.initialize(defaultSource, savedSource = null)` — `savedSource` is now an explicit parameter (a raw path/URL string or `null`), no longer read from `localStorage` internally. In `js/alarmModal.js`: `getActivePreset()`, `saveActivePreset(patch)`, and `loadPresetAlarm(preset)` — all three consumed by Task 6 and Task 7.

- [ ] **Step 1: Change `AlarmManager.initialize` to accept the saved source as a parameter**

In `js/alarm/AlarmManager.js`, find:

```js
  async initialize(defaultSource) {
    this._defaultSource = defaultSource;
    this.setFallbackSource(defaultSource);

    const savedSource = localStorage.getItem("selectedAlarmPath");

    if (!savedSource) {
```

Replace with:

```js
  async initialize(defaultSource, savedSource = null) {
    this._defaultSource = defaultSource;
    this.setFallbackSource(defaultSource);

    if (!savedSource) {
```

(The rest of the method — type detection, local-path-to-URL conversion, Spotify opts, load-with-fallback — is unchanged.)

- [ ] **Step 2: Replace the alarmModal.js startup block**

In `js/alarmModal.js`, find:

```js
  // ── Başlangıç yükleme ─────────────────────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);
  await updateSpotifyAuthUI();

  // Tracks whether the current-file label is showing the translated
  // default (vs. a custom filename/URL) — used by the onLanguageChange
  // handler below to re-render only the default label, not a real
  // custom source name (see design spec's documented scope boundary
  // on why custom-source labels don't re-sync on toggle).
  let usingDefaultAlarm = false;

  const savedSource = localStorage.getItem("selectedAlarmPath");
  if (savedSource) {
    const type = AlarmProviderFactory.detect(savedSource);
    if (type === "local") {
      updateCurrentFile(getFileName(savedSource));
      updateCurrentIcon("local");
    } else {
      const label =
        savedSource.length > 40 ? savedSource.slice(0, 37) + "…" : savedSource;
      updateCurrentFile(label);
      // alarmManager.initialize() may have silently fallen back to local
      // (e.g. no Spotify session) — reflect what actually loaded, not the
      // raw saved string, so the icon/Preview-disable state stays accurate.
      updateCurrentIcon(alarmManager.getProviderType());
    }
  } else {
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
  }
```

Replace with:

```js
  // ── Preset-aware alarm loading ─────────────────────────────
  // Tracks whether the current-file label is showing the translated
  // default (vs. a custom filename/URL) — used by the onLanguageChange
  // handler below to re-render only the default label, not a real
  // custom source name (see design spec's documented scope boundary
  // on why custom-source labels don't re-sync on toggle).
  let usingDefaultAlarm = false;

  async function getActivePreset() {
    return window.electronAPI.presetsGetActive();
  }

  async function saveActivePreset(patch) {
    const active = await getActivePreset();
    if (!active) return null;
    const updated = { ...active, ...patch };
    const result = await window.electronAPI.presetsSave(updated);
    return result?.error ? active : updated;
  }

  // One-time best-effort import of the legacy global alarm source (pre
  // per-preset storage) into the active preset — see design spec's
  // "One-time migration" section. Safe to call every launch: it's a no-op
  // once the active preset already has an alarmSource.
  async function migrateLegacyAlarmSource() {
    const legacy = localStorage.getItem("selectedAlarmPath");
    if (!legacy) return;

    const active = await getActivePreset();
    if (!active || active.alarmSource) return;

    const type = AlarmProviderFactory.detect(legacy);
    const patch = { alarmSource: { type, value: legacy } };

    if (type === "youtube" || type === "spotify") {
      const existing = active.alarmLinks?.[type] ?? [];
      patch.alarmLinks = {
        youtube: active.alarmLinks?.youtube ?? [],
        spotify: active.alarmLinks?.spotify ?? [],
        [type]: addLink(existing, legacy),
      };
    }

    await window.electronAPI.presetsSave({ ...active, ...patch });
  }

  // Loads the given preset's alarmSource (or the local default if it has
  // none) and updates the current-file label/icon to match. Called once at
  // startup and again every time the active preset changes (see the
  // preset-activated listener below).
  async function loadPresetAlarm(preset) {
    const alarmSource = preset?.alarmSource ?? null;
    await alarmManager.initialize(DEFAULT_ALARM, alarmSource?.value ?? null);

    if (alarmSource?.value) {
      usingDefaultAlarm = false;
      if (alarmSource.type === "local") {
        updateCurrentFile(getFileName(alarmSource.value));
        updateCurrentIcon("local");
      } else {
        const label =
          alarmSource.value.length > 40
            ? alarmSource.value.slice(0, 37) + "…"
            : alarmSource.value;
        updateCurrentFile(label);
        // alarmManager.initialize() may have silently fallen back to local
        // (e.g. no Spotify session) — reflect what actually loaded, not the
        // raw saved string, so the icon/Preview-disable state stays accurate.
        updateCurrentIcon(alarmManager.getProviderType());
      }
    } else {
      usingDefaultAlarm = true;
      updateCurrentFile(t("alarm.defaultFile"));
      updateCurrentIcon("local");
    }
  }

  await migrateLegacyAlarmSource();
  await loadPresetAlarm(await getActivePreset());
  await updateSpotifyAuthUI();

  window.addEventListener("preset-activated", async e => {
    await loadPresetAlarm(e.detail);
  });
```

- [ ] **Step 3: Add the `addLink` import**

In `js/alarmModal.js`, find:

```js
import {
  addRecentPath,
  loadRecentPaths,
  removeRecentPath,
  saveRecentPaths,
} from "./alarm/recentAlarms.js";
```

Replace with:

```js
import {
  addRecentPath,
  loadRecentPaths,
  removeRecentPath,
  saveRecentPaths,
} from "./alarm/recentAlarms.js";
import { addLink } from "./alarm/presetAlarmLinks.js";
```

- [ ] **Step 4: Verify manually via CDP or the running app**

Run `npm start`. Then, for each check, confirm via the UI (current-file label/icon in the Alarm Sound modal) or DevTools console:

1. Fresh preset (no `alarmSource`) is active → modal shows the local default alarm.
2. Create two presets (e.g. "A" and "B"). While "A" is active, load a YouTube URL via the modal (existing Load button still works exactly as before this task — it doesn't yet write to the preset; that's Task 6/7). Switch to preset "B" — the alarm should NOT follow (since nothing persists it to the preset yet, this is expected at this point in the plan; full auto-switch behavior isn't testable until Task 7 lands). This step is just confirming no console errors and that `loadPresetAlarm` runs on every preset switch (check via a temporary `console.log` or the Sources panel breakpoint, then remove it).
3. Restart the app entirely and confirm no console errors on load and the modal still opens normally.

- [ ] **Step 5: Commit**

```bash
git add js/alarm/AlarmManager.js js/alarmModal.js
git commit -m "feat: load alarm source from the active preset on startup and preset switch"
```

---

### Task 6: Saved-link list rendering, add, remove, and reactivate (`js/alarmModal.js`)

**Files:**
- Modify: `js/alarmModal.js` (element lookups near the top, plus the `handleUrlLoad` success branch)

**Interfaces:**
- Consumes: `getActivePreset()` / `saveActivePreset()` / `loadPresetAlarm()` (Task 5), `addLink` / `removeLink` from `js/alarm/presetAlarmLinks.js` (Task 1), `#youtubeLinksList` / `#spotifyLinksList` (Task 3).
- Produces: `renderLinkList(type)`, `saveAlarmLink(type, url)`, `removeAlarmLink(type, url)`, `activateAlarmLink(type, url)` — `renderLinkList` also consumed by Task 7.

- [ ] **Step 1: Add the new list element lookups**

Find in `js/alarmModal.js`:

```js
  const spotifyUrlRow = document.getElementById("spotifyUrlRow");
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");
```

Replace with:

```js
  const spotifyUrlRow = document.getElementById("spotifyUrlRow");
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");
  const youtubeLinksList = document.getElementById("youtubeLinksList");
  const spotifyLinksList = document.getElementById("spotifyLinksList");
```

- [ ] **Step 2: Add link-list rendering and CRUD functions**

Find in `js/alarmModal.js` (the end of the block added in Task 5):

```js
  window.addEventListener("preset-activated", async e => {
    await loadPresetAlarm(e.detail);
  });
```

Replace with:

```js
  window.addEventListener("preset-activated", async e => {
    await loadPresetAlarm(e.detail);
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  });

  // ── Kaydedilen bağlantılar (YouTube / Spotify) ────────────
  function linkListEl(type) {
    return type === "youtube" ? youtubeLinksList : spotifyLinksList;
  }

  async function renderLinkList(type) {
    const listEl = linkListEl(type);
    if (!listEl) return;

    const active = await getActivePreset();
    const links = active?.alarmLinks?.[type] ?? [];
    const currentValue = active?.alarmSource?.value ?? null;

    if (links.length === 0) {
      listEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = links
      .map(url => {
        const isActive = url === currentValue;
        const label = url.length > 40 ? url.slice(0, 37) + "…" : url;
        return `<li class="alarm-recent-item${isActive ? " active" : ""}" data-url="${encodeURIComponent(url)}">
          <span class="alarm-recent-name">${escapeHtml(label)}</span>
          ${isActive ? `<span class="alarm-recent-tag">${t("alarm.recentActive")}</span>` : ""}
          <button type="button" class="alarm-recent-remove no-hover-lift" aria-label="${t("alarm.savedLinkRemoveAriaLabel")}">&times;</button>
        </li>`;
      })
      .join("");

    listEl.querySelectorAll(".alarm-recent-item").forEach(item => {
      item.addEventListener("click", async e => {
        if (e.target.closest(".alarm-recent-remove")) return;
        await activateAlarmLink(type, decodeURIComponent(item.dataset.url));
      });
    });

    listEl.querySelectorAll(".alarm-recent-remove").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const li = btn.closest(".alarm-recent-item");
        await removeAlarmLink(type, decodeURIComponent(li.dataset.url));
      });
    });
  }

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

  async function removeAlarmLink(type, url) {
    const active = await getActivePreset();
    if (!active) return;
    const existing = active.alarmLinks?.[type] ?? [];
    const alarmLinks = {
      youtube: active.alarmLinks?.youtube ?? [],
      spotify: active.alarmLinks?.spotify ?? [],
      [type]: removeLink(existing, url),
    };
    await window.electronAPI.presetsSave({ ...active, alarmLinks });
    await renderLinkList(type);
  }

  async function activateAlarmLink(type, url) {
    const input = type === "youtube" ? youtubeUrlInput : spotifyUrlInput;
    const loadBtn = type === "youtube" ? youtubeUrlLoadBtn : spotifyUrlLoadBtn;
    input.value = url;
    await handleUrlLoad({ expectedType: type, input, loadBtn });
  }

  await renderLinkList("youtube");
  await renderLinkList("spotify");
```

- [ ] **Step 3: Add the `removeLink` import**

In `js/alarmModal.js`, find:

```js
import { addLink } from "./alarm/presetAlarmLinks.js";
```

Replace with:

```js
import { addLink, removeLink } from "./alarm/presetAlarmLinks.js";
```

- [ ] **Step 4: Wire `handleUrlLoad`'s success branch to save the link**

Find in `js/alarmModal.js`:

```js
      } else {
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), {
            provider: providerLabel,
          }),
          "success",
        );
        updateCurrentIcon(expectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }
```

Replace with:

```js
      } else {
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), {
            provider: providerLabel,
          }),
          "success",
        );
        updateCurrentIcon(expectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        await saveAlarmLink(expectedType, rawUrl);
      }
```

(This removes the old `localStorage.setItem("selectedAlarmPath", rawUrl)` call for remote sources — the active preset's `alarmSource` is now the single source of truth for YouTube/Spotify. The `localStorage` key is still written for local files elsewhere, since the local-file "Recent" list still reads it — untouched by this plan.)

- [ ] **Step 5: Verify manually**

Run `npm start`, open the Alarm Sound modal:
1. Expand YouTube, paste a valid YouTube URL, click Load. Confirm it loads successfully and a new entry appears in the "Saved" list below, marked active.
2. Load a second, different YouTube URL. Confirm the list now shows two entries, the newest marked active.
3. Click the first (now-inactive) entry in the list. Confirm it reloads (feedback message appears) and becomes the active-marked entry, moved to the top.
4. Click the × remove button on a non-active entry. Confirm it disappears from the list and the currently-loaded alarm is unaffected.
5. Repeat 1–4 for the Spotify section (requires a connected Spotify session — if none is available in this environment, verify at minimum that Load still works as before and no console errors appear; note in the task report if full Spotify verification wasn't possible here).
6. Restart the app and confirm the saved list(s) still show the same entries (persistence through `electron-store`).

- [ ] **Step 6: Commit**

```bash
git add js/alarmModal.js
git commit -m "feat: manage per-preset YouTube/Spotify saved-link lists in Alarm Sound modal"
```

---

### Task 7: Local-file selection and Spotify-disconnect preset sync (`js/alarmModal.js`)

**Files:**
- Modify: `js/alarmModal.js:187-208` (`applyLocalFile`), `js/alarmModal.js:272-281` (`resetToDefault`), the Spotify logout handler (`spotifyLogoutBtn` click listener)

**Interfaces:**
- Consumes: `saveActivePreset()` (Task 5), `renderLinkList()` (Task 6).
- Produces: nothing new consumed elsewhere — this is the final integration task.

- [ ] **Step 1: Make `applyLocalFile` write the active preset's `alarmSource`**

Find in `js/alarmModal.js`:

```js
  async function applyLocalFile(filePath) {
    const result = await window.electronAPI.alarmUseLocalPath(filePath);
    if (result?.error) {
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
      return false;
    }

    const url = toFileUrl(filePath);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", filePath);

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    return true;
  }
```

Replace with:

```js
  async function applyLocalFile(filePath) {
    const result = await window.electronAPI.alarmUseLocalPath(filePath);
    if (result?.error) {
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
      return false;
    }

    const url = toFileUrl(filePath);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", filePath);
    await saveActivePreset({ alarmSource: { type: "local", value: filePath } });

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
    return true;
  }
```

(Switching to a local file means neither saved-link list has an active entry anymore, so both are re-rendered to clear stale "active" highlighting.)

- [ ] **Step 2: Make `resetToDefault` clear the active preset's `alarmSource`**

Find in `js/alarmModal.js`:

```js
  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
  }
```

Replace with:

```js
  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    await saveActivePreset({ alarmSource: null });
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  }
```

- [ ] **Step 3: Make the Spotify-disconnect revert-to-default branch clear `alarmSource` too**

Find in `js/alarmModal.js`:

```js
      if (alarmManager.getProviderType() === "spotify") {
        try {
          await alarmManager.load(DEFAULT_ALARM);
          alarmManager.setFallbackSource(DEFAULT_ALARM);
          localStorage.removeItem("selectedAlarmPath");
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
        } catch (e) {
          log.error(
            "Failed to revert to default alarm after Spotify disconnect:",
            e,
          );
        }
      }

      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateCurrentIcon("local");
      await updateSpotifyAuthUI();
    });
  }
```

Replace with:

```js
      if (alarmManager.getProviderType() === "spotify") {
        try {
          await alarmManager.load(DEFAULT_ALARM);
          alarmManager.setFallbackSource(DEFAULT_ALARM);
          localStorage.removeItem("selectedAlarmPath");
          await saveActivePreset({ alarmSource: null });
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
        } catch (e) {
          log.error(
            "Failed to revert to default alarm after Spotify disconnect:",
            e,
          );
        }
      }

      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateCurrentIcon("local");
      await updateSpotifyAuthUI();
      await renderLinkList("spotify");
    });
  }
```

- [ ] **Step 4: Verify manually — full end-to-end pass**

Run `npm start` and walk through the whole feature:
1. Create preset "Focus" and preset "Break". While "Focus" is active, pick a local audio file via the modal's file picker.
2. Switch to "Break", load a YouTube URL.
3. Switch back to "Focus" — confirm the modal's current-file label/icon reverts to the local file you picked (auto-switch works for local sources too).
4. Switch to "Break" again — confirm the YouTube link reloads and shows as active in its saved list.
5. Click "Reset to default" while "Break" is active — confirm the current-file reverts to the default alarm and the saved YouTube list entry loses its "active" tag (but is NOT removed from the list).
6. If a Spotify session is available: connect, load a Spotify link on some preset, then disconnect — confirm that preset's current-file reverts to default and the Spotify saved-list entry loses its "active" tag.
7. Fully restart the app (quit and relaunch). Confirm whichever preset was last active reloads with its correct alarm source, and both saved-link lists still show their entries.
8. Delete the "Break" preset. Confirm no errors, and switching between remaining presets still works correctly.

- [ ] **Step 5: Commit**

```bash
git add js/alarmModal.js
git commit -m "feat: sync local-file and Spotify-disconnect alarm state to the active preset"
```

---

## Self-Review Notes

- **Spec coverage:** Problem items 1–4 are all covered — per-preset alarm memory (Tasks 5, 7), auto-switch on preset change (Tasks 4, 5), manageable YouTube/Spotify list (Task 6), restart persistence via `electron-store` (Tasks 2, 5, inherent to `presets:save`). Non-goals respected: local files stay on the existing global Recent list (Task 7 only adds `alarmSource` writes, never touches `alarmLinks` for local), no custom labels, no new IPC channels.
- **Placeholder scan:** No TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `alarmSource: {type, value}` and `alarmLinks: {youtube: string[], spotify: string[]}` shapes are identical across Tasks 2, 5, 6, 7. Function names (`getActivePreset`, `saveActivePreset`, `loadPresetAlarm`, `renderLinkList`, `saveAlarmLink`, `removeAlarmLink`, `activateAlarmLink`, `addLink`, `removeLink`) are used consistently with the signatures defined where they're introduced.
