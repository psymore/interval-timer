# Knowledge Architecture Restructure — Design

**Date:** 2026-09-03
**Driver:** `Project-Agnostic Knowledge Architecture — Mother Prompt.md` (repo root, untracked reference doc supplied by the user; not part of this migration's output).

## Problem

`CLAUDE.md` (199 lines) mixes two categories that should not share one file:

- **Governance** (always relevant to any task): npm commands, the `FOLLOWUP` session-continuity protocol, "no test suite/no lint" note.
- **Domain/subsystem knowledge** (only relevant when touching that specific subsystem): sync scripts, local HTTP server rationale, platform-detection branching, timer tick loop, alarm provider architecture (incl. local-file strategy seam, Spotify, "adding a new alarm source"), mini-window IPC contract, presets persistence, alarm link-health gap.

Every task currently loads all of the above regardless of relevance — the "knowledge gravity" pattern the mother prompt warns about (its §9), even at a modest line count. Domain knowledge has no home of its own to grow into, so it accumulates in the one file that's always loaded.

## Out of scope

- **Tooling (Serena MCP, a code-graph viewer):** considered and explicitly deferred by the user. The repo is vanilla JS (no TypeScript), ~3 packages, and Grep/Glob/Explore already cover symbol and file discovery. Revisit only if a concrete navigation pain point shows up.
- **`README.md`:** left untouched. Its "Project structure" section serves a different audience (contributors browsing github.com) and is a short summary, not a competing authority — no factual conflict with `CLAUDE.md` exists today. Not touched by this migration.
- **`docs/superpowers/specs/` and `docs/superpowers/plans/`:** already match the mother prompt's Specs/Plans model (one dated pair per feature). No change.
- **`docs/superpowers/FOLLOWUP.md` and the `FOLLOWUP` keyword protocol:** already a working routing mechanism. No change to the mechanism itself — it stays referenced from `CLAUDE.md`.
- **Application code:** not touched by this migration.

## Design

### New domain docs (`docs/architecture/`)

Grouped by actual ownership (mother prompt §12 — domain boundary should represent meaningful ownership, not one file per component):

1. **`monorepo-and-sync.md`** — package boundaries (`packages/core`, `packages/electron`, `packages/pwa`), the local HTTP server rationale (why not `file://`), the three sync scripts (`sync:demo`, `sync:pwa`, `sync-core.mjs` packaging step) and their shared `syncCoreInto()` helper, and the platform-detection loader (`packages/core/js/demo/loader.js`'s three-way branch).
2. **`timer-engine.md`** — the `setInterval(200)` tick-loop rationale (not `requestAnimationFrame`) and its three pairing mechanisms: `disable-background-timer-throttling`/`disable-renderer-backgrounding`, `backgroundThrottling: false`, `powerSaveBlocker`.
3. **`alarm-providers.md`** — the provider factory/strategy pattern, the local-file strategy seam (Electron filesystem vs. PWA IndexedDB blob), Spotify OAuth/playback specifics, the "adding a new alarm source" recipe, and the alarm-link-health coverage gap (local files unchecked outside the Recent list).
4. **`mini-window.md`** — frameless always-on-top window, one-way state flow (renderer→mini via `timer-state` IPC, mini→renderer via `mini-action` IPC), snapshot-on-open.
5. **`presets.md`** — `electron-store` persistence (`timer-config.json`), the IPC surface, `MAX_PRESETS`, the auto-fork-to-`last-session` behavior, the `preset-data-changed` event.

Plus **`docs/architecture/README.md`** — an index only (doc name → one-line "read this when..."), not a summary of contents, per mother prompt §16.

Content for each doc is moved out of `CLAUDE.md` largely verbatim (light editing for standalone readability only) — this is a relocation, not a rewrite, to avoid losing detail (mother prompt §19).

### `CLAUDE.md` target shape

Shrinks to a router (mother prompt §28):

- `FOLLOWUP` keyword protocol — unchanged.
- Commands block — unchanged.
- "No test suite / no lint script" — unchanged.
- Architecture section replaced with: a short paragraph (what the app is, monorepo shape, ESM-everywhere), a one-line-per-package summary, and a routing table mapping each domain doc to the trigger for reading it (e.g. "Touching alarm sources? → `docs/architecture/alarm-providers.md`").

## Migration phases

1. **Create domain docs** — write the five `docs/architecture/*.md` files plus the index, moving content out of `CLAUDE.md`.
2. **Rewrite `CLAUDE.md`** — replace the architecture section with the routing table; leave governance sections untouched.
3. **Knowledge-loss check** — diff the original `CLAUDE.md` against the final version; every substantive fact must resolve to "moved to `docs/architecture/X.md`" or "unchanged in `CLAUDE.md`." No fact should resolve to "nowhere."
4. **Cold-read validation** — using the mother prompt's §29 test questions (e.g. "where is the architecture of the alarm system," "what should I read before touching the mini window") confirm each has a one-hop, terminating answer from `CLAUDE.md`.

Each phase is small, reviewable, and touches only markdown files — fully reversible via git.

## Validation

- Grep `CLAUDE.md` and `docs/architecture/*.md` together for every subsystem-specific term that existed in the original `CLAUDE.md` (e.g. `powerSaveBlocker`, `MAX_PRESETS`, `syncCoreInto`, `localBlobStrategy`) to confirm nothing was dropped.
- Confirm no new `.md` files reference paths that don't exist (dead links — mother prompt §30).
- Confirm `docs/architecture/README.md` stays an index (no duplicated prose from the docs it points to).
