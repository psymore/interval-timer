# Landing Page Live Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the GitHub Pages landing page's mini-window playground from a visual showcase into a live demo: the drag cursor mismatch is fixed, pressing the mini box's Pin button expands it into the actual running app (not a recreation), and the Alarm Sound module inside that expanded view is the real, working component.

**Architecture:** The expanded state is a sandboxed `<iframe>` loading the real app's own `index.html` in a `?demo=1` mode. A small conditionally-loaded shim (`js/demo/electron-demo-shim.js`) fakes `window.electronAPI` in-memory so the unmodified app code runs outside Electron. A new script (`scripts/sync-demo-app.mjs`) copies the app's renderer files into `docs/app/` so GitHub Pages (which only serves `docs/`) can reach them. State hands off between the landing page's bespoke mini countdown and the real app's Timer tab via `postMessage`.

**Tech Stack:** Plain HTML/CSS/JS (ES modules, no bundler, no build step for the app itself — `scripts/sync-demo-app.mjs` is a plain Node script using only `node:fs`/`node:path`).

## Global Constraints

- No test suite or lint script is configured in this repo (`npm test` is a stub) — verification is manual, via running the app and the landing page in a browser.
- Never commit during this work — the user is reviewing changes on the `docs/live-app-demo` branch directly; every task's "Commit" step is written for the record but should be **skipped during execution** (leave changes staged/unstaged for the user's own review and commit).
- `js/demo/electron-demo-shim.js` and the `?demo=1` branches added to app source files must be **inert** when `?demo=1` is absent — the packaged Electron app's behavior must not change at all. Every demo-mode branch must be gated by `isDemoMode()` (`js/demo/isDemoMode.js`) or the literal `?demo=1` check.
- `docs/app/` is a **generated mirror** of the app's renderer files, produced by `scripts/sync-demo-app.mjs`. Never hand-edit anything under `docs/app/` — edit the source file (root `index.html`, `js/**`, `css/**`, `assets/**`) and re-run the sync script.
- Approved spec: `docs/superpowers/specs/2026-07-27-landing-page-live-demo-design.md`. If a task here seems to contradict it, the spec wins — stop and flag it rather than guessing.
- `electron-builder`'s `package.json` `build.files` already excludes `docs/**`, so nothing added under `docs/app/` bloats the installer — don't add a new exclusion rule, it's redundant.

---

### Task 1: Remove the mismatched drag cursor (Phase 1)

**Files:**
- Modify: `docs/index.html:443,447`

**Interfaces:** None — pure CSS deletion, no new interfaces.

- [ ] **Step 1: Delete the two cursor rules**

In `docs/index.html`, find this block (around line 434-448):

```css
    .mini-demo {
      position: absolute;
      background: #1a1a1a;
      border: 3px solid #3a3a3a;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      user-select: none;
      box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.6);
      cursor: grab;
    }

    .mini-demo.is-dragging {
      cursor: grabbing;
    }
```

Change it to:

```css
    .mini-demo {
      position: absolute;
      background: #1a1a1a;
      border: 3px solid #3a3a3a;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      user-select: none;
      box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.6);
    }
```

