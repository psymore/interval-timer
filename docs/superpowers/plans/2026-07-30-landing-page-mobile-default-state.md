# Landing Page Mobile Default State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below 820px viewport width, the landing-page demo starts docked (small) instead of expanded, with matching caption copy, and a manually-expanded mobile view gets a viewport-height-relative cap instead of a fixed 1100px.

**Architecture:** One shared `expandedStageHeight()` helper becomes the single source of truth for the expanded target height on both the stage's inline style and `expandRect()`'s own math (mobile-aware; desktop unchanged at the existing constant) — this avoids reintroducing the dual-source-of-truth bug the previous redesign plan fixed. A new `initDefaultDocked()` path handles the mobile cold-start case without loading the iframe at all (it was never needed until the visitor taps Pin). Caption text is two static elements toggled by CSS at the same breakpoint — no JS needed to pick between them.

**Tech Stack:** Plain HTML/CSS/vanilla JS (`docs/index.html`, `docs/assets/mini-demo.js`, `docs/assets/i18n.js`) — no build step, no framework.

## Global Constraints

- No new runtime dependency.
- Do not change the iframe/shim/postMessage contract (`demo-ready`/`demo-seed-timer`/`demo-shrink`).
- Reuse the existing `820px` breakpoint already used for `.hero`'s own responsive CSS — do not introduce a second breakpoint value.
- Desktop (≥820px) behavior must be pixel-identical to before this plan — every change here is additive for the mobile case only.
- No automated test suite exists in this repo — verification is manual, via a locally-served copy of `docs/` and CDP screenshots at both a mobile width (390px) and a desktop width (1440px).

## Local verification setup

```bash
npx --yes serve d:/CodeSpace/interval-timer/docs -l 5540
```

Drive it via a headless Chromium instance with `--remote-debugging-port` and Node's built-in `WebSocket` sending `Runtime.evaluate`/`Page.captureScreenshot` CDP commands (the pattern already used elsewhere in this project), or a real browser. Test at `--window-size=390,844` (mobile) and `--window-size=1440,900` (desktop) — both must be checked for every step below.

---

### Task 1: Mobile default state, capped expand height, and matching caption

**Files:**
- Modify: `docs/assets/mini-demo.js`
- Modify: `docs/index.html`
- Modify: `docs/assets/i18n.js`

**Interfaces:**
- Consumes: existing `dockRect()`, `setStageMode()`, `setPinButtonState()`, `EXPANDED_STAGE_HEIGHT`, `demo`/`stage`/`iframeEl` references from the previous redesign plan — all unchanged in shape.
- Produces: `expandedStageHeight()` — the new single source of truth for the expanded target height, called by both `setStageMode("expanded")` and `expandRect()`. Any future code needing "how tall should the expanded stage be right now" must call this, not read `EXPANDED_STAGE_HEIGHT` directly.

- [ ] **Step 1: Add the mobile breakpoint constant and `expandedStageHeight()` helper**

In `docs/assets/mini-demo.js`, find:

```js
  // Single source of truth for the expanded stage's height — applied as an
  // inline style (see setStageMode below) instead of also living in a CSS
  // ".is-expanded" rule, so the two can't drift out of sync.
  const EXPANDED_STAGE_HEIGHT = 1150;
```

Replace with:

```js
  // Single source of truth for the expanded stage's height — applied as an
  // inline style (see setStageMode below) instead of also living in a CSS
  // ".is-expanded" rule, so the two can't drift out of sync.
  const EXPANDED_STAGE_HEIGHT = 1150;

  // Matches the hero's own `@media (max-width: 820px)` breakpoint in
  // docs/index.html — reused here rather than introducing a second
  // magic number for "is this a narrow viewport."
  const MOBILE_BREAKPOINT = 820;
  const MOBILE_EXPAND_MARGIN = 64;

  // The one place "how tall should the expanded stage be right now"
  // is decided — both setStageMode("expanded") and expandRect() call
  // this instead of each computing their own answer, so they can't
  // drift out of sync the way the old dual-hardcoded-1150 bug did.
  // Desktop always gets the fixed constant; mobile gets a
  // viewport-height-relative cap so a manually-expanded phone visitor
  // doesn't inherit the same fixed-1100px-tall box regardless of how
  // short their screen actually is.
  function expandedStageHeight() {
    if (window.innerWidth >= MOBILE_BREAKPOINT) return EXPANDED_STAGE_HEIGHT;
    return Math.min(EXPANDED_STAGE_HEIGHT, window.innerHeight - MOBILE_EXPAND_MARGIN);
  }
```

