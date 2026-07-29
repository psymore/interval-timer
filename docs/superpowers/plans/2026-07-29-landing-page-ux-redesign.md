# Landing Page Hero/Playground UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page's live app demo the immediately-visible, default-expanded centerpiece of the hero section, with a bottom-right sticky "pinned" mini state, instead of a below-the-fold, click-to-expand section.

**Architecture:** The demo has exactly two states now: **expanded** (the real app, running in an iframe, laid out as a normal full-width block inside the hero — no custom drag/resize) and **docked** (a small, `position: fixed` widget pinned to the viewport's bottom-right corner, draggable/resizable exactly like today's small widget, just anchored to the viewport instead of a containing stage box). Page load starts expanded; the Pin button toggles between the two; the existing iframe/shim/postMessage contract (`docs/superpowers/specs/2026-07-27-landing-page-live-demo-design.md`) is unchanged. This removes the old third, in-between state ("small widget centered inside a stage box") entirely — there is no longer a scenario where the box roams inside a container, so `centerRect()` is replaced by `dockRect()` (viewport-anchored) and the old dual-source stage-height bug (a CSS rule and a JS constant separately hardcoding `1150`) is avoided by construction: the expanded height is set only as an inline style, from one JS constant.

**Tech Stack:** Plain HTML/CSS/vanilla JS (`docs/index.html`, `docs/assets/mini-demo.js`) — no build step, no framework, matches the rest of `docs/`.

## Global Constraints

- No new runtime dependency (no GSAP, no bundler) — this repo's whole `docs/` site is plain static files, per CLAUDE.md's "no framework, no bundler" stance.
- Do not change the iframe/shim/postMessage contract from the 2026-07-27 live-demo spec (`demo-ready`, `demo-seed-timer`, `demo-shrink`) — only when the expand/collapse states are entered changes, not how they communicate.
- Do not touch `mini.html`/`js/mini.js` (the real app's actual mini window) — only the landing page's bespoke recreation.
- No automated test suite exists in this repo (`npm test` is a stub) — every task's verification step is a manual check against a locally-served copy of `docs/`, using the same CDP-screenshot approach already used elsewhere in this project (see `project_cdp_verification` conventions: launch, screenshot, read the image).
- Every polish-pass change must respect `prefers-reduced-motion` and keep visible keyboard focus — per the installed `frontend-design` skill's Quality Floor.

---

## Local verification setup (used by every task below)

Serve `docs/` over HTTP (the iframe's `postMessage`/relative-path loading needs a real origin, not `file://`):

```bash
npx --yes serve d:/CodeSpace/interval-timer/docs -l 5510
```

Leave it running in the background; open `http://localhost:5510/` in a browser, or drive it headlessly with a Chrome instance launched with `--remote-debugging-port` and `Page.captureScreenshot` over CDP (the pattern already used elsewhere in this project) to actually look at the result before calling a task done.

---

### Task 1: Reverse the default state — expanded on load, docked-to-corner on Pin

**Files:**
- Modify: `docs/index.html` (CSS only — `.mini-demo-stage`, `.mini-demo` rules, roughly lines 410–474 today)
- Modify: `docs/assets/mini-demo.js`

**Interfaces:**
- Consumes: existing DOM ids `miniDemo`, `miniDemoResetBtn`, `miniDemoPinBtn`, `miniDemoIframe`, `miniDemoPauseBtn`/`miniDemoPlayBtn`/`miniDemoResetTimerBtn`, `miniDemoBody`, `miniDemoAlarm` — all unchanged, still resolved via `document.getElementById(...)` inside an IIFE, so this task's markup lives wherever Task 2 later puts it.
- Produces: `demo.classList.contains("is-docked")` — the single source of truth other code (and Task 3's polish pass) can check for "is this the small pinned widget right now." `stage` still resolved as `demo.parentElement`, unchanged.

This task is done and verified entirely in the demo's **current** markup location (inside the existing `#mini-window` section) — Task 2 only moves already-working markup, so keep this fully testable in isolation first.

- [ ] **Step 1: Replace the dual-sourced stage-height constants with one inline-style-driven value**

In `docs/index.html`, find:

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
      min-height: 1150px;
    }
```

Replace with:

```css
    .mini-demo-stage {
      position: relative;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.07), transparent 60%);
      border: 1px dashed var(--border-quiet);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: min-height 340ms ease;
    }

    /* Shown only while the demo is docked (see .is-idle below) — the
       expanded height is set as an inline style by mini-demo.js instead of
       a second hardcoded number here, so there is exactly one place
       (EXPANDED_STAGE_HEIGHT in mini-demo.js) that value is defined. */
    .mini-demo-stage-placeholder {
      display: none;
      text-align: center;
      color: var(--ink-muted);
      font-size: 0.9rem;
      font-family: var(--font-mono);
    }

    .mini-demo-stage.is-idle .mini-demo-stage-placeholder {
      display: block;
    }