(The `.mini-demo.is-dragging` rule is deleted entirely — `is-dragging` is still added/removed by `docs/assets/mini-demo.js`'s drag handler and still used by nothing else, so removing its only CSS rule is safe. Leave `.mini-demo.is-animating` — the next rule down — untouched.)

- [ ] **Step 2: Manual verification — cursor no longer changes**

Run: open `docs/index.html` directly in a browser (double-click it, or `npx serve docs -l 5500` then visit `http://localhost:5500/`).

Expected: hovering and dragging the mini box (the area between its header and the resize-handle strips) shows the default arrow cursor throughout, never a hand/grab icon. Dragging the box to reposition it still works exactly as before. Hovering each resize handle (edges/corners) still shows the matching directional resize cursor (`ns-resize`, `ew-resize`, `nwse-resize`, `nesw-resize`) — those are untouched.

- [ ] **Step 3: Commit**

```bash
git add docs/index.html
git commit -m "fix: remove mismatched grab cursor from landing-page mini demo"
```

---

### Task 2: Build the Electron API demo shim (Phase 2)

**Files:**
- Create: `js/demo/isDemoMode.js`
- Create: `js/demo/electron-demo-shim.js`
- Modify: `index.html:205-208` (app root, not `docs/index.html`)

**Interfaces:**
- Produces: `isDemoMode()` (named export from `js/demo/isDemoMode.js`) — returns `true` iff the page URL has `?demo=1`. Every other task that adds a demo-mode branch imports this.
- Produces: `window.electronAPI` — an in-memory object matching every `window.electronAPI.*` call site in `js/**`, only ever defined when `?demo=1` is present. Later tasks (5, 6) read from this object; this task must implement its **full** surface up front, not incrementally, since Task 5/6 don't add any more shim methods.

- [ ] **Step 1: Create the shared demo-mode check**

Create `js/demo/isDemoMode.js`:

```js
export function isDemoMode() {
  return new URLSearchParams(location.search).get("demo") === "1";
}
```

- [ ] **Step 2: Create the shim**

Create `js/demo/electron-demo-shim.js` (a classic script, not an ES module — it's loaded via `document.write` before any `type="module"` script runs, so `window.electronAPI` exists by the time module init code touches it):

```js
// Only ever loaded when index.html is opened with ?demo=1 (see the
// conditional loader snippet near the bottom of index.html) — never
// reachable from the packaged Electron app, which has a real preload.cjs
// and never sets that query param. Fakes window.electronAPI in-memory so
// the unmodified app code can run in a plain browser tab / iframe.
(function () {
  const DEFAULT_PRESETS = [
    {
      id: "default-pomodoro",
      name: "Pomodoro",
      workMinutes: 25,
      workSeconds: 0,
      breakMinutes: 5,
      breakSeconds: 0,
      loops: 4,
      isDefault: true,
    },
    {
      id: "default-short",
      name: "Short Focus",
      workMinutes: 15,
      workSeconds: 0,
      breakMinutes: 3,
      breakSeconds: 0,
      loops: 6,
      isDefault: false,
    },
    {
      id: "default-long",
      name: "Deep Work",
      workMinutes: 50,
      workSeconds: 0,
      breakMinutes: 10,
      breakSeconds: 0,
      loops: 2,
      isDefault: false,
    },
  ];

  const MAX_PRESETS = 20;
  let presets = DEFAULT_PRESETS.map(p => ({ ...p }));
  let activePresetId = "default-pomodoro";

  const SPOTIFY_LOGIN_ERROR =
    "Spotify login isn't available in this preview — try it in the desktop app.";

  window.electronAPI = {
    // ── Presets — in-memory, same contract as lib/presetsIpc.js ──
    presetsGetAll: async () => presets.map(p => ({ ...p })),
    presetsGetActive: async () =>
      presets.find(p => p.id === activePresetId) ?? presets[0] ?? null,
    presetsSave: async preset => {
      const index = presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
        presets[index] = preset;
      } else {
        if (presets.length >= MAX_PRESETS) {
          return { error: `Maximum ${MAX_PRESETS} presets allowed.` };
        }
        presets.push(preset);
      }
      return { presets: presets.map(p => ({ ...p })) };
    },
    presetsDelete: async id => {
      presets = presets.filter(p => p.id !== id);
      if (activePresetId === id) activePresetId = presets[0]?.id ?? null;
      return { presets: presets.map(p => ({ ...p })) };
    },
    presetsSetActive: async id => {
      activePresetId = id;
      return { id };
    },

    // ── Timer state broadcast — fires every 200ms tick, must be silent ──
    sendTimerState: () => {},

    // ── Updates — property, not a function (see js/updates.js:53) ──
    isWindowsStoreBuild: false,

    // ── Language — switching still works client-side, just doesn't persist ──
    languageGet: async () => "en",
    languageSet: async () => {},
    onLanguageChanged: () => {},

    // ── Native-window-only chrome — no-ops in a browser tab ──
    setAlwaysOnTop: () => {},
    quitApp: () => {},
    onMiniAction: () => {},
    onMiniReady: () => {},
    onMiniClosed: () => {},

    // ── Local alarm files — browsing UI is hidden in demo mode (Task 6),
    // these stay as safe fallbacks in case anything still reaches them ──
    alarmCheckPathsExist: async paths => paths.map(() => false),
    alarmUseLocalPath: async () => ({
      error: "Not available in this preview.",
    }),
    getFilePath: async () => null,
    getPathForFile: () => null,

    // ── Spotify — logged-out shape. AlarmManager already falls back to
    // the local alarm and shows its existing "Spotify unavailable" message
    // when there's no session, so no further demo-specific handling is
    // needed (see spec Phase 3). ──
    spotifyGetTokens: async () => null,
    spotifyLogin: async () => {
      throw new Error(SPOTIFY_LOGIN_ERROR);
    },
    spotifyRefresh: async () => {
      throw new Error(SPOTIFY_LOGIN_ERROR);
    },
    spotifySaveTokens: async () => {},
    spotifyClearTokens: async () => {},
    spotifyOpenTrack: async () => {},
  };
})();
```

- [ ] **Step 3: Wire the conditional loader into `index.html`**

In the app's root `index.html` (not `docs/index.html`), find (around line 205-208):

```html
    <audio id="alarmSound" src="assets/audio/alarm.mp3" preload="auto"></audio>

    <script type="module" src="js/renderer.js"></script>
    <script type="module" src="js/alarmModal.js"></script>
```

Change to:

```html
    <audio id="alarmSound" src="assets/audio/alarm.mp3" preload="auto"></audio>

    <script>
      if (new URLSearchParams(location.search).get("demo") === "1") {
        document.write('<script src="js/demo/electron-demo-shim.js"><\/script>');
      }
    </script>
    <script type="module" src="js/renderer.js"></script>
    <script type="module" src="js/alarmModal.js"></script>
```

- [ ] **Step 4: Manual verification — the app boots outside Electron**

Run: `npx serve . -l 5500` from the repo root, then open `http://localhost:5500/index.html?demo=1` in a regular Chrome/Edge tab (not Electron).

Expected:
- No errors in the DevTools console.
- The app renders: title, tab buttons, the Interval Timer view by default.
- Clicking the "Timer" tab switches views.
- Opening Settings (gear icon) and Alarm Sound (bell icon) modals both open without console errors.
- Typing into the Interval Timer's work/break fields doesn't throw (this exercises `presetsSave` via the last-session auto-fork in `js/intervalTimer.js`).

- [ ] **Step 5: Manual verification — packaged app is unaffected**

Run: `npm start`

Expected: the real Electron app launches exactly as before — no visible change, no console errors. This confirms the `?demo=1` branch is inert in the real app (which never sets that query param).

- [ ] **Step 6: Commit**

```bash
git add js/demo/isDemoMode.js js/demo/electron-demo-shim.js index.html
git commit -m "feat: add browser-safe electronAPI shim for the landing-page demo"
```

---

### Task 3: Publish the app's renderer files to `docs/app/` (Phase 2)

**Files:**
- Create: `scripts/sync-demo-app.mjs`
- Modify: `package.json` (add a `sync:demo` script)
- Create (generated, committed): `docs/app/**` — produced by running the script, never hand-edited

**Interfaces:**
- Produces: `docs/app/index.html`, `docs/app/js/**`, `docs/app/css/**`, `docs/app/assets/**` — the exact renderer file set Task 4's iframe points at (`app/index.html?demo=1`, relative to `docs/`).

- [ ] **Step 1: Write the sync script**

Create `scripts/sync-demo-app.mjs`:

```js
// Copies the app's renderer files (everything index.html actually loads:
// itself, js/, css/, assets/) into docs/app/, so GitHub Pages — which only
// serves docs/ — can load the real app in an iframe. main.js, preload.cjs,
// and lib/** are Electron-main-only and are deliberately not copied; the
// iframe never needs them. Run this after any change to the copied files,
// before deploying docs/ to Pages. docs/app/ is a generated mirror — never
// hand-edit it, re-run this script instead.
import { cpSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destDir = path.join(repoRoot, "docs", "app");

const ENTRIES = ["index.html", "js", "css", "assets"];

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true, force: true });
}

for (const entry of ENTRIES) {
  cpSync(path.join(repoRoot, entry), path.join(destDir, entry), {
    recursive: true,
  });
}

console.log(`Synced ${ENTRIES.join(", ")} -> docs/app/`);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add `"sync:demo": "node scripts/sync-demo-app.mjs"` to the `scripts` object (alongside `"start"`, `"clean"`, etc.):

```json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "electron .",
    "clean": "rimraf dist",
    "build": "npm run clean && electron-builder",
    "dist": "npm run clean && electron-builder --win --x64",
    "sync:demo": "node scripts/sync-demo-app.mjs"
  },
```

- [ ] **Step 3: Run it and verify the output**

Run: `npm run sync:demo`

Expected: console prints `Synced index.html, js, css, assets -> docs/app/`. `docs/app/index.html`, `docs/app/js/renderer.js`, `docs/app/js/demo/electron-demo-shim.js`, `docs/app/css/styles.css`, `docs/app/assets/audio/alarm.mp3` all exist and are byte-identical to their root-level sources.

- [ ] **Step 4: Manual verification — the copy is servable and works**

Run: `npx serve docs -l 5500`, then open `http://localhost:5500/app/index.html?demo=1`.

Expected: identical behavior to Task 2 Step 4's test (app boots, no console errors, tabs/modals work) — this time served from inside `docs/`, proving the relative asset paths (`css/styles.css`, `js/renderer.js`, `assets/icons/*.png`, `assets/audio/alarm.mp3`) all resolve correctly from their new location.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-demo-app.mjs package.json docs/app
git commit -m "build: add sync script to publish the app's renderer files under docs/app"
```

---

### Task 4: Pin expands the mini box into an iframe (parent side, Phase 2)

**Files:**
- Modify: `docs/index.html` (markup: give the Pin button an id, add the iframe element, add expand/shrink CSS)
- Modify: `docs/assets/mini-demo.js` (expand/collapse logic, postMessage handshake)

**Interfaces:**
- Consumes: `app/index.html?demo=1` (the synced app, from Task 3).
- Produces: outbound `postMessage({type: "demo-seed-timer", remainingSeconds, isRunning}, "*")` to the iframe once it signals readiness — Task 5's `js/timer.js` listens for this.
- Consumes: inbound `postMessage({type: "demo-ready"})` and `postMessage({type: "demo-shrink", remainingSeconds, isRunning})` from the iframe — both sent by Task 5's `js/renderer.js`/`js/timer.js` changes.

This task's own verification simulates the iframe's messages from DevTools (Task 5 doesn't exist yet), so it's independently testable; Task 5 covers the true end-to-end round trip.

- [ ] **Step 1: Give the Pin button an id and add the iframe element**

In `docs/index.html`, find (around line 958-995):

```html
      <div class="mini-demo-stage">
        <div class="mini-demo" id="miniDemo">
          <div class="mini-demo-header">
            <span class="mini-demo-label">INTERVAL</span>
            <div class="mini-demo-actions">
              <button type="button" class="mini-demo-reset-size" id="miniDemoResetBtn" title="Reset size"
                aria-label="Reset window to default size and position">
                <img src="assets/resize-red.png" alt="" class="mini-demo-icon-img" />
              </button>
              <button type="button" class="mini-demo-quit" title="Quit" aria-label="Quit">
                <img src="assets/power.png" alt="" class="mini-demo-icon-img" />
              </button>
              <button type="button" class="mini-demo-pin" title="Pinned on top" aria-label="Pinned on top">
                <img src="assets/pinned.png" alt="" class="mini-demo-icon-img" />
              </button>
            </div>
          </div>
          <div class="mini-demo-body" id="miniDemoBody">
            <div class="mini-demo-countdown" id="miniDemoCountdown">00:10</div>
            <div class="mini-demo-phase">WORK</div>
            <div class="mini-demo-loop">LOOP 1 / 4</div>
            <div class="mini-demo-controls">
              <button type="button" class="mini-demo-btn" id="miniDemoPauseBtn" title="Pause"
                aria-label="Pause">⏸</button>
              <button type="button" class="mini-demo-btn" id="miniDemoPlayBtn" title="Play"
                aria-label="Play">▶</button>
              <button type="button" class="mini-demo-btn" id="miniDemoResetTimerBtn" title="Reset"
                aria-label="Reset">↺</button>
            </div>
          </div>

          <div class="mini-demo-alarm hidden" id="miniDemoAlarm">
            <div class="mini-demo-alarm-icon">🔔</div>
            <div class="mini-demo-alarm-text" data-i18n="miniShowcase.alarmText">Time's up!</div>
          </div>

          <audio id="miniDemoAlarmAudio" src="assets/alarm.mp3" preload="none"></audio>
```

Change the Pin button to add an id, and add the iframe right after the alarm audio element:

```html
      <div class="mini-demo-stage">
        <div class="mini-demo" id="miniDemo">
          <div class="mini-demo-header">
            <span class="mini-demo-label">INTERVAL</span>
            <div class="mini-demo-actions">
              <button type="button" class="mini-demo-reset-size" id="miniDemoResetBtn" title="Reset size"
                aria-label="Reset window to default size and position">
                <img src="assets/resize-red.png" alt="" class="mini-demo-icon-img" />
              </button>
              <button type="button" class="mini-demo-quit" title="Quit" aria-label="Quit">
                <img src="assets/power.png" alt="" class="mini-demo-icon-img" />
              </button>
              <button type="button" class="mini-demo-pin" id="miniDemoPinBtn" title="Pinned on top — expand into the real app" aria-label="Expand into the real app">
                <img src="assets/pinned.png" alt="" class="mini-demo-icon-img" />
              </button>
            </div>
          </div>
          <div class="mini-demo-body" id="miniDemoBody">
            <div class="mini-demo-countdown" id="miniDemoCountdown">00:10</div>
            <div class="mini-demo-phase">WORK</div>
            <div class="mini-demo-loop">LOOP 1 / 4</div>
            <div class="mini-demo-controls">
              <button type="button" class="mini-demo-btn" id="miniDemoPauseBtn" title="Pause"
                aria-label="Pause">⏸</button>
              <button type="button" class="mini-demo-btn" id="miniDemoPlayBtn" title="Play"
                aria-label="Play">▶</button>
              <button type="button" class="mini-demo-btn" id="miniDemoResetTimerBtn" title="Reset"
                aria-label="Reset">↺</button>
            </div>
          </div>

          <div class="mini-demo-alarm hidden" id="miniDemoAlarm">
            <div class="mini-demo-alarm-icon">🔔</div>
            <div class="mini-demo-alarm-text" data-i18n="miniShowcase.alarmText">Time's up!</div>
          </div>

          <audio id="miniDemoAlarmAudio" src="assets/alarm.mp3" preload="none"></audio>

          <iframe class="mini-demo-iframe hidden" id="miniDemoIframe" title="Interval Timer — live app"></iframe>
```

(Leave the 8 `.mini-demo-resize-*` divs after this unchanged.)

- [ ] **Step 2: Add expand/collapse CSS**

In `docs/index.html`'s `<style>` block, find `.mini-demo-stage` (around line 410-420):

```css
    .mini-demo-stage {
      position: relative;
      min-height: 440px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.07), transparent 60%);
      border: 1px dashed var(--border-quiet);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
