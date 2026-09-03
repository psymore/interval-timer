# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session continuity: the `FOLLOWUP` keyword

When the user's message is just `FOLLOWUP` (case-insensitive, nothing else needed), read `docs/superpowers/FOLLOWUP.md` in full and act on it immediately — don't ask what to do, pick up the work it describes. This works the same whether it's typed later in an ongoing session or as the very first message of a brand-new one with nothing else loaded yet — the file's own opening paragraph is self-contained and tells a fresh session to read `CLAUDE.md` first. Treat that file as the authoritative session-handoff note, more current than anything else in this repo about "what's in progress right now."

Keep `docs/superpowers/FOLLOWUP.md` up to date: whenever the user asks for a followup/handoff summary, or a natural stopping point is reached after a substantial piece of work, overwrite it with a fresh summary, what's open, and likely next steps — don't append, replace the whole file each time so it never goes stale or grows unbounded.

## Commands

```bash
npm start          # Run the app (electron .)
npm run build       # Clean dist/ and package with electron-builder
npm run dist         # Clean dist/ and build a Windows x64 installer (nsis)
npm run clean        # Remove dist/
```

These commands are unchanged and still run from the repo root, but now delegate into `packages/electron` (an npm workspace) — `electron-builder`'s output lands in `packages/electron/dist/`, not a root `dist/` (no `directories.output` override was added, so it uses electron-builder's default of "relative to the package.json that defines the build config").

There is no test suite configured (`npm test` is a stub that exits with an error) and no lint script — don't assume either exists.

## Architecture

Electron desktop app **and** an installable PWA, sharing one
platform-agnostic renderer, in an npm-workspaces monorepo (vanilla JS ES
modules throughout — no framework, no bundler, no TypeScript). Every
`package.json` in this repo has `"type": "module"`, so every `.js` file is
ESM by default.

### Packages

- `packages/core/` — the platform-agnostic renderer (`index.html`, `js/**`, `css/**`, `assets/**`). Runs unmodified in Electron, the GitHub Pages demo, and the deployed PWA. Nothing in this package may import anything from `packages/electron`.
- `packages/electron/` — the Electron main process (`main.js`, `preload.cjs`, `lib/`, `build/`).
- `packages/pwa/` — the installable, persistent PWA sharing `packages/core`'s renderer (`manifest.json`, `service-worker.js`, `platform/`, `icons/`).

### Where things live

Read the relevant doc in `docs/architecture/` before touching that subsystem — each is scoped to one area of ownership and kept out of this file so routine tasks don't have to load every subsystem's detail.

| Touching... | Read |
|---|---|
| Package layout, the local HTTP server, sync scripts (`sync:demo`/`sync:pwa`/packaging), or platform detection (`js/demo/loader.js`) | `docs/architecture/monorepo-and-sync.md` |
| The timer tick loop / background-throttling behavior | `docs/architecture/timer-engine.md` |
| Alarm sources (local/YouTube/Spotify), the alarm provider factory, or alarm link health | `docs/architecture/alarm-providers.md` |
| The always-on-top mini window | `docs/architecture/mini-window.md` |
| Presets (persistence, IPC, `last-session` auto-fork) | `docs/architecture/presets.md` |

`docs/architecture/README.md` indexes all of the above.