```

- [ ] **Step 2: Add the placeholder element markup**

In `docs/index.html`, find the `.mini-demo-stage` opening div (currently `<div class="mini-demo-stage">` immediately followed by `<div class="mini-demo" id="miniDemo">`) and add the placeholder as the first child:

```html
<div class="mini-demo-stage">
  <div class="mini-demo-stage-placeholder" data-i18n="miniShowcase.idle">Pinned to the corner — click the pin icon to bring it back.</div>
  <div class="mini-demo" id="miniDemo">
```

- [ ] **Step 3: Add the docked-widget CSS**

In `docs/index.html`, immediately after the `.mini-demo { ... }` rule block, add:

```css
    .mini-demo.is-docked {
      position: fixed;
      z-index: 60;
    }

    /* Resize/drag handles only make sense on the small docked widget —
       the expanded view is a normal-flow block, not something you drag
       around a stage. */
    .mini-demo:not(.is-docked) .mini-demo-resize {
      display: none;
    }
```

- [ ] **Step 4: Rewrite the sizing/rect helpers in `mini-demo.js`**

Find:

```js
  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 174;
  const DEFAULT_WIDTH = 240;
  const DEFAULT_HEIGHT = 180;
  const START_SECONDS = 10; // short on purpose, but a real 1s = 1s countdown
  const ALARM_DURATION_MS = 3000;

  // Stage min-heights from the CSS above — .mini-demo-stage / .is-expanded.
  // getBoundingClientRect() called synchronously right after a class change
  // that starts a CSS transition returns the PRE-transition value (the
  // transition's progress is 0 at that instant, since no frame has been
  // rendered yet) — not the eventual target. So centerRect()/expandRect()
  // use these known target heights instead of trusting a live measurement
  // of a stage that's mid-transition.
  const STAGE_HEIGHT_EXPANDED = 1150;
  const STAGE_HEIGHT_DEFAULT = 440;

  // NOTE: when collapsing FROM the expanded state, this must be called
  // while the stage still has "is-expanded" on it (i.e. before that class
  // is removed) — that's how it knows to use the known default height
  // instead of the stage's still-620px live measurement.
  function centerRect() {
    const stageRect = stage.getBoundingClientRect();
    const targetStageHeight = stage.classList.contains("is-expanded")
      ? STAGE_HEIGHT_DEFAULT
      : stageRect.height;
    return {
      left: Math.max(0, (stageRect.width - DEFAULT_WIDTH) / 2),
      top: Math.max(0, (targetStageHeight - DEFAULT_HEIGHT) / 2),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  }

  function applyRect(rect) {
    demo.style.left = `${rect.left}px`;
    demo.style.top = `${rect.top}px`;
    demo.style.width = `${rect.width}px`;
    demo.style.height = `${rect.height}px`;
  }

  applyRect(centerRect());
```

Replace with:

```js
  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 174;
  const DEFAULT_WIDTH = 240;
  const DEFAULT_HEIGHT = 180;
  const START_SECONDS = 10; // short on purpose, but a real 1s = 1s countdown
  const ALARM_DURATION_MS = 3000;
  const DOCK_MARGIN = 24;

  // Single source of truth for the expanded stage's height — applied as an
  // inline style (see setStageMode below) instead of also living in a CSS
  // ".is-expanded" rule, so the two can't drift out of sync.
  const EXPANDED_STAGE_HEIGHT = 1150;

  // mode: "expanded" | "idle". "idle" is the stage's appearance once the
  // demo has docked away from it — a small placeholder, not the old
  // small-widget-centered-in-stage layout (that state no longer exists).
  function setStageMode(mode) {
    stage.classList.toggle("is-idle", mode === "idle");
    stage.style.minHeight = mode === "expanded" ? `${EXPANDED_STAGE_HEIGHT}px` : "";
  }

  // Where the docked widget sits: bottom-right of the *viewport*, not
  // centered inside the stage — it's position:fixed once docked, so its
  // bounds are the window, not the stage element.
  function dockRect() {
    return {
      left: Math.max(0, window.innerWidth - DEFAULT_WIDTH - DOCK_MARGIN),
      top: Math.max(0, window.innerHeight - DEFAULT_HEIGHT - DOCK_MARGIN),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  }

  function applyRect(rect) {
    demo.style.left = `${rect.left}px`;
    demo.style.top = `${rect.top}px`;
    demo.style.width = `${rect.width}px`;
    demo.style.height = `${rect.height}px`;
  }
```

(The old unconditional `applyRect(centerRect());` initial call is deleted here — Step 7 below replaces it with the default-expanded init.)

- [ ] **Step 5: Make resize and drag only active while docked, and bound them to the viewport**

Find the resize handler's bounds computation:

```js
      const stageRect = stage.getBoundingClientRect();
      const maxRight = stageRect.width;
      const maxBottom = stageRect.height;
```

(inside the `.mini-demo-resize` `mousedown` listener) and replace with:

```js
      const maxRight = window.innerWidth;
      const maxBottom = window.innerHeight;
```

Add a docked guard as the first line inside that same listener, alongside the existing `isRinging` check:

```js
    zone.addEventListener("mousedown", (event) => {
      if (isRinging || !demo.classList.contains("is-docked")) return;
```

Do the same for the drag-to-move listener — find:

```js
  demo.addEventListener("mousedown", (event) => {
    if (isRinging) return;
    if (event.target.closest("button, .mini-demo-resize")) return;
    event.preventDefault();

    const start = { left: demo.offsetLeft, top: demo.offsetTop };
    const startX = event.clientX;
    const startY = event.clientY;
    const stageRect = stage.getBoundingClientRect();
    const maxLeft = Math.max(0, stageRect.width - demo.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - demo.offsetHeight);
```

Replace with:

```js
  demo.addEventListener("mousedown", (event) => {
    if (isRinging || !demo.classList.contains("is-docked")) return;
    if (event.target.closest("button, .mini-demo-resize")) return;
    event.preventDefault();

    const start = { left: demo.offsetLeft, top: demo.offsetTop };
    const startX = event.clientX;
    const startY = event.clientY;
    const maxLeft = Math.max(0, window.innerWidth - demo.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - demo.offsetHeight);
```

- [ ] **Step 6: Update `resetSizeBtn` and the viewport-resize clamp to use `dockRect()`/viewport bounds**

Find:

```js
  const resetSizeBtn = document.getElementById("miniDemoResetBtn");
  if (resetSizeBtn) {
    resetSizeBtn.addEventListener("click", () => {
      if (isRinging) return;
      applyRect(centerRect());
    });
  }
```

Replace with:

```js
  const resetSizeBtn = document.getElementById("miniDemoResetBtn");
  if (resetSizeBtn) {
    resetSizeBtn.addEventListener("click", () => {
      if (isRinging || !demo.classList.contains("is-docked")) return;
      applyRect(dockRect());
    });
  }
```

Find the `window.addEventListener("resize", ...)` clamp handler near the bottom of the file:

```js
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
```

Replace with:

```js
  window.addEventListener("resize", () => {
    if (isRinging || !demo.classList.contains("is-docked")) return;
    const rect = {
      left: demo.offsetLeft,
      top: demo.offsetTop,
      width: demo.offsetWidth,
      height: demo.offsetHeight,
    };
    rect.width = Math.min(rect.width, Math.max(MIN_WIDTH, window.innerWidth));
    rect.height = Math.min(rect.height, Math.max(MIN_HEIGHT, window.innerHeight));
    rect.left = Math.min(Math.max(0, rect.left), Math.max(0, window.innerWidth - rect.width));
    rect.top = Math.min(Math.max(0, rect.top), Math.max(0, window.innerHeight - rect.height));
    applyRect(rect);
  });
```

(Only the docked widget is ever draggable/resizable now, so a resized viewport only needs to re-clamp it in that state — the expanded view is normal document flow and reflows on its own.)

- [ ] **Step 7: Rewrite `expandRect()`, `expand()`, `collapse()`, and the Pin handler as a real toggle, with a default-expanded init**

Find:

```js
  function expandRect() {
    const stageRect = stage.getBoundingClientRect();
    const targetStageHeight = STAGE_HEIGHT_EXPANDED;
    // 800x1100 matches the real app's own default window size (lib/windows.js)
    // so the expanded view fits the app's tallest tab (Interval Timer) without
    // an internal scrollbar, and reads as "this is the actual app," not an
    // arbitrarily-sized box.
    const width = Math.min(800, stageRect.width - 32);
    const height = Math.min(1100, targetStageHeight - 32);
    return {
      left: Math.max(0, (stageRect.width - width) / 2),
      top: Math.max(0, (targetStageHeight - height) / 2),
      width,
      height,
    };
  }
```

Replace with:

```js
  function expandRect() {
    const stageRect = stage.getBoundingClientRect();
    // 800x1100 matches the real app's own default window size (lib/windows.js)
    // so the expanded view fits the app's tallest tab (Interval Timer) without
    // an internal scrollbar, and reads as "this is the actual app," not an
    // arbitrarily-sized box.
    const width = Math.min(800, stageRect.width - 32);
    const height = Math.min(1100, EXPANDED_STAGE_HEIGHT - 32);
    return {
      left: Math.max(0, (stageRect.width - width) / 2),
      top: Math.max(0, (EXPANDED_STAGE_HEIGHT - height) / 2),
      width,
      height,
    };
  }
```

Find:

```js
  function expand() {
    if (isRinging) return;
    window.addEventListener("message", onDemoMessage);
    stage.classList.add("is-expanded");
    demo.classList.add("is-animating");
    applyRect(expandRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
  }

  function collapse() {
    // centerRect() must run while the stage still has "is-expanded" on it —
    // that's how it knows to center against the known 440px default height
    // instead of the stage's real-but-about-to-change 620px live height.
    demo.classList.add("is-animating");
    applyRect(centerRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
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

Replace with:

```js
  let isExpanded = false; // set true by initDefaultExpanded() below

  function expand() {
    if (isRinging) return;
    isExpanded = true;
    window.addEventListener("message", onDemoMessage);
    setStageMode("expanded");
    demo.classList.remove("is-docked");
    demo.classList.add("is-animating");
    applyRect(expandRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
  }

  function collapse() {
    isExpanded = false;
    demo.classList.add("is-animating");
    demo.classList.add("is-docked");
    applyRect(dockRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("is-visible");
    iframeEl.classList.add("hidden");
    iframeEl.src = "about:blank";
    setStageMode("idle");
    window.removeEventListener("message", onDemoMessage);
    if (body) body.classList.remove("hidden");
  }

  function togglePin() {
    if (isRinging) return;
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  }

  if (pinBtn) {
    pinBtn.addEventListener("click", togglePin);
  }

  // The page loads directly into the expanded (real-app) view. This
  // mirrors expand()'s important side effects but applies the rect
  // immediately instead of animating from a small starting box — there is
  // nothing to animate *from* on first paint. The bespoke widget (already
  // painted synchronously above via the countdown/body markup) stays
  // visible until the iframe's own "demo-ready" message arrives and
  // onDemoMessage swaps it in — same handshake as a manual Pin click, just
  // triggered by page load instead of a click.
  function initDefaultExpanded() {
    isExpanded = true;
    window.addEventListener("message", onDemoMessage);
    setStageMode("expanded");
    applyRect(expandRect());
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
  }

  initDefaultExpanded();
})();
```

- [ ] **Step 8: Manual verification**

1. Start the local server (see "Local verification setup" above) and load the page.
2. Screenshot immediately on load: the demo should already be at the large ~800×1100 footprint, showing the bespoke countdown widget (not blank, not the old small 240×180 box).
3. Wait ~1s, screenshot again: the bespoke widget should have swapped for the real running app (visually identical to today's post-Pin-click expanded view).
4. Click the Pin button (now inside the iframe's own "always-on-top" button, or the original `#miniDemoPinBtn` if still reachable in the old markup): the app should shrink to a small 240×180 widget docked at the bottom-right of the *browser viewport*, not centered in the old stage box.
5. Scroll the page down: the docked widget should stay fixed in the bottom-right corner (this is the actual point of the change — verify it, don't skip it).
6. Drag the docked widget by its header, resize it from a corner handle: both should work, clamped to the viewport, exactly like the old small-widget behavior did against the stage.
7. Click Pin again (or the widget's own pin control): it should re-expand smoothly back to the large view, timer state preserved (same `demo-shrink`/`demo-seed-timer` handoff as before — verify the countdown value didn't reset).
8. Resize the browser window while docked: widget should re-clamp within the new viewport bounds, same as it used to re-clamp within the stage.

- [ ] **Step 9: Commit**

```bash
git add docs/index.html docs/assets/mini-demo.js
git commit -m "feat: default the landing-page demo to expanded, dock the collapsed state to the viewport corner"
```

---

### Task 2: Merge hero and playground, remove the old section

**Files:**
- Modify: `docs/index.html` (markup restructure + hero CSS)

**Interfaces:**
- Consumes: the now-working expand/dock behavior from Task 1 — this task only relocates the already-functional `#miniDemo`/`.mini-demo-stage` subtree and its sibling elements (`miniDemoResetBtn`, `miniDemoPinBtn`, etc. keep their ids, so `mini-demo.js`'s `getElementById` calls need no changes).
- Produces: a single merged `<header class="wrap hero">` containing both the copy and the stage; the standalone `<section class="mini-showcase" id="mini-window">` no longer exists.

- [ ] **Step 1: Remove the old two-column hero CSS and the `.hero-shot` rules**

Find:

```css
    /* ---- hero ---- */
    .hero {
      padding-top: 72px;
      padding-bottom: 88px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 56px;
      align-items: center;
    }
```

Replace with:

```css
    /* ---- hero ---- */
    .hero {
      padding-top: 72px;
      padding-bottom: 88px;
    }

    .hero-demo-caption {
      color: var(--ink-muted);
      font-size: 0.9rem;
      max-width: 60ch;
      margin: 32px 0 20px;
    }
```

Find and delete entirely:

```css
    .hero-shot {
      position: relative;
    }

    .hero-shot img {
      width: 100%;
      display: block;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-quiet);
      box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.6);
    }
```

Find:

```css
    @media (max-width: 820px) {
      .hero {
        grid-template-columns: 1fr;
        padding-top: 44px;
        padding-bottom: 56px;
      }

      .hero-shot {
        order: -1;
        max-width: 340px;
        margin: 0 auto;
      }
    }
```

Replace with:

```css
    @media (max-width: 820px) {
      .hero {
        padding-top: 44px;
        padding-bottom: 56px;
      }
    }
```

- [ ] **Step 2: Delete the old `.mini-showcase`-scoped CSS (the stage/box rules it doesn't own are untouched — they're separate top-level selectors)**

Find and delete this whole block:

```css
    /* ---- mini window showcase ---- */
    section.mini-showcase {
      padding: 20px 0 84px;
      border-top: 1px solid var(--border-quiet);
    }

    .mini-showcase .eyebrow {
      margin-bottom: 10px;
    }

    .mini-showcase h2 {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      margin: 60px 0 12px;
      max-width: 40ch;
      text-wrap: balance;
    }

    .mini-showcase .lede {
      color: var(--ink-muted);
      font-size: 0.95rem;
      max-width: 52ch;
      margin: 0 0 40px;
    }
```

(`.mini-demo-stage`, `.mini-demo`, and every other rule from Task 1 stay — they were never nested under `.mini-showcase`.)

- [ ] **Step 3: Replace the hero markup and delete the standalone mini-showcase section**

Find the current hero:

```html
  <header class="wrap hero">
    <div>
      <div class="eyebrow" data-i18n="hero.eyebrow">Free · Windows · No account needed</div>
      <h1 data-i18n-html="hero.h1">Work. Break. Repeat.<br />Wake up to <em>your</em> music, not a beep.</h1>
      <p class="lede" data-i18n="hero.lede">
        An interval &amp; countdown timer whose alarm can be a local file, a YouTube
        video, or a real Spotify track — plus a background-safe tick loop that
        keeps counting even while the window is minimized.
      </p>

      <div class="cta-row">
        <a class="btn-download" href="https://github.com/psymore/interval-timer/releases/latest"
          data-i18n="hero.download">
          ⬇ Download for Windows
        </a>
        <a class="btn-secondary" href="https://github.com/psymore/interval-timer/releases" data-i18n="hero.releases">
          See all releases
        </a>
      </div>

      <div class="download-stat">
        <img
          src="https://img.shields.io/github/downloads/psymore/interval-timer/total?style=flat-square&label=downloads&color=ff7a1a&labelColor=1f1e23"
          alt="download count" />
        <span class="hero-meta" data-i18n="hero.stat">free · open source · unsigned installer (SmartScreen may warn
          once)</span>
      </div>
    </div>

    <div class="hero-shot">
      <img src="assets/screenshot.png" data-i18n-alt="hero.shot.alt"
        alt="Interval Timer app showing an 18:42 countdown mid-work session" />
    </div>
  </header>
```

Replace with:

```html
  <header class="wrap hero">
    <div class="eyebrow" data-i18n="hero.eyebrow">Free · Windows · No account needed</div>
    <h1 data-i18n-html="hero.h1">Work. Break. Repeat.<br />Wake up to <em>your</em> music, not a beep.</h1>
    <p class="lede" data-i18n="hero.lede">
      An interval &amp; countdown timer whose alarm can be a local file, a YouTube
      video, or a real Spotify track — plus a background-safe tick loop that
      keeps counting even while the window is minimized.
    </p>

    <div class="cta-row">
      <a class="btn-download" href="https://github.com/psymore/interval-timer/releases/latest"
        data-i18n="hero.download">
        ⬇ Download for Windows
      </a>
      <a class="btn-secondary" href="https://github.com/psymore/interval-timer/releases" data-i18n="hero.releases">
        See all releases
      </a>
    </div>

    <div class="download-stat">
      <img
        src="https://img.shields.io/github/downloads/psymore/interval-timer/total?style=flat-square&label=downloads&color=ff7a1a&labelColor=1f1e23"
        alt="download count" />
      <span class="hero-meta" data-i18n="hero.stat">free · open source · unsigned installer (SmartScreen may warn
        once)</span>
    </div>

    <p class="hero-demo-caption" data-i18n="hero.demoCaption">
      This is the real app, running live — hit play to hear the alarm, or pin
      it into a small always-on-top window and drag any edge to resize it,
      just like the desktop app.
    </p>

    <div class="mini-demo-stage">
      <div class="mini-demo-stage-placeholder" data-i18n="miniShowcase.idle">Pinned to the corner — click the pin
        icon to bring it back.</div>
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
            <button type="button" class="mini-demo-pin" id="miniDemoPinBtn"
              title="Pinned on top — expand into the real app" aria-label="Expand into the real app">
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

        <div class="mini-demo-resize mini-demo-resize-n" data-dir="n"></div>
        <div class="mini-demo-resize mini-demo-resize-s" data-dir="s"></div>
        <div class="mini-demo-resize mini-demo-resize-e" data-dir="e"></div>
        <div class="mini-demo-resize mini-demo-resize-w" data-dir="w"></div>
        <div class="mini-demo-resize mini-demo-resize-nw mini-demo-grip" data-dir="nw"></div>
        <div class="mini-demo-resize mini-demo-resize-ne mini-demo-grip" data-dir="ne"></div>
        <div class="mini-demo-resize mini-demo-resize-sw mini-demo-grip" data-dir="sw"></div>
        <div class="mini-demo-resize mini-demo-resize-se mini-demo-grip" data-dir="se"></div>
      </div>
      <span class="mini-demo-hint" data-i18n="miniShowcase.hint">↔ drag an edge or corner to resize</span>
    </div>
  </header>
```

Then find and delete the now-standalone section entirely:

```html
  <section class="mini-showcase" id="mini-window">
    <div class="wrap">
      <div class="eyebrow" data-i18n="miniShowcase.eyebrow">Try it right here</div>
      <h2 data-i18n="miniShowcase.h2">An always-on-top mini window</h2>
      <p class="lede" data-i18n="miniShowcase.p">Drag any edge or corner to resize it — same classic-Windows
        grip as the real app — or grab it by anywhere else to move it around. Hit play and let it run down to
        see (and hear) the alarm, or hit the pin button to expand it into the real, running app.</p>

      <div class="mini-demo-stage">
        ... (this entire subtree — now living in the hero above instead)
      </div>
    </div>
  </section>
```

- [ ] **Step 4: Remove the now-unused screenshot reference and dead nav anchor**

`docs/index.html`'s nav has no link to `#mini-window` today (only `#features`, `#feedback`, and the GitHub source link), so no nav change is needed. Leave `docs/assets/screenshot.png` on disk (still used by `og:image` in `<head>` and by `README.md`) — do not delete the file, only its use inside the old `.hero-shot` markup.

- [ ] **Step 5: Manual verification**

1. Reload the served page. Confirm, without scrolling, the expanded live demo is visible on a common desktop viewport (1440×900 and 1280×800 — check both).
2. Confirm Features section immediately follows the hero (no leftover gap from the removed section).
3. Confirm mobile width (375px, 768px) still lays out sensibly: hero text stacks above the demo, no horizontal scroll, `.hero-demo-caption` wraps normally.
4. Repeat all of Task 1's Step 8 checks (expand/dock/drag/resize/scroll-persistence) now that the markup lives inside `<header class="wrap hero">` — confirm nothing broke from the move.
5. Confirm `og:image`/`README.md` still reference `assets/screenshot.png` and that file still exists (only its landing-page usage was removed).

- [ ] **Step 6: Commit**

```bash
git add docs/index.html
git commit -m "feat: merge hero and playground into one section, remove the separate mini-window section"
```

---

### Task 3: Bounded polish pass

**Files:**
- Modify: `docs/index.html` (CSS additions only)

**Interfaces:**
- Consumes: the `.is-docked`/`.is-idle`/`.is-animating` classes from Task 1, the merged hero from Task 2.
- Produces: no new interfaces — this task only adds accessibility/motion CSS, it doesn't change behavior.

Scope is intentionally bounded to what's listed below (per the design spec's Section 5) — not open-ended.

- [ ] **Step 1: Apply a consistent easing curve, per the installed `motion-design` skill**

The skill's Motion Personality table recommends **Corporate** (clean,
professional, dashboard-like — matches a focus-timer utility, not a
playful/bouncy app): 200–400ms duration, `cubic-bezier(0.2, 0, 0, 1)`
easing, 0–3% overshoot. The three existing transitions on this component
already fall inside that duration range (320ms, 340ms, 240ms) — only the
easing function needs to change, from generic `ease` to the archetype's
signature curve, so all three read as one consistent motion identity
instead of three unrelated `ease` calls.

Find:

```css
    .mini-demo.is-animating {
      transition: width 320ms ease, height 320ms ease, left 320ms ease, top 320ms ease;
    }
```

Replace with:

```css
    .mini-demo.is-animating {
      transition: width 320ms cubic-bezier(0.2, 0, 0, 1), height 320ms cubic-bezier(0.2, 0, 0, 1),
        left 320ms cubic-bezier(0.2, 0, 0, 1), top 320ms cubic-bezier(0.2, 0, 0, 1);
    }
```

Find:

```css
    .mini-demo-stage {
      position: relative;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.07), transparent 60%);
      border: 1px dashed var(--border-quiet);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: min-height 340ms ease;
    }
```

Replace with:

```css
    .mini-demo-stage {
      position: relative;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.07), transparent 60%);
      border: 1px dashed var(--border-quiet);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: min-height 340ms cubic-bezier(0.2, 0, 0, 1);
    }
```

Find:

```css
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
```

Replace with:

```css
    .mini-demo-iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 9px;
      opacity: 0;
      transition: opacity 240ms cubic-bezier(0.2, 0, 0, 1);
    }
```

- [ ] **Step 2: Respect `prefers-reduced-motion` for the expand/dock/drag transitions**

Add, after the existing `.mini-demo.is-animating` rule:

```css
    @media (prefers-reduced-motion: reduce) {
      .mini-demo.is-animating,
      .mini-demo-stage {
        transition: none !important;
      }
    }
```

- [ ] **Step 3: Visible keyboard focus on the Pin/reset/quit controls and resize handles**

Add:

```css
    .mini-demo-pin:focus-visible,
    .mini-demo-reset-size:focus-visible,
    .mini-demo-quit:focus-visible,
    .mini-demo-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .mini-demo-resize:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
```

(The resize handle `div`s aren't natively focusable and are marked `aria-hidden` already per CLAUDE.md's mini-resize-handles note — this rule is a no-op safety net if that ever changes, not a behavior change here.)

- [ ] **Step 4: z-index scale check**

Confirm `.mini-demo.is-docked`'s `z-index: 60` (from Task 1) doesn't collide with anything else in `docs/index.html`. Search for other `z-index` declarations:

```bash
grep -n "z-index" d:/CodeSpace/interval-timer/docs/index.html
```

If any other rule uses a value at or above 60, raise the docked widget's value so it stays on top (it's meant to float above all page content while scrolling) — otherwise no change needed.

- [ ] **Step 5: Manual verification**

1. In browser devtools, enable "Emulate CSS prefers-reduced-motion: reduce" and confirm the expand/dock transition becomes an instant cut, not an eased animation.
2. Tab through the docked widget's controls with the keyboard only; confirm a visible focus ring appears on each.
3. Confirm the docked widget still renders above the Features section and giscus comment widget when scrolled to the bottom of the page (z-index check).
4. Confirm the expand/dock/iframe-fade transitions still look smooth with the new `cubic-bezier(0.2, 0, 0, 1)` easing (Step 1) — no visual regression from the old generic `ease`.

- [ ] **Step 6: Commit**

```bash
git add docs/index.html
git commit -m "style: reduced-motion and focus-visible polish for the landing-page demo"
```