```

Add a transition and an expanded-state modifier:

```css
    .mini-demo-stage {
      position: relative;
      min-height: 440px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.07), transparent 60%);
      border: 1px dashed var(--border-quiet);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: min-height 340ms ease;
    }

    .mini-demo-stage.is-expanded {
      min-height: 620px;
    }
```

Then, right after the `.mini-demo.is-animating` rule (around line 453-455):

```css
    .mini-demo.is-animating {
      transition: width 320ms ease, height 320ms ease, left 320ms ease, top 320ms ease;
    }
```

Add the iframe's own styling:

```css
    .mini-demo.is-animating {
      transition: width 320ms ease, height 320ms ease, left 320ms ease, top 320ms ease;
    }

    .mini-demo-iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 9px;
      opacity: 0;
      transition: opacity 240ms ease;
    }

    .mini-demo-iframe.is-visible {
      opacity: 1;
    }

    .mini-demo-iframe.hidden {
      display: none;
    }
```

- [ ] **Step 3: Add expand/collapse logic to `mini-demo.js`**

In `docs/assets/mini-demo.js`, find the end of the file — the `window.addEventListener("resize", ...)` block and the closing `})();` (around line 279-297):

```js
  // Keep the demo within the stage if the viewport is resized narrower —
  // doesn't fight a size the visitor deliberately dragged, just clamps
  // position/size so it can't end up hidden or overflowing off the edge.
  window.addEventListener("resize", () => {
    if (isRinging) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = {
      left: demo.offsetLeft,
      top: demo.offsetTop,
      width: demo.offsetWidth,
      height: demo.offsetHeight,
    };
    rect.width = Math.min(rect.width, Math.max(MIN_WIDTH, stageRect.width));
    rect.height = Math.min(rect.height, Math.max(MIN_HEIGHT, stageRect.height));
    rect.left = Math.min(Math.max(0, rect.left), Math.max(0, stageRect.width - rect.width));
    rect.top = Math.min(Math.max(0, rect.top), Math.max(0, stageRect.height - rect.height));
    applyRect(rect);
  });
})();
```

Insert the new expand/collapse block right before the final `})();`:

```js
  // Keep the demo within the stage if the viewport is resized narrower —
  // doesn't fight a size the visitor deliberately dragged, just clamps
  // position/size so it can't end up hidden or overflowing off the edge.
  window.addEventListener("resize", () => {
    if (isRinging) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = {
      left: demo.offsetLeft,
      top: demo.offsetTop,
      width: demo.offsetWidth,
      height: demo.offsetHeight,
    };
    rect.width = Math.min(rect.width, Math.max(MIN_WIDTH, stageRect.width));
    rect.height = Math.min(rect.height, Math.max(MIN_HEIGHT, stageRect.height));
    rect.left = Math.min(Math.max(0, rect.left), Math.max(0, stageRect.width - rect.width));
    rect.top = Math.min(Math.max(0, rect.top), Math.max(0, stageRect.height - rect.height));
    applyRect(rect);
  });

  // ── Pin → expand into the real running app ──────────────────────
  // The expanded view is a sandboxed iframe loading the actual app
  // (docs/app/, synced from the app's own source by
  // scripts/sync-demo-app.mjs) in ?demo=1 mode — not a recreation. State
  // hands off both ways over postMessage: on expand, this box sends its
  // current countdown to the iframe once it signals readiness; on
  // shrink, the iframe sends its current countdown back.
  const pinBtn = document.getElementById("miniDemoPinBtn");
  const iframeEl = document.getElementById("miniDemoIframe");

  function expandRect() {
    const stageRect = stage.getBoundingClientRect();
    const width = Math.min(760, stageRect.width - 32);
    const height = Math.min(560, stageRect.height - 32);
    return {
      left: Math.max(0, (stageRect.width - width) / 2),
      top: Math.max(0, (stageRect.height - height) / 2),
      width,
      height,
    };
  }

  function onDemoMessage(event) {
    if (!iframeEl.contentWindow || event.source !== iframeEl.contentWindow) return;

    if (event.data?.type === "demo-ready") {
      iframeEl.contentWindow.postMessage(
        {
          type: "demo-seed-timer",
          remainingSeconds,
          isRunning: tickHandle !== null,
        },
        "*",
      );
      iframeEl.classList.add("is-visible");
      if (body) body.classList.add("hidden");
      stopTicking();
    } else if (event.data?.type === "demo-shrink") {
      remainingSeconds = Math.max(0, Math.round(event.data.remainingSeconds));
      renderCountdown();
      collapse();
      if (event.data.isRunning) startTicking();
    }
  }

  function expand() {
    if (isRinging) return;
    window.addEventListener("message", onDemoMessage);
    stage.classList.add("is-expanded");
    demo.classList.add("is-animating");
    applyRect(expandRect());
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/index.html?demo=1";
  }

  function collapse() {
    demo.classList.add("is-animating");
    applyRect(centerRect());
    iframeEl.classList.remove("is-visible");
    iframeEl.classList.add("hidden");
    iframeEl.src = "about:blank";
    stage.classList.remove("is-expanded");
    window.removeEventListener("message", onDemoMessage);
    if (body) body.classList.remove("hidden");
  }

  if (pinBtn) {
    pinBtn.addEventListener("click", expand);
  }
})();
```

- [ ] **Step 4: Manual verification — expand animation and iframe load**

At this point Task 3's `docs/app/` already exists and boots correctly (verified in Task 3 Step 4), but Task 5's app-side `demo-ready`/`demo-seed-timer` handshake doesn't exist yet — so this step confirms the animation and iframe wiring work; the actual state hand-off is Task 5's verification.

Run: `npx serve docs -l 5500`, open `http://localhost:5500/`, open DevTools (watch the console).

