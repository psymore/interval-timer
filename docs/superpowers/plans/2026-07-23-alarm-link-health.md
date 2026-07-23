# Alarm Link Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively surface when a preset's saved YouTube/Spotify alarm link is dead — a badge on the preset picker for the active preset's link, and per-entry "broken" badges inside the Alarm Sound modal's saved-link lists.

**Architecture:** A new pure-network-check module (`js/alarm/linkHealth.js`) is shared by two independent mechanisms: (1) `js/alarmModal.js` checks the active preset's single alarm link whenever it changes and tells `js/presets.js` via a new `preset-alarm-health` custom event (mirroring the existing `preset-activated` event's decoupling), which badges the preset picker; (2) `js/alarmModal.js` checks every saved link in a section when that section is expanded and badges the modal's own list, independently of mechanism 1.

**Tech Stack:** Vanilla JS ES modules, Electron renderer process, YouTube oEmbed API (public, unauthenticated), Spotify Web API `GET /v1/tracks` (uses the existing stored session token, no refresh attempted — see Task 1).

## Global Constraints

- No automated test suite or lint script exists in this repo (per `CLAUDE.md`) — "testing" steps below are manual verification (`npm start` / CDP) or standalone `node` script checks for pure logic, matching this project's established practice.
- ES modules only (`"type": "module"`).
- A health check result of `"unknown"` (no session, network failure, non-2xx response) must never render as "broken" — only a confirmed dead link does. This applies in both mechanisms.
- Mechanism 1 checks only the single currently-active alarm link — never a batch across presets, since only one preset's alarm is ever active on a machine (v1.0.0 scope).
- Mechanism 2 checks every saved link in a section, but only when that section is expanded — never on every modal open.
- No caching of check results — every trigger re-checks fresh.
- Async health-check results must be applied against freshly-read current state, not data captured when the check started — see Task 3 and Task 4's race-safety requirements (this is the same class of bug the prior preset-alarm-links feature's final review caught: `loadPresetAlarm` trusting a stale `event.detail`).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/alarm/linkHealth.js` | Create | Pure network checks: `checkYoutubeLink(url)`, `checkSpotifyLinks(urls)`. No DOM, no app-state access. |
| `js/views/intervalTimerView.js` | Modify | Add a hidden badge `<span>` next to the preset trigger's label. |
| `css/styles.css` | Modify | New `.preset-alarm-health-badge` rule (trigger + preset-item badge) and a small `.preset-item__alarm-badge` wrapper rule. |
| `js/i18n/translations.js` | Modify | New `presets.alarmBrokenBadge` and `alarm.linkBroken` keys (en + tr). |
| `js/presets.js` | Modify | Active-preset badge state, `preset-alarm-health` listener (race-safe), badge wired into `buildPresetItem` and `renderPresets`. |
| `js/alarmModal.js` | Modify | Mechanism 1 (`updateAlarmHealthBadge`, wired into 5 existing alarmSource-change points) and Mechanism 2 (`renderLinkList`'s new `checkHealth` option, wired into accordion-expand). |

---

### Task 1: Link health check module

**Files:**
- Create: `js/alarm/linkHealth.js`

**Interfaces:**
- Produces: `checkYoutubeLink(url: string): Promise<"alive"|"broken"|"unknown">`, `checkSpotifyLinks(urls: string[]): Promise<Map<string, "alive"|"broken"|"unknown">>`. Both consumed by Task 4 (Mechanism 1) and Task 5 (Mechanism 2).

- [ ] **Step 1: Write the module**

```js
// js/alarm/linkHealth.js
// Pure network-calling checks for whether a saved YouTube/Spotify alarm
// link still works. No DOM access, no app state — callers own what to do
// with the result. "unknown" (no session, network failure, non-2xx that
// isn't a definitive not-found) must never be treated as "broken" by
// callers — only a confirmed-dead link is.

