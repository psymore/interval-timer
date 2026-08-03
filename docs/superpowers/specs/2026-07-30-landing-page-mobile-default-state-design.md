# Landing page: mobile default state (docked, not expanded)

Builds on `docs/superpowers/specs/2026-07-29-landing-page-ux-redesign-design.md`
("the redesign spec"), which made the demo default to **expanded** on load
for all viewport sizes. That's correct on desktop but wrong on narrow
viewports: `expandRect()` always targets an 800×1100 footprint regardless
of container width, so on a ~390px-wide phone the demo becomes a
narrow-but-1100px-tall box — the real app's desktop-oriented UI reads as
cramped, and visitors scroll roughly 2.4 screens before reaching Features.
This spec adds a mobile-specific default and a cap on manually-expanded
height; it does not touch the iframe/shim/postMessage contract or revisit
desktop behavior.

## Current state

`docs/assets/mini-demo.js`'s `initDefaultExpanded()` runs unconditionally
on page load — no viewport check. `expandRect()` always computes toward
800×1100 (clamped only by the stage's own width, never height). The hero's
existing CSS breakpoint (`@media (max-width: 820px)` in `docs/index.html`,
governing hero padding) is the only mobile-aware logic on the page today.

## Section 1 — Mobile starts docked

At page load, `initDefaultExpanded()` is replaced by a check: if
`window.innerWidth < 820` (matching the existing hero breakpoint, reused
rather than introducing a second magic number), initialize into the
**docked** state (small widget, bottom-right, per the redesign spec's
existing `dockRect()`) instead of expanded. This check runs once at load —
it is not re-evaluated on window resize or orientation change, matching
the static, load-time nature of the existing hero breakpoint (a live
toggle between defaults mid-session is out of scope; a desktop user
resizing their browser narrower after load keeps whatever state they're
already in, same as today).

Pin continues to toggle both directions identically on every viewport —
only the initial default differs. A mobile visitor who taps Pin gets the
same expand animation and iframe load as desktop.

## Section 2 — Caption copy matches the default per viewport

The hero's `.hero-demo-caption` text ("This is the real app, running
live — hit play to hear the alarm, or pin it into a small window...")
describes the expanded-by-default experience and is wrong once mobile
defaults to docked. Add a second caption variant for narrow viewports
("Tap the corner widget to try the real app" — exact copy finalized in
the plan) with its own `data-i18n` key, and show/hide the two variants
with the same `820px` breakpoint via CSS, so no JS is needed to pick
between them. Both keys get real `en`/`tr` entries in `docs/assets/i18n.js`
(no falling back to a hardcoded placeholder, unlike the two gaps fixed in
the redesign's final review).

## Section 3 — Cap expanded height on mobile

A mobile visitor can still tap Pin to expand — at that point they hit the
same fixed-1100px-tall box the default-state change was meant to avoid.
`expandRect()` gets a viewport-height-relative cap when narrow: below the
820px breakpoint, target height becomes
`Math.min(1100, window.innerHeight - 64)` (64px margin, top+bottom,
consistent with the existing `DOCK_MARGIN`-style spacing constants)
instead of the unconditional `1100`. Desktop (≥820px) keeps the existing
fixed 1100 — this only changes the mobile-expanded case.

## Out of scope

- Live re-evaluation of docked-vs-expanded default on resize/orientation
  change after initial load.
- Any other mobile-specific layout pass (typography, spacing, Features/
  other sections) — this spec is scoped to the demo's default state and
  its caption, per the redesign spec's own "mobile redesign deferred"
  note.
- Changing the 820px breakpoint value itself.

## Files touched (expected)

- `docs/assets/mini-demo.js` — viewport check in the init path, capped
  `expandRect()` height on mobile
- `docs/index.html` — second caption `<span>`/element + CSS to show the
  right one per breakpoint
- `docs/assets/i18n.js` — new caption key's `en`/`tr` entries