1. Click the mini box's Play button, let it count down a couple of seconds.
2. Click the Pin button.

Expected: the stage grows (`min-height` transition), the box animates from its current position/size to a larger centered rect, and the iframe fades in showing the real app's own UI (top bar, Interval Timer view) — full-size, not blank, not erroring, since the shim from Task 2 already lets it boot standalone. It won't be seeded to the mini box's countdown yet (Timer tab shows its own default/empty state) — that's expected until Task 5. No errors in the console on either the parent page or (open its DevTools separately, or check the Network tab) the iframe itself.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/assets/mini-demo.js
git commit -m "feat: expand the landing-page mini demo into an iframe on Pin"
```

---

### Task 5: Seed the real app's Timer and wire the shrink control (app side, Phase 2)

**Files:**
- Modify: `js/timer.js` (demo-only seed listener, `getDemoSnapshot` export)
- Modify: `js/renderer.js` (demo-mode detection, message-to-CustomEvent bridge, `alwaysOnTopBtn`/`quitAppBtn` demo gating)
- Modify: `js/updates.js` (demo-mode gate on the update-checker)

**Interfaces:**
- Consumes: `isDemoMode()` from `js/demo/isDemoMode.js` (Task 2).
- Consumes: `postMessage({type: "demo-seed-timer", remainingSeconds, isRunning})` sent by `docs/assets/mini-demo.js` (Task 4).
- Produces: `getDemoSnapshot()` (named export from `js/timer.js`) — returns `{remainingSeconds, isRunning}` for the currently-displayed Timer-tab countdown.
- Produces: outbound `postMessage({type: "demo-ready"}, "*")` and `postMessage({type: "demo-shrink", remainingSeconds, isRunning}, "*")` to `window.parent` — consumed by Task 4's `onDemoMessage`.

After this task, re-run `npm run sync:demo` (Task 3) so `docs/app/` picks up these changes before testing.

- [ ] **Step 1: Add `getDemoSnapshot` and the seed listener to `js/timer.js`**

At the top of `js/timer.js`, add the import:

```js
import { Timer } from "./logic/Timer.js";
import {
  createTimerStateBroadcaster,
  formatDuration,
} from "./timerStateBroadcast.js";
import { isDemoMode } from "./demo/isDemoMode.js";
```

Find `export function getTimerStatus()` (around line 36-38):

```js
export function getTimerStatus() {
  return stateBroadcaster.getStatus();
}
```

Add a new export right after it:

```js
export function getTimerStatus() {
  return stateBroadcaster.getStatus();
}