function extractYoutubeId(source) {
  if (!source) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;
  try {
    const url = new URL(source);
    const fromV = url.searchParams.get("v");
    if (fromV) return fromV;
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
  } catch {}
  return null;
}

function extractSpotifyTrackId(source) {
  if (!source) return null;
  if (/^[a-zA-Z0-9]{22}$/.test(source)) return source;
  const uriMatch = source.match(/spotify:track:([a-zA-Z0-9]{22})/);
  if (uriMatch) return uriMatch[1];
  try {
    const url = new URL(source);
    const segments = url.pathname.split("/");
    const idx = segments.indexOf("track");
    if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
  } catch {}
  return null;
}

export async function checkYoutubeLink(url) {
  const videoId = extractYoutubeId(url);
  if (!videoId) return "unknown";

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  try {
    const res = await fetch(oembedUrl);
    if (res.status === 404 || res.status === 401) return "broken";
    if (!res.ok) return "unknown";
    return "alive";
  } catch {
    return "unknown";
  }
}

// No token refresh attempted here — if the stored access token happens to
// be expired, the request 401s and every URL resolves to "unknown" rather
// than "broken", which is the correct degrade per this feature's "never
// guess broken from an inconclusive check" rule. AlarmManager's own
// refresh logic (js/alarm/AlarmManager.js) is what keeps actual playback
// working; this is a lightweight, best-effort visibility check only.
export async function checkSpotifyLinks(urls) {
  const results = new Map();
  const ids = urls.map(extractSpotifyTrackId);

  const validIds = ids.filter(Boolean);
  if (validIds.length === 0) {
    urls.forEach(url => results.set(url, "unknown"));
    return results;
  }

  const tokens = await window.electronAPI.spotifyGetTokens();
  if (!tokens?.accessToken) {
    urls.forEach(url => results.set(url, "unknown"));
    return results;
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${validIds.join(",")}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!res.ok) {
      urls.forEach(url => results.set(url, "unknown"));
      return results;
    }
    const data = await res.json();
    const tracksById = new Map();
    validIds.forEach((id, i) => tracksById.set(id, data.tracks?.[i] ?? null));

    urls.forEach((url, i) => {
      const id = ids[i];
      if (!id) {
        results.set(url, "unknown");
        return;
      }
      results.set(url, tracksById.get(id) ? "alive" : "broken");
    });
  } catch {
    urls.forEach(url => results.set(url, "unknown"));
  }

  return results;
}
```

- [ ] **Step 2: Manually verify `checkYoutubeLink` against real endpoints**

```bash
node --input-type=module -e "
import { checkYoutubeLink } from './js/alarm/linkHealth.js';
console.log('known-good video:', await checkYoutubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
console.log('bare 11-char id:', await checkYoutubeLink('dQw4w9WgXcQ'));
console.log('garbage id (should be broken):', await checkYoutubeLink('https://www.youtube.com/watch?v=00000000000'));
console.log('unparseable input:', await checkYoutubeLink('not a url at all'));
"
```

Expected output:
```
known-good video: alive
bare 11-char id: alive
garbage id (should be broken): broken
unparseable input: unknown
```

(This hits the real public oEmbed endpoint — no credentials needed. If the environment has no network access, note that in the report and verify by reading the code's control flow by hand instead.)

- [ ] **Step 3: Manually verify `checkSpotifyLinks`'s no-session degrade path**

```bash
node --input-type=module -e "
global.window = { electronAPI: { spotifyGetTokens: async () => null } };
import { checkSpotifyLinks } from './js/alarm/linkHealth.js';
const result = await checkSpotifyLinks(['https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp']);
console.log('no-session result:', [...result.entries()]);
"
```

Expected output:
```
no-session result: [ [ 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', 'unknown' ] ]
```

This confirms the no-token path never produces `"broken"` — the only path that can produce `"broken"` requires a real Spotify session, which isn't available for automated verification here; trace that branch by hand (the `tracksById.get(id) ? "alive" : "broken"` line) to confirm a `null` array slot correctly maps to `"broken"`.

- [ ] **Step 4: Commit**

```bash
git add js/alarm/linkHealth.js
git commit -m "feat: add YouTube/Spotify link health check module"
```

---

### Task 2: Badge markup, CSS, and translations

**Files:**
- Modify: `js/views/intervalTimerView.js:10` (preset trigger markup)
- Modify: `css/styles.css` (append new rules near the existing `.preset-trigger__label`/`.preset-item__name` rules)
- Modify: `js/i18n/translations.js` (both `en` and `tr` blocks)

**Interfaces:**
- Produces: DOM element `#presetTriggerAlarmBadge` (hidden `<span>`), CSS classes `.preset-alarm-health-badge` and `.preset-item__alarm-badge`, translation keys `presets.alarmBrokenBadge` and `alarm.linkBroken`. Consumed by Task 3 (preset picker) and Task 5 (modal per-entry badges — reuses the existing `.alarm-recent-tag.missing` class with the new `alarm.linkBroken` text, no new CSS needed there).

- [ ] **Step 1: Add the trigger badge span**

In `js/views/intervalTimerView.js`, find:

```js
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
```

Replace with:

```js
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-alarm-health-badge hidden" id="presetTriggerAlarmBadge" data-i18n="presets.alarmBrokenBadge">broken</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
```

- [ ] **Step 2: Add the badge CSS**

In `css/styles.css`, find:

```css
.preset-trigger__chevron {
  font-size: 0.7rem;
  margin-left: var(--sp-2);
  transition: transform var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}
```

Replace with:

```css
.preset-trigger__chevron {
  font-size: 0.7rem;
  margin-left: var(--sp-2);
  transition: transform var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}

/* Shared by the preset trigger's badge and each preset-item row's badge —
   same treatment as .alarm-recent-tag.missing in the Alarm Sound modal. */
.preset-alarm-health-badge {
  font-family: var(--font-ui);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--danger);
  flex-shrink: 0;
  margin-left: var(--sp-1);
}

.preset-alarm-health-badge.hidden {
  display: none;
}
```

Then find:

```css
.preset-item__meta {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-muted);
  display: flex;
  gap: var(--sp-1);
  align-items: center;
}
```

Replace with:

```css
.preset-item__meta {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-muted);
  display: flex;
  gap: var(--sp-1);
  align-items: center;
}

.preset-item__alarm-badge {
  margin-left: 0;
  margin-top: 2px;
}
```

- [ ] **Step 3: Add translation keys**

In `js/i18n/translations.js`, find (inside the `en` block):

```js
    "alarm.savedLinksLabel": "Saved",
    "alarm.savedLinkRemoveAriaLabel": "Remove saved link",
```

Replace with:

```js
    "alarm.savedLinksLabel": "Saved",
    "alarm.savedLinkRemoveAriaLabel": "Remove saved link",
    "alarm.linkBroken": "broken",
```

Find (inside the `en` block, presets section):

```js
    "presets.emptyState": "No presets yet.",
```

Replace with:

```js
    "presets.emptyState": "No presets yet.",
    "presets.alarmBrokenBadge": "broken",
```

Find (inside the `tr` block):

```js
    "alarm.savedLinksLabel": "Kaydedilenler",
    "alarm.savedLinkRemoveAriaLabel": "Kaydedilen bağlantıyı kaldır",
```

Replace with:

```js
    "alarm.savedLinksLabel": "Kaydedilenler",
    "alarm.savedLinkRemoveAriaLabel": "Kaydedilen bağlantıyı kaldır",
    "alarm.linkBroken": "bozuk",
```

Find (inside the `tr` block, presets section):

```js
    "presets.emptyState": "Henüz hazır ayar yok.",
```

Replace with:

```js
    "presets.emptyState": "Henüz hazır ayar yok.",
    "presets.alarmBrokenBadge": "bozuk",
```

- [ ] **Step 4: Verify manually**

Run `npm start`, open the preset dropdown trigger — confirm nothing visibly changed yet (the new badge span exists but stays `hidden` until Task 3 wires it up). Check DevTools console for errors. Toggle the language switch and confirm no i18n errors are logged (the new keys resolve even though nothing displays them yet).

- [ ] **Step 5: Commit**

```bash
git add js/views/intervalTimerView.js css/styles.css js/i18n/translations.js
git commit -m "feat: add alarm-health badge markup, styling, and translations"
```

---

### Task 3: Preset-picker badge display (`js/presets.js`)

**Files:**
- Modify: `js/presets.js` (inside `setupPresets`, `renderPresets`, and `buildPresetItem`)

**Interfaces:**
- Consumes: the `preset-alarm-health` `CustomEvent` (detail: `{ presetId: string, broken: boolean }`), dispatched by Task 4.
- Produces: nothing consumed by later tasks — this is the display side of Mechanism 1.

- [ ] **Step 1: Add badge state and the event listener**

Find in `js/presets.js`:

```js
export async function setupPresets(onPresetLoad) {
  const container = document.getElementById("presetsContainer");
  const addBtn = document.getElementById("addPresetBtn");
  const triggerBtn = document.getElementById("presetTriggerBtn");
  const dropdown = document.getElementById("presetDropdown");

  if (!container || !addBtn || !triggerBtn || !dropdown) return;
```

Replace with:

```js
export async function setupPresets(onPresetLoad) {
  const container = document.getElementById("presetsContainer");
  const addBtn = document.getElementById("addPresetBtn");
  const triggerBtn = document.getElementById("presetTriggerBtn");
  const dropdown = document.getElementById("presetDropdown");
  const triggerAlarmBadge = document.getElementById("presetTriggerAlarmBadge");

  if (!container || !addBtn || !triggerBtn || !dropdown) return;

  // ── Active preset's alarm-link health badge ────────────────
  // Tracks whether the CURRENTLY active preset's alarm link is known
  // broken. Reset to false whenever the active preset itself changes
  // (not on every renderPresets() call — editing/deleting an unrelated
  // preset must not clear a real badge on the still-active one). The
  // actual health check happens in js/alarmModal.js (Mechanism 1); this
  // module only displays whatever result arrives via the event below.
  let activeAlarmBroken = false;
  let lastActiveId = null;

  function applyAlarmBadgeDisplay() {
    if (triggerAlarmBadge) {
      triggerAlarmBadge.classList.toggle("hidden", !activeAlarmBroken);
    }
    const activeRowBadge = container.querySelector(
      ".preset-item--active .preset-item__alarm-badge",
    );
    if (activeRowBadge) {
      activeRowBadge.classList.toggle("hidden", !activeAlarmBroken);
    }
  }

  // Race-safe: a health check is an async network call, so the user can
  // switch presets again before it resolves. Re-derive the currently
  // active preset at the moment the event arrives (never trust a
  // presetId captured earlier) and discard results for a preset that's
  // no longer active.
  window.addEventListener("preset-alarm-health", async e => {
    const current = await window.electronAPI.presetsGetActive();
    if (!current || current.id !== e.detail.presetId) return;
    activeAlarmBroken = e.detail.broken;
    applyAlarmBadgeDisplay();
  });
```

- [ ] **Step 2: Reset the badge state when the active preset changes, and pass it into `buildPresetItem`**

Find in `js/presets.js`:

```js
  // ── Render ────────────────────────────────────────────────
  async function renderPresets() {
    const [presets, active] = await Promise.all([
      window.electronAPI.presetsGetAll(),
      window.electronAPI.presetsGetActive(),
    ]);

    container.innerHTML = "";

    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? t("interval.presetsDefault");
    }
```

Replace with:

```js
  // ── Render ────────────────────────────────────────────────
  async function renderPresets() {
    const [presets, active] = await Promise.all([
      window.electronAPI.presetsGetAll(),
      window.electronAPI.presetsGetActive(),
    ]);

    if ((active?.id ?? null) !== lastActiveId) {
      activeAlarmBroken = false;
      lastActiveId = active?.id ?? null;
    }

    container.innerHTML = "";

    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? t("interval.presetsDefault");
    }
    if (triggerAlarmBadge) {
      triggerAlarmBadge.classList.toggle("hidden", !activeAlarmBroken);
    }
```

- [ ] **Step 3: Pass `activeAlarmBroken` into `buildPresetItem`**

Find in `js/presets.js`:

```js
    presets.forEach(preset => {
      const li = buildPresetItem(
        preset,
        active?.id === preset.id,
        onPresetLoad,
        renderPresets,
        closeDropdown,
      );
      container.appendChild(li);
    });
```

Replace with:

```js
    presets.forEach(preset => {
      const li = buildPresetItem(
        preset,
        active?.id === preset.id,
        onPresetLoad,
        renderPresets,
        closeDropdown,
        active?.id === preset.id && activeAlarmBroken,
      );
      container.appendChild(li);
    });
```

- [ ] **Step 4: Render the badge inside the active preset's row**

Find in `js/presets.js`:

```js
// ── Preset item ───────────────────────────────────────────────
function buildPresetItem(preset, isActive, onLoad, onRefresh, onClose) {
  const isDefault = preset.id.startsWith("default-");

  const li = document.createElement("li");
  li.className = `preset-item${isActive ? " preset-item--active" : ""}`;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", isActive ? "true" : "false");

  const workLabel = formatDuration(preset.workMinutes, preset.workSeconds);
  const breakLabel = formatDuration(preset.breakMinutes, preset.breakSeconds);
  const loopLabel = `${preset.loops} loop${preset.loops !== 1 ? "s" : ""}`;

  li.innerHTML = `
    <button class="preset-item__load no-hover-lift" aria-label="${format(t("presets.loadAriaLabel"), { name: escapeHtml(preset.name) })}">
      <span class="preset-item__name">${escapeHtml(preset.name)}</span>
      <span class="preset-item__meta">
        ⏱ ${workLabel}
        <span aria-hidden="true">·</span>
        ☕ ${breakLabel}
        <span aria-hidden="true">·</span>
        ↻ ${loopLabel}
      </span>
    </button>
```

Replace with:

```js
// ── Preset item ───────────────────────────────────────────────
function buildPresetItem(preset, isActive, onLoad, onRefresh, onClose, alarmBroken = false) {
  const isDefault = preset.id.startsWith("default-");

  const li = document.createElement("li");
  li.className = `preset-item${isActive ? " preset-item--active" : ""}`;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", isActive ? "true" : "false");

  const workLabel = formatDuration(preset.workMinutes, preset.workSeconds);
  const breakLabel = formatDuration(preset.breakMinutes, preset.breakSeconds);
  const loopLabel = `${preset.loops} loop${preset.loops !== 1 ? "s" : ""}`;

  li.innerHTML = `
    <button class="preset-item__load no-hover-lift" aria-label="${format(t("presets.loadAriaLabel"), { name: escapeHtml(preset.name) })}">
      <span class="preset-item__name">${escapeHtml(preset.name)}</span>
      <span class="preset-item__meta">
        ⏱ ${workLabel}
        <span aria-hidden="true">·</span>
        ☕ ${breakLabel}
        <span aria-hidden="true">·</span>
        ↻ ${loopLabel}
      </span>
      <span class="preset-alarm-health-badge preset-item__alarm-badge${alarmBroken ? "" : " hidden"}">${t("presets.alarmBrokenBadge")}</span>
    </button>
```

- [ ] **Step 5: Verify manually**

Run `npm start`. In DevTools console, manually dispatch a fake event to confirm the display logic without needing a real broken link yet:

```js
// Get the active preset's real id first:
const active = await window.electronAPI.presetsGetActive();
window.dispatchEvent(new CustomEvent("preset-alarm-health", { detail: { presetId: active.id, broken: true } }));
```

Confirm: the collapsed trigger shows the "broken" badge next to the preset name, and opening the dropdown shows the same badge on the active row. Dispatch again with `broken: false` and confirm both clear. Switch to a different preset via the dropdown and confirm the badge does NOT carry over (since no `preset-alarm-health` event has fired for the new preset yet, it should show no badge). Edit a non-active preset's name and save — confirm the active preset's badge (if you set one via the console again first) survives the `renderPresets()` refresh triggered by the edit.

- [ ] **Step 6: Commit**

```bash
git add js/presets.js
git commit -m "feat: display active-preset alarm health badge on preset picker"
```

---

### Task 4: Wire Mechanism 1 into alarm source changes (`js/alarmModal.js`)

**Files:**
- Modify: `js/alarmModal.js` (import, new `updateAlarmHealthBadge` function, calls added at 5 existing alarmSource-change points)

**Interfaces:**
- Consumes: `checkYoutubeLink`, `checkSpotifyLinks` from `js/alarm/linkHealth.js` (Task 1).
- Produces: dispatches the `preset-alarm-health` `CustomEvent` consumed by Task 3.

- [ ] **Step 1: Add the import**

Find in `js/alarmModal.js`:

```js
import { addLink, removeLink } from "./alarm/presetAlarmLinks.js";
```

Replace with:

```js
import { addLink, removeLink } from "./alarm/presetAlarmLinks.js";
import { checkYoutubeLink, checkSpotifyLinks } from "./alarm/linkHealth.js";
```

- [ ] **Step 2: Add `updateAlarmHealthBadge` next to `loadPresetAlarm`**

Find in `js/alarmModal.js`:

```js
  await migrateLegacyAlarmSource();
  await loadPresetAlarm(await getActivePreset());
  await updateSpotifyAuthUI();

  window.addEventListener("preset-activated", async () => {
    await loadPresetAlarm(await getActivePreset());
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  });
```

Replace with:

```js
  // Checks the given alarmSource's health (if it's a remote link) and
  // dispatches the result for js/presets.js to badge the preset picker
  // with. Never awaited by callers — this is a background enhancement,
  // not something that should delay the alarm loading/UI it accompanies.
  // A null/local alarmSource clears the badge immediately (no network
  // call needed).
  async function updateAlarmHealthBadge(alarmSource) {
    const active = await getActivePreset();
    if (!active) return;
    const presetId = active.id;

    if (!alarmSource?.type || alarmSource.type === "local") {
      window.dispatchEvent(
        new CustomEvent("preset-alarm-health", {
          detail: { presetId, broken: false },
        }),
      );
      return;
    }

    let status = "unknown";
    if (alarmSource.type === "youtube") {
      status = await checkYoutubeLink(alarmSource.value);
    } else if (alarmSource.type === "spotify") {
      const results = await checkSpotifyLinks([alarmSource.value]);
      status = results.get(alarmSource.value) ?? "unknown";
    }

    window.dispatchEvent(
      new CustomEvent("preset-alarm-health", {
        detail: { presetId, broken: status === "broken" },
      }),
    );
  }

  await migrateLegacyAlarmSource();
  {
    const active = await getActivePreset();
    await loadPresetAlarm(active);
    updateAlarmHealthBadge(active?.alarmSource ?? null);
  }
  await updateSpotifyAuthUI();

  window.addEventListener("preset-activated", async () => {
    const active = await getActivePreset();
    await loadPresetAlarm(active);
    updateAlarmHealthBadge(active?.alarmSource ?? null);
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  });
```

- [ ] **Step 3: Wire into `handleUrlLoad`'s success branch**

Find in `js/alarmModal.js`:

```js
        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        await saveAlarmLink(expectedType, rawUrl);
      }
```

Replace with:

```js
        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        await saveAlarmLink(expectedType, rawUrl);
        updateAlarmHealthBadge({ type: expectedType, value: rawUrl });
      }
```

- [ ] **Step 4: Wire into `applyLocalFile`**

Find in `js/alarmModal.js`:

```js
    localStorage.setItem("selectedAlarmPath", filePath);
    await saveActivePreset({ alarmSource: { type: "local", value: filePath } });
```

Replace with:

```js
    localStorage.setItem("selectedAlarmPath", filePath);
    await saveActivePreset({ alarmSource: { type: "local", value: filePath } });
    updateAlarmHealthBadge({ type: "local", value: filePath });
```

- [ ] **Step 5: Wire into `resetToDefault`**

Find in `js/alarmModal.js`:

```js
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

Replace with:

```js
    localStorage.removeItem("selectedAlarmPath");
    await saveActivePreset({ alarmSource: null });
    updateAlarmHealthBadge(null);
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  }
```

- [ ] **Step 6: Wire into the Spotify-disconnect revert branch**

Find in `js/alarmModal.js`:

```js
          localStorage.removeItem("selectedAlarmPath");
          await saveActivePreset({ alarmSource: null });
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
```

Replace with:

```js
          localStorage.removeItem("selectedAlarmPath");
          await saveActivePreset({ alarmSource: null });
          updateAlarmHealthBadge(null);
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
```

- [ ] **Step 7: Verify manually**

Run `npm start`. With the preset dropdown visible (or its trigger label visible), load a deliberately broken YouTube link (e.g. `https://www.youtube.com/watch?v=00000000000`) on the active preset via the modal — confirm the preset-picker badge appears (both collapsed trigger and, if you open the dropdown, the active row) shortly after (this is async — allow a moment for the oEmbed round-trip). Then load a known-good YouTube link — confirm the badge clears. Pick a local file — confirm the badge clears immediately (no network delay expected, since local skips the check). Restart the app with a preset already active whose saved source is the broken YouTube link — confirm the badge appears shortly after startup without any user interaction.

- [ ] **Step 8: Commit**

```bash
git add js/alarmModal.js
git commit -m "feat: check active preset's alarm link health and badge the preset picker"
```

---

### Task 5: Modal per-entry broken-link badges (`js/alarmModal.js`)

**Files:**
- Modify: `js/alarmModal.js` (`renderLinkList`'s signature, `setupAccordion`)

**Interfaces:**
- Consumes: `checkYoutubeLink`, `checkSpotifyLinks` from `js/alarm/linkHealth.js` (Task 1, already imported in Task 4).
- Produces: nothing consumed by later tasks — this is the final piece of the feature.

- [ ] **Step 1: Add health-checking to `renderLinkList`**

Find in `js/alarmModal.js`:

```js
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
```

Replace with:

```js
  async function renderLinkList(type, { checkHealth = false } = {}) {
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

    if (checkHealth) {
      checkListHealth(type, links).then(brokenUrls => {
        listEl.querySelectorAll(".alarm-recent-item").forEach(li => {
          const url = decodeURIComponent(li.dataset.url);
          if (brokenUrls.has(url) && !li.querySelector(".alarm-recent-tag.missing")) {
            li.insertAdjacentHTML(
              "beforeend",
              `<span class="alarm-recent-tag missing">${t("alarm.linkBroken")}</span>`,
            );
          }
        });
      });
    }
  }

  // Returns a Set of URLs (from `links`) confirmed broken. Never includes
  // a URL whose check came back "unknown" — see linkHealth.js's contract.
  async function checkListHealth(type, links) {
    const broken = new Set();

    if (type === "youtube") {
      const results = await Promise.all(
        links.map(async url => [url, await checkYoutubeLink(url)]),
      );
      results.forEach(([url, status]) => {
        if (status === "broken") broken.add(url);
      });
    } else if (type === "spotify") {
      const results = await checkSpotifyLinks(links);
      results.forEach((status, url) => {
        if (status === "broken") broken.add(url);
      });
    }

    return broken;
  }
```

- [ ] **Step 2: Trigger the check when a YouTube/Spotify section is expanded**

Find in `js/alarmModal.js`:

```js
  // ── Accordion: only one section open at a time ────────────
  function setupAccordion() {
    const toggles = document.querySelectorAll(".alarm-section-toggle");
    toggles.forEach(toggle => {
      toggle.addEventListener("click", () => {
        if (toggle.getAttribute("aria-expanded") === "true") return;

        toggles.forEach(other => {
          other.setAttribute("aria-expanded", "false");
          const body = document.getElementById(
            other.getAttribute("aria-controls"),
          );
          if (body) body.classList.add("hidden");
        });

        toggle.setAttribute("aria-expanded", "true");
        const body = document.getElementById(
          toggle.getAttribute("aria-controls"),
        );
        if (body) body.classList.remove("hidden");
      });
    });
  }
  setupAccordion();
```

Replace with:

```js
  // ── Accordion: only one section open at a time ────────────
  function setupAccordion() {
    const toggles = document.querySelectorAll(".alarm-section-toggle");
    toggles.forEach(toggle => {
      toggle.addEventListener("click", () => {
        if (toggle.getAttribute("aria-expanded") === "true") return;

        toggles.forEach(other => {
          other.setAttribute("aria-expanded", "false");
          const body = document.getElementById(
            other.getAttribute("aria-controls"),
          );
          if (body) body.classList.add("hidden");
        });

        toggle.setAttribute("aria-expanded", "true");
        const body = document.getElementById(
          toggle.getAttribute("aria-controls"),
        );
        if (body) body.classList.remove("hidden");

        const section = toggle.closest(".alarm-section")?.dataset.section;
        if (section === "youtube" || section === "spotify") {
          renderLinkList(section, { checkHealth: true });
        }
      });
    });
  }
  setupAccordion();
```

- [ ] **Step 3: Verify manually**

Run `npm start`. Save two YouTube links to a preset — one known-good, one deliberately broken (e.g. `https://www.youtube.com/watch?v=00000000000`). Collapse and re-expand the YouTube section — confirm the broken one gets a "broken" tag (matching the local-file "missing" tag's visual style) after a short delay, and the good one doesn't. Remove the broken entry — confirm it's removed cleanly (the remove button still works on a badged entry, same as it already does for local "missing" entries). Re-expand the section again — confirm the check re-runs fresh (no stale badge lingering incorrectly). If Spotify isn't connectable in this environment, at minimum confirm expanding that section doesn't throw any console errors (the `checkSpotifyLinks` no-session path should resolve cleanly to no badges).

- [ ] **Step 4: Commit**

```bash
git add js/alarmModal.js
git commit -m "feat: badge broken saved links in the Alarm Sound modal on section expand"
```

---

## Self-Review Notes

- **Spec coverage:** Mechanism 1 (Tasks 2-4: markup, preset-picker display, active-link check wired into all 5 alarmSource-change points) and Mechanism 2 (Task 5: per-entry modal badges on section expand) both fully covered. Shared detection logic (Task 1) has the `"unknown" != "broken"` contract enforced in both consumers. Race safety (spec's explicit callout) is handled in Task 3's `preset-alarm-health` listener via a fresh `presetsGetActive()` re-check.
- **Placeholder scan:** No TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `checkYoutubeLink`/`checkSpotifyLinks` signatures match between Task 1's definition and Tasks 4/5's usage. `preset-alarm-health` event shape (`{ presetId, broken }`) matches between Task 4's dispatch and Task 3's listener. `renderLinkList(type, { checkHealth })`'s new optional second parameter is backward-compatible with every pre-existing call site (all of which call it with just `type`, per Task 5's diff not touching any of those call sites).
- **Scope check:** Single cohesive feature (one shared detector, two display surfaces), comparable in size to the prior preset-alarm-links plan — appropriately scoped for one plan, not split further.
