# Landing page: hero/playground UX redesign

Builds on `docs/superpowers/specs/2026-07-27-landing-page-live-demo-design.md`
("the live-demo spec"), which is unchanged and still authoritative for the
underlying mechanism: the iframe pointed at `app/index.html?demo=1`, the
`electron-demo-shim.js` shim, and the `demo-ready`/`demo-seed-timer`/
`demo-shrink` postMessage handshake. Nothing here touches that contract —
this spec only changes *when the iframe appears by default*, *where it sits
in the page*, and *what happens to the collapsed state*.

## Current state

Page order: Nav → Hero (static `screenshot.png` + copy, two-column) →
Features (3 cards) → Mini-showcase (`#mini-window`, a separate section
containing `.mini-demo-stage`). Inside the stage, `.mini-demo` starts as a
small (240×180) bespoke countdown widget; pressing Pin (`#miniDemoPinBtn`)
grows it to an 800×1100 real-app iframe via `expand()` in
`docs/assets/mini-demo.js`. The mini window's own `alwaysOnTopBtn` inside
that iframe already posts `demo-shrink` back to shrink it — the
expand/collapse path is already bidirectional, just defaulting to
collapsed.

Problems being fixed (per user request):
1. The real interactive demo is the most valuable part of the page but
   sits below Hero and Features — not visible on first load on common
   desktop/laptop viewports.
2. The interaction direction is backwards for "main attraction" framing:
   small-by-default, expand-on-click undersells the demo.
3. `.mini-showcase .lede` text overlaps the expanded stage
   (`.mini-demo-stage.is-expanded` hardcodes `min-height: 1150px`, and
   `mini-demo.js`'s `STAGE_HEIGHT_EXPANDED = 1150` constant assumes that
   same number independently — the two aren't derived from one source, so
   they can disagree during/after the CSS transition).
4. General polish pass (spacing, hierarchy, transitions, a11y).

## New tools available for the polish pass

Two skills were installed into `.claude/skills/` this session, both
security-scanned clean (Gen: Safe, Socket: 0 alerts):
- `frontend-design` (official `anthropics/skills`) — distinctive-design
  checklist and a "Quality Floor" (responsive, visible focus states,
  `prefers-reduced-motion`).
- `motion-design` (`LottieFiles/motion-design-skill`) — timing/easing/
  choreography principles, framework-agnostic.
- `ui-ux-pro-max` (pulled directly from `AThevon/genjutsu`, bypassing its
  broken-in-this-environment `/plugin` install path) — a searchable
  CSV+Python dataset (palettes, font pairings, per-stack UX guidelines).
  Scripts audited: no network calls, no `eval`/`exec`/`subprocess`, single
  write path (`design-system/**` under an explicit `--output-dir`).

These inform Section 5 below; none of them change branding or introduce a
new runtime dependency.

## Section 1 — Merge Hero and Playground

The static `.hero-shot` screenshot and the separate `#mini-window`
mini-showcase section are both removed. Hero becomes one section: existing
headline/lede/CTA/download-stat copy on one side, the interactive
playground (formerly `.mini-demo-stage`) on the other side or below,
replacing the static screenshot as the hero's visual anchor. The
mini-showcase section's supporting copy ("Drag any edge or corner to
resize it...") is folded into the hero as a short caption near the
playground rather than duplicated in its own section.

Features section moves up to immediately follow the merged hero (no
content change to Features itself).

**SEO note (resolved):** `<title>`, meta description, `og:description`,
and the hero `h1`/lede text are unaffected — only visual placement changes,
no text is removed. The only real risk is Largest Contentful Paint if the
iframe blocks initial paint, which Section 2 avoids by design.

## Section 2 — Reversed default state, LCP-safe