export function getDemoSnapshot() {
  const remainingMs = timer ? timer.getRemainingTime() : getDurationFromInputs() * 1000;
  return {
    remainingSeconds: Math.round(remainingMs / 1000),
    isRunning: getTimerStatus() === "running",
  };
}
```

Find `export function setupTimer(settings)` (around line 40-47):

```js
export function setupTimer(settings) {
  alarmSettings = settings;
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("pauseBtn").onclick = pauseTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("resetBtn").onclick = resetTimer;
}
```

Add the demo-only seed listener:

```js
export function setupTimer(settings) {
  alarmSettings = settings;
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("pauseBtn").onclick = pauseTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("resetBtn").onclick = resetTimer;

  if (isDemoMode()) {
    window.addEventListener("demo-seed-timer", event => {
      const { remainingSeconds, isRunning } = event.detail;
      document.getElementById("minutes").value = Math.floor(remainingSeconds / 60);
      document.getElementById("seconds").value = remainingSeconds % 60;
      startTimer();
      if (!isRunning) pauseTimer();
    });
  }
}
```

(`getDurationFromInputs` is already defined further down in the same file and already in scope for `getDemoSnapshot` — no new import needed.)

- [ ] **Step 2: Wire the demo-mode message bridge and button gating in `js/renderer.js`**

Change the import of `timer.js` (line 3):

```js
import { setupTimer, getTimerStatus } from "./timer.js";
```

to:

```js
import { setupTimer, getTimerStatus, getDemoSnapshot } from "./timer.js";
```

Add the `isDemoMode` import alongside the others near the top:

```js
import { setupUpdateChecker } from "./updates.js";
import { isDemoMode } from "./demo/isDemoMode.js";
```

Find the "Always on Top toggle" block (around line 117-143):

```js
// ── Always on Top toggle ──────────────────────────────────────
let alwaysOnTop = false;