- [ ] **Step 2: Route `setStageMode()` and `expandRect()` through the new helper**

Find:

```js
  // mode: "expanded" | "idle". "idle" is the stage's appearance once the
  // demo has docked away from it — a small placeholder, not the old
  // small-widget-centered-in-stage layout (that state no longer exists).
  function setStageMode(mode) {
    stage.classList.toggle("is-idle", mode === "idle");
    stage.style.minHeight = mode === "expanded" ? `${EXPANDED_STAGE_HEIGHT}px` : "";
  }
```

Replace with:

```js
  // mode: "expanded" | "idle". "idle" is the stage's appearance once the
  // demo has docked away from it — a small placeholder, not the old
  // small-widget-centered-in-stage layout (that state no longer exists).
  function setStageMode(mode) {
    stage.classList.toggle("is-idle", mode === "idle");
    stage.style.minHeight = mode === "expanded" ? `${expandedStageHeight()}px` : "";
  }
```

Find:

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

Replace with:

```js
  function expandRect() {
    const stageRect = stage.getBoundingClientRect();
    const targetStageHeight = expandedStageHeight();
    // 800x1100 matches the real app's own default window size (lib/windows.js)
    // on desktop so the expanded view fits the app's tallest tab (Interval
    // Timer) without an internal scrollbar. On mobile, targetStageHeight is
    // already capped to the viewport (see expandedStageHeight()), so this
    // just fits within whatever that cap is instead of always 1100.
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

- [ ] **Step 3: Add the mobile cold-start docked path**

Find:

```js
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
    setPinButtonState(true);
    window.addEventListener("message", onDemoMessage);

    // The stage's min-height transition (340ms) would otherwise animate
    // from its CSS default straight to the expanded height on the very
    // first rendered frame, contributing layout shift before the visitor
    // has seen anything settle. Suppress it for this one, page-load-only
    // jump; later manual expand()/collapse() toggles animate normally.
    stage.style.transition = "none";
    setStageMode("expanded");
    applyRect(expandRect());
    requestAnimationFrame(() => {
      stage.style.transition = "";
    });

    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
    armReadyTimeout();
  }

  initDefaultExpanded();
})();
```

Replace with:

```js
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
    setPinButtonState(true);
    window.addEventListener("message", onDemoMessage);

    // The stage's min-height transition (340ms) would otherwise animate
    // from its CSS default straight to the expanded height on the very
    // first rendered frame, contributing layout shift before the visitor
    // has seen anything settle. Suppress it for this one, page-load-only
    // jump; later manual expand()/collapse() toggles animate normally.
    stage.style.transition = "none";
    setStageMode("expanded");
    applyRect(expandRect());
    requestAnimationFrame(() => {
      stage.style.transition = "";
    });

    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
    armReadyTimeout();
  }

  // Narrow viewports start docked instead: the 800x1100 expand target
  // reads as cramped on a phone-width screen and forces a long scroll
  // before Features. Nothing here loads the iframe — there is no visitor
  // interaction yet, so the same lazy-load-on-demand behavior expand()
  // already provides for a manual Pin tap applies here for free.
  function initDefaultDocked() {
    isExpanded = false;
    setPinButtonState(false);
    demo.classList.add("is-docked");
    setStageMode("idle");
    applyRect(dockRect());
  }

  if (window.innerWidth < MOBILE_BREAKPOINT) {
    initDefaultDocked();
  } else {
    initDefaultExpanded();
  }
})();
```

- [ ] **Step 4: Add the second caption and its breakpoint-driven visibility**

In `docs/index.html`, find:

```html
    <p class="hero-demo-caption" data-i18n="hero.demoCaption">
      This is the real app, running live — hit play to hear the alarm, or pin
      it into a small always-on-top window and drag any edge to resize it,
      just like the desktop app.
    </p>