On page load: hero text renders immediately (unaffected — this is what LCP
measures). The playground area shows the existing bespoke widget (already
instant, no iframe cost) sized to the large "expanded" footprint
immediately, rather than at 240×180. In the background, the iframe begins
loading (`src` set right away, same as today's `expand()` already does)
inside `.mini-demo-iframe.hidden` — invisible, `pointer-events: none`, per
the existing CSS. When it posts `demo-ready`, the existing swap logic
(`iframeEl.classList.add("is-visible")`, hide the bespoke body) runs
immediately, same handshake as today, just triggered on page load instead
of on a Pin click.

Net effect: visitors see a live countdown (bespoke, instant) for a brief
moment, then it's seamlessly replaced by the real running app once it
signals ready — no loading spinner, no blank/white iframe flash, and LCP
is measured against the instantly-painted hero text and widget, not the
iframe.

## Section 3 — Pin becomes a sticky-mini toggle

Pin's meaning flips: it now shrinks the large default view down to the
small mini-widget footprint (reusing the existing `centerRect()`/collapse
animation math), **and** that collapsed widget becomes `position: fixed`,
docked to the **bottom-right** corner of the viewport, so it stays visible
while the visitor scrolls through Features/rest of the page — mirroring
the real app's actual always-on-top mini window behavior. Clicking Pin
again (or the iframe's internal `alwaysOnTopBtn`, which already means
"shrink" per the live-demo spec) re-expands it back in place, using the
existing state-handoff (`demo-shrink`/`demo-seed-timer`) unchanged.

No separate close/dismiss control is added — consistent with the real
mini window, which persists until re-expanded or the page is left.

## Section 4 — Dynamic-height container

Replace the two independent hardcoded height constants
(`.mini-demo-stage.is-expanded { min-height: 1150px }` in CSS and
`STAGE_HEIGHT_EXPANDED = 1150` in `mini-demo.js`) with a single derived
source: the stage's height is driven by its actual expanded content
(`height: auto` / flex sizing) rather than a duplicated magic number, and
`centerRect()`/`expandRect()` read the live measured value instead of a
constant. This removes the class of bug where the two numbers drift out
of sync, and lets the layout absorb the new default-expanded state without
reintroducing the same overlap.

## Section 5 — Bounded polish pass

Scope, using the installed skills as reference (not open-ended):
- Motion timing/easing on the expand/collapse and demo swap transitions
  (`motion-design` skill).
- Spacing/typography/color consistency, visible keyboard focus,
  `prefers-reduced-motion` handling (`frontend-design` Quality Floor).
- Spot-check against `ui-ux-pro-max`'s `ux` and `html-tailwind`-adjacent
  guidance (touch target sizes, z-index scale, contrast) since the page is
  plain CSS, not Tailwind — used as a checklist, not a codegen source.
- Explicitly **not** in scope: rebranding, color palette changes, adding
  GSAP or any new runtime dependency (a separate decision if ever
  revisited), changes to `mini.html`/`js/mini.js` themselves, or anything
  to the underlying iframe/shim contract from the live-demo spec.

Implementer reports any additional small UX fixes found along the way in
its final summary, bounded by the above exclusions.

## Out of scope

- Changing the iframe/shim/postMessage contract (live-demo spec still
  governs it).
- GSAP or any animation library as a new dependency — CLAUDE.md's
  "no framework, no bundler" stance applies to `docs/` too unless
  separately decided.
- Mobile layout redesign beyond making the new merged hero responsive
  (no new mobile-specific interaction model).
- Genjutsu skills other than `ui-ux-pro-max` (redundant with
  `frontend-design`/`motion-design` or irrelevant to this stack — GSAP,
  Three.js, SwiftUI, Compose, etc.).

## Files touched (expected)

- `docs/index.html` — hero/mini-showcase merge, remove `.hero-shot`,
  remove standalone `#mini-window` section, stage CSS (dynamic height,
  sticky collapsed state)
- `docs/assets/mini-demo.js` — default-expanded initialization, sticky
  positioning on collapse, `centerRect()`/`expandRect()` reading measured
  height instead of constants