const aotBtn = document.getElementById("alwaysOnTopBtn");
if (aotBtn) {
  const refreshAotAriaLabel = () => {
    aotBtn.setAttribute(
      "aria-label",
      t(
        alwaysOnTop
          ? "topbar.pinBtn.ariaLabel.unpin"
          : "topbar.pinBtn.ariaLabel.pin",
      ),
    );
  };

  aotBtn.addEventListener("click", () => {
    alwaysOnTop = !alwaysOnTop;
    window.electronAPI.setAlwaysOnTop(alwaysOnTop);
    aotBtn.classList.toggle("active", alwaysOnTop);
    aotBtn.setAttribute("aria-pressed", alwaysOnTop);
    refreshAotAriaLabel();
  });

  refreshAotAriaLabel();
  onLanguageChange(refreshAotAriaLabel);
}
```

Change the click handler to branch on demo mode first — in demo mode this button means "shrink back to the mini view" instead of "open the mini window" (the same real-world meaning: this is the button that hands off to the mini view either way):

```js
// ── Always on Top toggle ──────────────────────────────────────
let alwaysOnTop = false;

const aotBtn = document.getElementById("alwaysOnTopBtn");
if (aotBtn) {
  const refreshAotAriaLabel = () => {
    aotBtn.setAttribute(
      "aria-label",
      t(
        alwaysOnTop
          ? "topbar.pinBtn.ariaLabel.unpin"
          : "topbar.pinBtn.ariaLabel.pin",
      ),
    );
  };

  aotBtn.addEventListener("click", () => {
    if (isDemoMode()) {
      window.parent.postMessage(
        { type: "demo-shrink", ...getDemoSnapshot() },
        "*",
      );
      return;
    }
    alwaysOnTop = !alwaysOnTop;
    window.electronAPI.setAlwaysOnTop(alwaysOnTop);
    aotBtn.classList.toggle("active", alwaysOnTop);
    aotBtn.setAttribute("aria-pressed", alwaysOnTop);
    refreshAotAriaLabel();
  });

  refreshAotAriaLabel();
  onLanguageChange(refreshAotAriaLabel);
}
```

Find the "Quit" block (around line 145-158):

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

Hide the button entirely in demo mode instead of leaving it clickable — quitting a browser tab isn't a meaningful action:

```js
// ── Quit ───────────────────────────────────────────────────────
if (isDemoMode()) {
  document.getElementById("quitAppBtn")?.classList.add("hidden");
} else {
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
}
```

Find the very end of the file (around line 265-268):

```js
// ── Initialize ────────────────────────────────────────────────
setupTabListeners();
switchTab("interval");
```

Add the demo-mode readiness handshake after it:

```js
// ── Initialize ────────────────────────────────────────────────
setupTabListeners();
switchTab("interval");