```

Replace with:

```html
    <p class="hero-demo-caption hero-demo-caption--desktop" data-i18n="hero.demoCaption">
      This is the real app, running live — hit play to hear the alarm, or pin
      it into a small always-on-top window and drag any edge to resize it,
      just like the desktop app.
    </p>
    <p class="hero-demo-caption hero-demo-caption--mobile" data-i18n="hero.demoCaptionMobile">
      This is the real app — tap the pin in the corner to try it live.
    </p>
```

Find:

```css
    .hero-demo-caption {
      color: var(--ink-muted);
      font-size: 0.9rem;
      max-width: 60ch;
      margin: 32px 0 20px;
    }
```

Replace with:

```css
    .hero-demo-caption {
      color: var(--ink-muted);
      font-size: 0.9rem;
      max-width: 60ch;
      margin: 32px 0 20px;
    }

    .hero-demo-caption--mobile {
      display: none;
    }

    @media (max-width: 820px) {
      .hero-demo-caption--desktop {
        display: none;
      }

      .hero-demo-caption--mobile {
        display: block;
      }
    }
```

- [ ] **Step 5: Add the new i18n key**

In `docs/assets/i18n.js`, find (in the `en` block):

```js
    "hero.demoCaption": "This is the real app, running live — hit play to hear the alarm, or pin it into a small always-on-top window and drag any edge to resize it, just like the desktop app.",
```

Replace with:

```js
    "hero.demoCaption": "This is the real app, running live — hit play to hear the alarm, or pin it into a small always-on-top window and drag any edge to resize it, just like the desktop app.",
    "hero.demoCaptionMobile": "This is the real app — tap the pin in the corner to try it live.",
```

Find (in the `tr` block):

```js
    "hero.demoCaption": "Bu, gerçek uygulamanın canlı hâli — alarmı duymak için oynat'a basın, ya da masaüstü uygulamasındaki gibi onu küçük, her zaman üstte kalan bir pencereye sabitleyip herhangi bir kenarından sürükleyerek yeniden boyutlandırın.",
```

Replace with:

```js
    "hero.demoCaption": "Bu, gerçek uygulamanın canlı hâli — alarmı duymak için oynat'a basın, ya da masaüstü uygulamasındaki gibi onu küçük, her zaman üstte kalan bir pencereye sabitleyip herhangi bir kenarından sürükleyerek yeniden boyutlandırın.",
    "hero.demoCaptionMobile": "Bu, gerçek uygulama — canlı denemek için köşedeki pin simgesine dokunun.",
```

- [ ] **Step 6: Manual verification**

At **390×844** (mobile):
1. Load the page fresh — confirm the demo starts **docked** (small widget, bottom-right, `position: fixed`), not the large expanded view.
2. Confirm `.hero-demo-caption--mobile` is visible and `--desktop` is hidden (inspect computed `display`, or just visually confirm the shorter caption text shows).
3. Confirm the stage shows little to no reserved height (not the old 1150px gap) — Features should be reachable after a reasonable, short scroll.
4. Tap Pin — confirm it expands, iframe loads (same `demo-ready` handshake as before), and the resulting box height is capped to roughly `window.innerHeight - 64`, not 1100px regardless of screen height.
5. Tap Pin again — confirm it re-docks correctly, same as desktop's toggle behavior.

At **1440×900** (desktop) — confirm zero regressions from the previous plan:
1. Load the page fresh — confirm the demo still starts **expanded** at the full 800×1100-capped footprint (not docked).
2. Confirm `.hero-demo-caption--desktop` is visible, `--mobile` is hidden.
3. Pin toggles to docked and back, exactly as before this plan.
4. `expandedStageHeight()` returns exactly `1150` (unchanged) at this width — confirm via `window.innerWidth >= 820` in a quick console check if convenient.

- [ ] **Step 7: Commit**

```bash
git add docs/assets/mini-demo.js docs/index.html docs/assets/i18n.js
git commit -m "feat: default to docked on mobile, cap expanded height to the viewport, add matching caption"
```
