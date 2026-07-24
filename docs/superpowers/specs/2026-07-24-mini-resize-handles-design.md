# Mini window resize handles

> **Superseded:** the CSS-only native-resize approach described below did
> not work in practice — real-world testing showed no resize occurred even
> with the hit zones stretched to 190px. Root cause: Electron only added
> native resize hit-testing for `frame:false` windows in v42
> (electron/electron#50864); this app is pinned to `^41.10.1`. The actual
> shipped implementation is a manual JS-driven resize (mousedown → IPC →
> `setBounds()`), added in commit `544aa1b` and hardened in `e8bead8`. The
> 8 hit-zone divs and corner glyphs below are still accurate — only the
> "native OS resize" mechanism section is obsolete.

## Problem

`lib/windows.js` sets `resizable: true` on the mini `BrowserWindow` (previously
`false`), and `css/mini.css`/`mini.html` already have room made for a taller
layout (thicker border, more padding). But `mini.html`'s `<html>` carries
`-webkit-app-region: drag` across the entire page, and `mini.css` only opts
specific buttons out of it. That drag region covers the window's outer edge
pixels, which swallows the OS's native resize hit-testing — so `resizable:
true` alone doesn't make the window actually resizable by dragging an edge or
corner.

## Goal

Restore native OS edge/corner resizing on all four sides, and add a subtle
visual hint at two corners so the capability is discoverable (mini has no
frame/border chrome to show the usual OS resize affordance).

## Design

### Resize hit zones (functional, all 8)

8 `div`s added as direct children of `<body>` in `mini.html`, siblings of
`.mini-container`, each `position: fixed` so they sit at the literal window
edge regardless of `.mini-container`'s own padding/border:

- `n` / `s` / `e` / `w`: thin strips (~6px) spanning each edge (inset from the
  corners so they don't overlap them), cursor `ns-resize` / `ew-resize`
- `nw` / `ne` / `sw` / `se`: ~14px squares at each corner, cursor
  `nwse-resize` / `nesw-resize`

All 8 get `-webkit-app-region: no-drag` — that's the actual fix. No JS: once
the CSS stops claiming those pixels for window-drag, Electron/the OS handles
the resize itself.

### Visual grip icons (2 of the 8 zones)

Per user direction, icons go on the **left** side only, not the conventional
bottom-right:

- `nw` (top-left): CSS dot-grid glyph (`radial-gradient`, tiled small dots)
- `sw` (bottom-left): CSS diagonal-line glyph (`repeating-linear-gradient`)

Both rendered via `::after` on their hit-zone div, inset a few px from the
true corner so the glyph sits inside `.mini-container`'s `border-radius:
12px` instead of poking past it as a sharp square. The `::after` is purely
decorative (`pointer-events: none`) — the parent div's full hit-box still
reaches the true edge for resize purposes. Colored `var(--ink-muted)` at low
opacity to match the existing muted/subtle style language (`.mini-label`,
`.mini-loop` use the same token).

The remaining 6 zones (`n`, `s`, `e`, `w`, `ne`, `se`) stay icon-less —
functional only, no visible background.

### Sizing

No change to `minWidth: 240` / `minHeight: 174` in `lib/windows.js` — those
already act as the resize floor. Default open size stays `280x294`.

## Files touched

- `mini.html` — 8 resize-zone `div`s added after `.mini-container`
- `css/mini.css` — `.mini-resize-*` positioning/cursor rules, `::after` glyph
  rules for the `nw`/`sw` variants
- `lib/windows.js` — no change (resize enablement already done)

## Out of scope

- JS-driven resize (drag-to-resize via mousedown/mousemove) — native OS
  resize via the freed-up hit zones is sufficient once the drag region stops
  blocking it.
- Icons on `ne`/`se` or any edge strip — only the two corners requested.
- A "reset to default size" button — different feature, not requested here.