// ── Demo mode — bridges parent postMessage to a local CustomEvent so
// js/timer.js doesn't need its own "message" listener, and announces
// readiness so the parent (docs/assets/mini-demo.js) knows it's safe to
// send the seed state. ──────────────────────────────────────────
if (isDemoMode()) {
  window.addEventListener("message", event => {
    if (event.data?.type !== "demo-seed-timer") return;
    window.dispatchEvent(
      new CustomEvent("demo-seed-timer", { detail: event.data }),
    );
  });
  window.parent.postMessage({ type: "demo-ready" }, "*");
}
```

- [ ] **Step 3: Gate the update-checker in `js/updates.js`**

Add the import at the top:

```js
import { t, format, onLanguageChange } from "./i18n/i18n.js";
import { isDemoMode } from "./demo/isDemoMode.js";
```

Find (around line 52-57):

```js
export function setupUpdateChecker() {
  if (window.electronAPI.isWindowsStoreBuild) {
    document.querySelector(".update-check-row")?.classList.add("hidden");
    document.getElementById("updateCheckStatus")?.classList.add("hidden");
    return;
  }
```

Change the condition:

```js
export function setupUpdateChecker() {
  if (window.electronAPI.isWindowsStoreBuild || isDemoMode()) {
    document.querySelector(".update-check-row")?.classList.add("hidden");
    document.getElementById("updateCheckStatus")?.classList.add("hidden");
    return;
  }
```

- [ ] **Step 4: Re-sync and manually verify the full round trip**

Run: `npm run sync:demo`, then `npx serve docs -l 5500`, open `http://localhost:5500/`.

1. Click the mini box's Play button, wait ~3 seconds so it's mid-countdown.
2. Click Pin.

Expected: the box expands, the iframe fades in showing the real app's Timer tab, and its countdown continues from within ~1 second of where the mini box's countdown was — no restart to a fresh duration, no visible jump, ticking continues uninterrupted. The quit button is not present in the iframe's top bar. Opening Settings shows no "Check for updates" row.

3. Inside the expanded iframe, click the Pin icon in the top bar (`alwaysOnTopBtn`).

Expected: the box shrinks back to the mini view, and the mini countdown resumes from the same point the expanded timer was at, still running if it was running.

4. Repeat with the mini box **paused** before clicking Pin.

Expected: the expanded Timer tab shows the same remaining time but is not counting down (paused), matching pre-expand state.

- [ ] **Step 5: Commit**

```bash
git add js/timer.js js/renderer.js js/updates.js
git commit -m "feat: seed the real timer from the landing-page demo and wire the shrink control"
```

---

### Task 6: Functional Alarm Sound module (Phase 3)

**Files:**
- Modify: `js/alarmModal.js` (hide local-file section, add demo hint)
- Modify: `docs/assets/i18n.js` (landing-page copy update — both `en` and `tr`)
- Modify: `docs/index.html` (inline fallback copy, matches the i18n update)

**Interfaces:** None new — this task only adds a demo-mode branch to an existing module and updates copy; the shim from Task 2 already covers every `electronAPI` call `js/alarmModal.js` makes.

- [ ] **Step 1: Hide local-file browsing and add the demo hint in `js/alarmModal.js`**

Add the import at the top, alongside the others:

```js
import { t, format, onLanguageChange } from "./i18n/i18n.js";
import { isDemoMode } from "./demo/isDemoMode.js";
```

Find the start of the `DOMContentLoaded` handler (around line 42-43):

```js
// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
```

Add a demo-mode block right at the top of the callback, before the existing element lookups:

```js
// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  if (isDemoMode()) {
    document
      .querySelector('.alarm-section[data-section="local"]')
      ?.classList.add("hidden");

    const alarmTitle = document.getElementById("alarmTitle");
    if (alarmTitle) {
      const hint = document.createElement("p");
      hint.className = "alarm-url-hint";
      hint.textContent = "Demo preview — changes here aren't saved.";
      alarmTitle.insertAdjacentElement("afterend", hint);
    }
  }

  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
```

(`.alarm-url-hint` is an existing class already used for the YouTube/Spotify hint paragraphs in `index.html` — reusing it here needs no new CSS.)

- [ ] **Step 2: Update the landing-page mini-showcase copy**

In `docs/assets/i18n.js`, find the English entry (around line 23):

```js
    "miniShowcase.p": "Drag any edge or corner to resize it — same classic-Windows grip as the real app — or grab it by anywhere else to move it around. Hit play and let it run down to see (and hear) the alarm.",
```

Change to:

```js
    "miniShowcase.p": "Drag any edge or corner to resize it — same classic-Windows grip as the real app — or grab it by anywhere else to move it around. Hit play and let it run down to see (and hear) the alarm, or hit the pin button to expand it into the real, running app.",
```

Find the Turkish entry (around line 55):

```js
    "miniShowcase.p": "Yeniden boyutlandırmak için herhangi bir kenardan ya da köşeden tutun — gerçek uygulamadaki klasik Windows tutamacının aynısı — ya da başka bir yerinden tutup hareket ettirin. Oynat'a basın ve alarmı görün (ve duyun).",
```

Change to:

```js
    "miniShowcase.p": "Yeniden boyutlandırmak için herhangi bir kenardan ya da köşeden tutun — gerçek uygulamadaki klasik Windows tutamacının aynısı — ya da başka bir yerinden tutup hareket ettirin. Oynat'a basın ve alarmı görün (ve duyun), ya da pin düğmesine basarak gerçek, çalışan uygulamaya genişletin.",
```

- [ ] **Step 3: Match the inline fallback copy in `docs/index.html`**

Find (around line 954-956):

```html
      <p class="lede" data-i18n="miniShowcase.p">Drag any edge or corner to resize it — same classic-Windows
        grip as the real app — then hit the size button to snap back to default. The buttons react to
        clicks, but this is a static demo, not a running timer.</p>
```

Change to match the updated English copy (this is only the pre-JS-load fallback — `data-i18n` overwrites it at runtime — but it should stay non-stale):

```html
      <p class="lede" data-i18n="miniShowcase.p">Drag any edge or corner to resize it — same classic-Windows
        grip as the real app — or grab it by anywhere else to move it around. Hit play and let it run down to
        see (and hear) the alarm, or hit the pin button to expand it into the real, running app.</p>
```

- [ ] **Step 4: Re-sync and manually verify the Alarm Sound module end-to-end**

Run: `npm run sync:demo`, then `npx serve docs -l 5500`, open `http://localhost:5500/`, click Play, click Pin to expand, open the Alarm Sound modal (bell icon) inside the expanded view.

Expected:
- "Local file" section is not present; only YouTube and Spotify sections show.
- A "Demo preview — changes here aren't saved." hint appears under the modal title.
- Pasting a real YouTube video URL into the YouTube field and clicking Load successfully loads it (real playback — this is genuinely reusing `YouTubeAlarmProvider.js`, no demo-specific code path).
- Pasting a Spotify track URL into the Spotify field and clicking Load shows the existing "Spotify unavailable, using local alarm" fallback feedback message (the same message a real logged-out user sees) rather than a crash or a stuck "Loading…" state.
- Clicking "Connect Spotify" re-enables itself after failing, without a thrown error in the console.

- [ ] **Step 5: Commit**

```bash
git add js/alarmModal.js docs/assets/i18n.js docs/index.html
git commit -m "feat: finish the landing-page demo's Alarm Sound module"
```
