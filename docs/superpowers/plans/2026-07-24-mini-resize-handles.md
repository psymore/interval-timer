# Mini Window Resize Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mini window's `resizable: true` (already set in `lib/windows.js`) actually resizable by the user, and add two subtle visual grip glyphs so it's discoverable.

**Architecture:** `mini.html`'s `<html>` element is one big `-webkit-app-region: drag` zone, which swallows the OS's native edge/corner resize hit-testing. Add 8 fixed-position `div`s at the true window edges/corners, each opted back out of the drag region (`-webkit-app-region: no-drag`) with the matching OS resize cursor. Two of the eight (top-left, bottom-left) additionally render a small CSS-only glyph (dot grid / diagonal lines) via `::after`, inset from the literal corner so it doesn't poke past `.mini-container`'s rounded border.

**Tech Stack:** Plain HTML/CSS (Electron renderer, no build step, no JS needed for this feature).

## Global Constraints

- No test suite or lint script is configured in this repo (`npm test` is a stub) — verification is manual, via running the app.
- `mini.html`/`css/mini.css` load only `css/tokens.css` for shared custom properties (`--ink-muted`, etc.) — no `styles.css` tokens are available here.
- Don't touch `lib/windows.js` — `resizable: true` and the `minWidth: 240` / `minHeight: 174` floor are already correct.
- Icons only at `nw` (dot grid) and `sw` (diagonal lines) — the other 6 resize zones stay invisible/functional-only, per approved spec `docs/superpowers/specs/2026-07-24-mini-resize-handles-design.md`.

---

### Task 1: Add resize hit-zones and grip glyphs

**Files:**
- Modify: `mini.html:47-49` (between `.mini-container`'s closing `</div>` and the `<script>` tag)
- Modify: `css/mini.css` (append new section at end of file, after the `@media (prefers-reduced-motion: reduce)` block)

**Interfaces:**
- Produces: 8 new `div.mini-resize` elements in `mini.html`, each with a directional modifier class (`.mini-resize-n`, `.mini-resize-s`, `.mini-resize-e`, `.mini-resize-w`, `.mini-resize-nw`, `.mini-resize-ne`, `.mini-resize-sw`, `.mini-resize-se`). `.mini-resize-nw` also carries `.mini-resize-grip-dots`; `.mini-resize-sw` also carries `.mini-resize-grip-diagonal`. No JS reads or references these elements — purely CSS/OS-driven.

- [ ] **Step 1: Add the 8 resize-zone divs to `mini.html`**

Edit `mini.html` so the body reads (insert the new block right after `.mini-container`'s closing `</div>` on line 48, before the `<script>` tag on line 49):

```html
    </div>

    <div class="mini-resize mini-resize-n"></div>
    <div class="mini-resize mini-resize-s"></div>
    <div class="mini-resize mini-resize-e"></div>
    <div class="mini-resize mini-resize-w"></div>
    <div class="mini-resize mini-resize-nw mini-resize-grip-dots"></div>
    <div class="mini-resize mini-resize-ne"></div>
    <div class="mini-resize mini-resize-sw mini-resize-grip-diagonal"></div>
    <div class="mini-resize mini-resize-se"></div>

    <script type="module" src="js/mini.js"></script>
```

(The first `</div>` above is the existing closing tag of `.mini-container` — don't duplicate it, just add the 8 new lines after it.)

- [ ] **Step 2: Append resize-zone CSS to `css/mini.css`**

Add this new section at the end of `css/mini.css`, after the existing `@media (prefers-reduced-motion: reduce)` block:

```css

/* ── Resize handles ──────────────────────────────────────────── */
/* <html> is one big -webkit-app-region: drag zone (see mini.html), which
   swallows the OS's edge/corner resize hit-testing. These sit at the
   literal window edge (position: fixed, not relative to .mini-container's
   padding) and opt back out of drag so native resize works now that
   lib/windows.js sets resizable: true. */
.mini-resize {
  position: fixed;
  -webkit-app-region: no-drag;
}

.mini-resize-n,
.mini-resize-s {
  left: 14px;
  right: 14px;
  height: 6px;
  cursor: ns-resize;
}

.mini-resize-n {
  top: 0;
}

.mini-resize-s {
  bottom: 0;
}

.mini-resize-e,
.mini-resize-w {
  top: 14px;
  bottom: 14px;
  width: 6px;
  cursor: ew-resize;
}

.mini-resize-w {
  left: 0;
}

.mini-resize-e {
  right: 0;
}

.mini-resize-nw,
.mini-resize-ne,
.mini-resize-sw,
.mini-resize-se {
  width: 14px;
  height: 14px;
}

.mini-resize-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.mini-resize-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.mini-resize-sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.mini-resize-se {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}

/* Visual grip glyphs — only the two corners the design calls for. Drawn as
   an inset ::after so the functional hit-box above still reaches the true
   window edge for resize, while the glyph itself sits inside
   .mini-container's border-radius: 12px instead of poking past it. */
.mini-resize-grip-dots::after,
.mini-resize-grip-diagonal::after {
  content: "";
  position: absolute;
  top: 4px;
  left: 4px;
  width: 8px;
  height: 8px;
  pointer-events: none;
  opacity: 0.5;
}

.mini-resize-grip-dots::after {
  background-image: radial-gradient(circle, var(--ink-muted) 1px, transparent 1.2px);
  background-size: 4px 4px;
}

.mini-resize-grip-diagonal::after {
  background-image: repeating-linear-gradient(
    45deg,
    var(--ink-muted) 0,
    var(--ink-muted) 1px,
    transparent 1px,
    transparent 4px
  );
}
```

- [ ] **Step 3: Manual verification — run the app**

Run: `npm start`

Expected: app launches with no console errors in the main window's DevTools (open with Ctrl+Shift+I if needed) or the terminal output.

- [ ] **Step 4: Manual verification — open the mini window**

In the running main window, click the pin/always-on-top button (`id="alwaysOnTopBtn"` in the top bar). The main window hides and the mini window appears in the top-right of the screen.

Expected: mini window opens at its default 280×294 size with no visual regressions to the existing header/countdown/controls layout.

- [ ] **Step 5: Manual verification — corner glyphs render correctly**

Look at the mini window's top-left and bottom-left corners.

Expected: a small dot-grid pattern in the top-left corner, a small diagonal-line pattern in the bottom-left corner, both faint (low-opacity, muted-gray), sitting inside the rounded border rather than overlapping/clipping past it. Top-right and bottom-right corners show no glyph.

- [ ] **Step 6: Manual verification — resize from all 4 edges and all 4 corners**

Hover and drag each of: top edge, bottom edge, left edge, right edge, and all 4 corners.

Expected: cursor changes to the matching resize cursor (`ns-resize` on top/bottom, `ew-resize` on left/right, `nwse-resize`/`nesw-resize` on corners) on hover, and dragging actually resizes the window in that direction. The window stops shrinking at `minWidth: 240` / `minHeight: 174` (set in `lib/windows.js`, unchanged by this task).

- [ ] **Step 7: Manual verification — dragging the window still works**

Click and drag an empty area of the mini window (e.g. between the countdown and the controls, away from any button or resize-zone strip) to a new screen position.

Expected: the window moves normally — confirms the 8 new no-drag zones didn't eat into the existing whole-window drag behavior beyond their own thin strips/corners.

- [ ] **Step 8: Commit**

```bash
git add mini.html css/mini.css
git commit -m "feat: add resize handles to mini window"
```
