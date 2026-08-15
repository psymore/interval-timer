# Monorepo Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the existing single-package Electron app into an npm-workspaces monorepo (`packages/core` for the platform-agnostic renderer, `packages/electron` for the main process) with zero behavior change to the desktop app, the packaged installer, or the GitHub Pages demo — this is a pure restructure, no new features. It's the prerequisite for the PWA plan (`docs/superpowers/plans/2026-08-11-pwa-package.md`), which adds `packages/pwa` on top of this layout.

**Architecture:** `packages/core` holds everything that already runs unmodified in a browser tab today (`index.html`, `js/**`, `css/**`, `assets/**`, plus its own copy of `lib/logger.js`). `packages/electron` holds `main.js`, `preload.cjs`, the rest of `lib/`, `build/`, and the Spotify credential files, plus its own independent copy of `lib/logger.js` (duplicated rather than imported across the package boundary — see Task 3's rationale). In dev, Electron's local HTTP server and `BrowserWindow.loadFile()` calls read `packages/core` directly by relative path; for packaging, a pre-build script copies `packages/core` into a gitignored `packages/electron/core/` subfolder first, because `electron-builder`'s file globbing can't reach a sibling package.

**Tech Stack:** npm workspaces (no new build tooling — Turborepo/pnpm explicitly rejected as premature for 3 packages with no build pipeline). No new runtime dependencies.

## Global Constraints

- Zero behavior change to the packaged app, the dev app, or `docs/app` (the existing GitHub Pages demo) — this plan is a pure file-layout change plus the minimum code needed to keep paths resolving correctly.
- No new npm dependencies. `electron`, `electron-builder`, `electron-store`, `rimraf` move from root into `packages/electron`'s own `package.json`; `@biomejs/biome`, `knip`, `madge` stay at the workspace root as repo-wide tooling.
- This repo has no test runner (`npm test` is a stub) — verification below is manual: run the dev app, run the packaged build, diff `docs/app`'s sync output.
- Every file move must be a `git mv` (or, where a file needs to exist in two places — `lib/logger.js` — an explicit copy), never a delete-and-recreate, so `git log --follow` still works.
- Don't touch `docs/index.html`, `docs/assets/`, or anything under `docs/superpowers/` in this plan — those are out of scope here (the PWA plan adds a link to `docs/index.html`, not this one).

---

### Task 1: Workspace skeleton + move the renderer into `packages/core`

**Files:**
- Create: `packages/core/package.json`
- Move (`git mv`): `index.html` → `packages/core/index.html`; `css/` → `packages/core/css/`; `js/` → `packages/core/js/`; `assets/` → `packages/core/assets/`
- Copy (not move — see Task 3): `lib/logger.js` → `packages/core/lib/logger.js`
- Modify: `package.json` (root) — add `workspaces` field only, nothing else yet (further cleanup is Task 4)

**Interfaces:**
- Produces: `packages/core/` containing a complete, self-contained copy of the renderer — every file inside it already only ever referenced siblings within `js/`/`css/`/`assets/`/`lib/logger.js` (verified during design: the only two cross-directory imports in `js/**`, `js/alarmModal.js:12` and `js/alarm/AlarmManager.js:2`, both point at `../lib/logger.js` / `../../lib/logger.js` respectively — both resolve correctly once `lib/logger.js` sits alongside `js/` inside `packages/core`, so **no import statements need editing in this task**).

- [ ] **Step 1: Add the workspaces field to the root `package.json`**

Open `package.json` and add `"workspaces": ["packages/*"]` right after `"type": "module"`:

```json
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
```

- [ ] **Step 2: Create the `packages/core` directory and its `package.json`**

```bash
mkdir -p packages/core
```

Create `packages/core/package.json`:

```json
{
  "name": "@interval-timer/core",
  "version": "1.1.0",
  "private": true,
  "description": "Platform-agnostic renderer shared by the Electron app and the PWA."
}
```

- [ ] **Step 3: Move the renderer files with `git mv`**

```bash
git mv index.html packages/core/index.html
git mv css packages/core/css
git mv js packages/core/js
git mv assets packages/core/assets
```

- [ ] **Step 4: Copy `lib/logger.js` into `packages/core`**

This is a plain filesystem copy, not a `git mv` — the original `lib/logger.js` stays in place for now (it moves to `packages/electron/lib/` in Task 3, as its own independent copy; see that task's rationale for why two copies is the right call here rather than a cross-package import).

```bash
mkdir -p packages/core/lib
cp lib/logger.js packages/core/lib/logger.js
git add packages/core/lib/logger.js
```

- [ ] **Step 5: Verify the move didn't break any in-package relative import**

```bash
node --check packages/core/js/alarmModal.js
node --check packages/core/js/alarm/AlarmManager.js
```

Expected: both exit with no output (syntax-valid; this doesn't resolve imports, just confirms the files themselves are intact after the move — full import resolution is verified in Task 8's end-to-end run).

- [ ] **Step 6: Commit**

```bash
git add package.json packages/core
git commit -m "$(cat <<'EOF'
refactor: move renderer into packages/core

First step of the npm-workspaces monorepo restructure — packages/core
is a self-contained copy of the platform-agnostic renderer (index.html,
js/, css/, assets/, lib/logger.js), unchanged in content. main.js still
points at the old root paths until Task 3/4 land, so npm start is
expected to be broken between this commit and Task 4's fix — that's
fine within a single task-by-task plan execution, just don't ship this
commit alone.
EOF
)"
```

---

### Task 2: Move Electron-only files into `packages/electron`

**Files:**
- Create: `packages/electron/package.json`
- Move (`git mv`): `main.js`, `preload.cjs`, `lib/` (all 7 files, including the original `lib/logger.js`), `build/`, `spotify-credentials.json`, `spotify-credentials.example.json` → `packages/electron/`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `packages/electron/` containing every main-process file, with its own `lib/logger.js` (the original file, moved here — now the main-process-only copy, independent of `packages/core/lib/logger.js` from Task 1).

- [ ] **Step 1: Create the directory and move files**

```bash
mkdir -p packages/electron
git mv main.js packages/electron/main.js
git mv preload.cjs packages/electron/preload.cjs
git mv lib packages/electron/lib
git mv build packages/electron/build
git mv spotify-credentials.json packages/electron/spotify-credentials.json
git mv spotify-credentials.example.json packages/electron/spotify-credentials.example.json
```

- [ ] **Step 2: Create `packages/electron/package.json`**

Extracted from the root `package.json`'s current `main`, `build`, and the `electron`/`electron-builder`/`electron-store`/`rimraf` dependency entries — everything else (repo-wide lint/knip tooling, `overrides`) stays at the workspace root (Task 4).

```json
{
  "name": "@interval-timer/electron",
  "version": "1.1.0",
  "description": "",
  "private": true,
  "main": "main.js",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "clean": "rimraf dist",
    "sync-core": "node scripts/sync-core.mjs",
    "build": "npm run clean && npm run sync-core && electron-builder",
    "dist": "npm run clean && npm run sync-core && electron-builder --win --x64"
  },
  "build": {
    "appId": "com.psymore.intervaltimer",
    "productName": "Interval Timer",
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico",
      "signExecutable": false
    },
    "mac": null,
    "files": [
      "**/*",
      "!spotify-credentials.example.json",
      "!scripts/**"
    ]
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "electron": "^41.10.1",
    "electron-builder": "^26.15.6",
    "rimraf": "^5.0.5"
  },
  "dependencies": {
    "electron-store": "^11.0.2"
  }
}
```

(The `scripts/sync-core.mjs` referenced above and the `dist/` output directory don't exist yet — `dist/` is created by `electron-builder` itself; `scripts/sync-core.mjs` is written in Task 5. Don't try to run `npm run build`/`npm run dist` until Task 5 is done — that's covered in Task 8's verification.)

- [ ] **Step 3: Commit**

```bash
git add packages/electron
git commit -m "$(cat <<'EOF'
refactor: move main-process files into packages/electron

Second step of the monorepo restructure. packages/electron now holds
main.js, preload.cjs, lib/ (including its own copy of logger.js —
deliberately independent from packages/core/lib/logger.js, see the
design spec's note on why a cross-package import here would break
under electron-builder packaging), build/, and the Spotify credential
files. main.js's internal paths still assume the old single-package
layout — fixed in the next task.
EOF
)"
```

---

### Task 3: Fix `main.js`/`windows.js` path resolution (the "two-root" fix)

**Files:**
- Modify: `packages/electron/main.js`
- Modify: `packages/electron/lib/windows.js`

**Interfaces:**
- Consumes: `packages/core/` (Task 1) and `packages/electron/` (Task 2) both existing at their final paths.
- Produces: `initWindows({ appRoot, coreRoot })` — `windows.js`'s exported `initWindows` now takes a second required field, `coreRoot`, alongside the existing `appRoot`. Any future caller of `initWindows` must pass both.

This is the one genuinely tricky part of the restructure: `packages/core` and `packages/electron` are **siblings** in dev (so a static file server root of `path.join(__dirname, "..", "core")` finds it), but for a *packaged* build, Task 5's pre-build script copies `packages/core` into `packages/electron/core/` as a **nested** nested subfolder (because `electron-builder`'s file globbing can't reach outside its own package directory) — so the packaged app needs `path.join(__dirname, "core")` instead, one level shallower. `app.isPackaged` (an Electron built-in) is what tells `main.js` which shape it's running in.

- [ ] **Step 1: Compute `coreRoot` in `main.js` and pass it through**

In `packages/electron/main.js`, right after the existing `__dirname` computation:

```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// packages/core is a sibling package in dev; electron-builder can't glob a
// sibling package's files when packaging, so
// packages/electron/scripts/sync-core.mjs copies it in as a "core"
// subfolder before packaging — the packaged app finds it one level
// shallower there instead of one level up.
const coreRoot = app.isPackaged
  ? path.join(__dirname, "core")
  : path.join(__dirname, "..", "core");
```

Then update the two calls that need `coreRoot` instead of `__dirname` (the local HTTP server's static-serving root moves entirely to core; `initWindows` needs both roots — see Step 2):

```js
initLocalServer({ appRoot: coreRoot, store });
initWindows({ appRoot: __dirname, coreRoot });
initSpotifyAuth({
  appRoot: __dirname,
  store,
  appIconPath: path.join(__dirname, "build", "icon.ico"),
});
```

(`initSpotifyAuth` is unchanged — `spotify-credentials.json` lives in `packages/electron` alongside `main.js`, so `appRoot: __dirname` is still correct.)

- [ ] **Step 2: Accept and use `coreRoot` in `windows.js`**

In `packages/electron/lib/windows.js`, update the module-level state and `initWindows`:

```js
// Set via initWindows() — appRoot resolves Electron-only files
// (preload.cjs, build/icon.ico); coreRoot resolves the shared renderer
// (index.html, mini.html, assets/) — see main.js's coreRoot comment for
// why these differ between dev and a packaged build.
let appRoot = null;
let coreRoot = null;

export function initWindows({ appRoot: root, coreRoot: core }) {
  appRoot = root;
  coreRoot = core;
}
```

In `createWindow()`, change the `indexPath` line (keep `preloadPath` as-is):

```js
  const preloadPath = path.join(appRoot, "preload.cjs");
  const indexPath = path.join(coreRoot, "index.html");
```

In `createMiniWindow()`, change the `miniPath` line (keep `preloadPath` as-is):

```js
  const preloadPath = path.join(appRoot, "preload.cjs");
  const miniPath = path.join(coreRoot, "mini.html");
```

In `createTray()`, change the icon path:

```js
function createTray() {
  const iconPath = path.join(coreRoot, "assets", "icons", "stopwatch-main.png");
```

Leave `getAppIconPath()` (`path.join(appRoot, "build", "icon.ico")`) untouched — `build/` stays in `packages/electron`.

- [ ] **Step 3: Verify with a syntax check**

```bash
node --check packages/electron/main.js
node --check packages/electron/lib/windows.js
```

Expected: no output from either. (Full runtime verification — actually launching the app — happens in Task 8, after the sync scripts in Task 5 exist and `npm install` has been run against the new workspace layout.)

- [ ] **Step 4: Commit**

```bash
git add packages/electron/main.js packages/electron/lib/windows.js
git commit -m "$(cat <<'EOF'
fix: resolve packages/core paths from packages/electron

main.js now computes coreRoot (sibling packages/core in dev, nested
core/ subfolder in a packaged build via app.isPackaged) and passes it
to the local HTTP server and windows.js, which now resolves
index.html/mini.html/the tray icon from coreRoot instead of appRoot.
EOF
)"
```

---

### Task 4: Clean up the root `package.json`

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `packages/electron`'s `package.json` (Task 2) already owns `electron`/`electron-builder`/`electron-store`/`rimraf` and the `build`/`main` fields.
- Produces: root-level `npm start`/`npm run build`/`npm run dist`/`npm run clean` still work exactly as `CLAUDE.md` documents, by delegating into `packages/electron` via `--workspace`.

- [ ] **Step 1: Rewrite the root `package.json`**

Replace the whole file with:

```json
{
  "name": "interval-timer",
  "version": "1.1.0",
  "description": "",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "npm run start --workspace=packages/electron",
    "clean": "npm run clean --workspace=packages/electron",
    "build": "npm run build --workspace=packages/electron",
    "dist": "npm run dist --workspace=packages/electron",
    "sync:demo": "node scripts/sync-demo-app.mjs"
  },
  "overrides": {
    "@noble/hashes": "1.8.0"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "@biomejs/biome": "^2.5.3",
    "knip": "^5.88.1",
    "madge": "^8.0.0"
  }
}
```

Changes from the original: dropped `main` (root is no longer itself the Electron entry point) and the `build` block (now lives in `packages/electron/package.json`, Task 2); `start`/`clean`/`build`/`dist` now delegate via `--workspace=packages/electron`; dropped `electron`/`electron-builder`/`electron-store`/`rimraf` from `devDependencies`/`dependencies` (moved to `packages/electron/package.json`); added `private: true` and `workspaces`; `sync:demo` unchanged (Task 5 updates what that script does internally, not this line).

- [ ] **Step 2: Reinstall to pick up the new workspace layout**

```bash
npm install
```

Expected: npm creates/updates a single root `node_modules/` covering all three workspace packages (only `packages/core` and `packages/electron` exist so far — `packages/pwa` is added in the PWA plan). No errors. `electron` and `electron-builder` should now be resolvable from `packages/electron` (hoisted to the root `node_modules/.bin`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
refactor: convert root package.json to a workspaces root

start/build/dist/clean now delegate into packages/electron so the
commands CLAUDE.md documents (npm start, npm run build, npm run dist,
npm run clean) keep working unchanged from the repo root.
EOF
)"
```

---

### Task 5: Sync scripts — shared helper, `docs/app` update, packaging pre-step

**Files:**
- Create: `scripts/lib/syncCore.mjs`
- Modify: `scripts/sync-demo-app.mjs`
- Create: `packages/electron/scripts/sync-core.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `syncCoreInto(destDir: string): void` — exported from `scripts/lib/syncCore.mjs`, copies `packages/core`'s servable files (`index.html`, `js/`, `css/`, `assets/`, `lib/`) into `destDir`, wiping `destDir` first. Used by both `scripts/sync-demo-app.mjs` (→ `docs/app/`) and `packages/electron/scripts/sync-core.mjs` (→ `packages/electron/core/`); the PWA plan's `packages/pwa/scripts/build.mjs` will be the third consumer.

- [ ] **Step 1: Write the shared helper**

Create `scripts/lib/syncCore.mjs`:

```js
// Shared by scripts/sync-demo-app.mjs (-> docs/app, for GitHub Pages),
// packages/electron/scripts/sync-core.mjs (-> packages/electron/core, for
// electron-builder packaging), and (added by the PWA plan)
// packages/pwa/scripts/build.mjs (-> docs/pwa). packages/core has no build
// step of its own — this just copies its servable files into whichever
// target needs a real, standalone copy. Electron-builder's file globbing
// can't reach a sibling package, and GitHub Pages needs actual files, not
// a live reference across the monorepo.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);
const coreDir = path.join(repoRoot, "packages", "core");
const ENTRIES = ["index.html", "js", "css", "assets", "lib"];

export function syncCoreInto(destDir) {
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }
  mkdirSync(destDir, { recursive: true });

  for (const entry of ENTRIES) {
    cpSync(path.join(coreDir, entry), path.join(destDir, entry), {
      recursive: true,
    });
  }

  console.log(`Synced ${ENTRIES.join(", ")} from packages/core -> ${destDir}`);
}
```

- [ ] **Step 2: Rewrite `scripts/sync-demo-app.mjs` to use it**

Replace the whole file with:

```js
// Copies packages/core's servable files into docs/app/, so GitHub Pages —
// which only serves docs/ — can load the real app in an iframe. Run this
// after any change to packages/core relevant to the demo, before deploying
// docs/ to Pages. docs/app/ is a generated mirror — never hand-edit it, re-
// run this script instead.
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "./lib/syncCore.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
syncCoreInto(path.join(repoRoot, "docs", "app"));
```

- [ ] **Step 3: Run it and confirm `docs/app` is unchanged**

```bash
npm run sync:demo
git status docs/app
```

Expected: `git status` shows no changes under `docs/app` (the copied file contents are byte-identical to what was already there — same source files, same copy logic, just moved to a different helper). If it shows differences, stop and investigate before continuing — that would mean the restructure altered renderer content, which this plan must not do.

- [ ] **Step 4: Write the packaging pre-step script**

Create `packages/electron/scripts/sync-core.mjs`:

```js
// Pre-package step, run before electron-builder (see package.json's
// build/dist scripts). electron-builder's file globbing is scoped to this
// package's own directory and can't reach the sibling packages/core — this
// copies it in as a gitignored core/ subfolder first. main.js resolves
// packages/core directly (no copy) in dev; this copy only exists for
// packaged builds. Re-run automatically by "npm run build"/"npm run dist"
// — never hand-edited.
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "../../scripts/lib/syncCore.mjs";

const electronDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
syncCoreInto(path.join(electronDir, "core"));
```

- [ ] **Step 5: Gitignore the generated packaging copy**

Add a line to `.gitignore` (anywhere in the file; grouping it near the existing `dist` entry makes sense):

```
packages/electron/core/
```

- [ ] **Step 6: Verify the packaging sync step runs standalone**

```bash
node packages/electron/scripts/sync-core.mjs
```

Expected: prints `Synced index.html, js, css, assets, lib from packages/core -> .../packages/electron/core`, and `packages/electron/core/index.html` now exists.

```bash
git status packages/electron/core
```

Expected: untracked (ignored by the `.gitignore` line from Step 5) — confirm it does **not** show up as untracked-and-about-to-be-committed; if it does, the `.gitignore` entry is wrong.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/syncCore.mjs scripts/sync-demo-app.mjs packages/electron/scripts/sync-core.mjs .gitignore
git commit -m "$(cat <<'EOF'
refactor: generalize the demo sync script for the monorepo

scripts/lib/syncCore.mjs is now the one place that knows how to copy
packages/core's servable files into a target directory. The existing
docs/app sync uses it unchanged (verified byte-identical output); a
new packages/electron/scripts/sync-core.mjs uses the same helper as a
pre-package step, since electron-builder can't glob a sibling package.
EOF
)"
```

---

### Task 6: Update `biome.json` / `knip.json` for the new layout

**Files:**
- Modify: `biome.json`
- Modify: `knip.json`

**Interfaces:**
- Consumes: the final `packages/core`/`packages/electron` file layout from Tasks 1–2.

- [ ] **Step 1: Update `biome.json`**

Replace the `files.includes` array (paths were root-relative; now they need to cover both packages):

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
  "files": {
    "includes": [
      "packages/electron/main.js",
      "packages/electron/preload.cjs",
      "packages/electron/lib/**/*.js",
      "packages/core/js/**/*.js",
      "packages/core/*.html",
      "packages/core/css/**/*.css"
    ]
  },
  "linter": {
    "enabled": true
  },
  "formatter": {
    "enabled": true
  }
}
```

- [ ] **Step 2: Update `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "packages/electron/main.js",
    "packages/electron/preload.cjs",
    "packages/core/js/renderer.js",
    "packages/core/js/alarmModal.js",
    "packages/core/js/mini.js"
  ],
  "project": [
    "packages/**/*.js",
    "packages/**/*.cjs"
  ],
  "ignore": [
    "**/dist/**",
    "packages/electron/build/**",
    "packages/electron/core/**"
  ]
}
```

(`packages/electron/core/**` added to `ignore` since Task 5 makes that a generated, gitignored copy — knip shouldn't analyze it as source.)

- [ ] **Step 3: Verify both configs are valid JSON and knip runs without crashing**

```bash
node -e "JSON.parse(require('fs').readFileSync('biome.json'))" && echo "biome.json OK"
node -e "JSON.parse(require('fs').readFileSync('knip.json'))" && echo "knip.json OK"
npx knip
```

Expected: both `OK` lines print; `npx knip` runs to completion (its findings — unused files/exports — aren't the point here, just that it doesn't crash on a malformed config or unresolvable entry path).

- [ ] **Step 4: Commit**

```bash
git add biome.json knip.json
git commit -m "docs: update biome/knip paths for the monorepo layout"
```

---

### Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing code-level — this is a documentation-only task, but it's load-bearing for every future Claude Code session in this repo, so it belongs in this plan rather than being left implicit.

- [ ] **Step 1: Update the "Commands" section**

The commands themselves (`npm start`, `npm run build`, `npm run dist`, `npm run clean`) are unchanged (Task 4 kept them working from the root) — add one line noting they now delegate into `packages/electron`, and that `packages/electron/dist/` (not root `dist/`) is where `npm run clean`/`electron-builder`'s output lives (no `directories.output` override was added in Task 2, so it uses `electron-builder`'s default of "relative to the package.json that defines the build config").

- [ ] **Step 2: Rewrite the "Architecture" section's opening and "Process split" subsection**

Replace the "Architecture" intro paragraph and "Process split" bullets with:

```markdown
## Architecture

Electron desktop app + PWA, sharing one platform-agnostic renderer, in an
npm-workspaces monorepo (vanilla JS ES modules throughout — no framework,
no bundler, no TypeScript). Every `package.json` in this repo has
`"type": "module"`, so every `.js` file is ESM by default.

### Packages

- `packages/core/` — the platform-agnostic renderer: `index.html`, `js/**`,
  `css/**`, `assets/**`, and its own copy of `lib/logger.js`. Runs
  unmodified in Electron (served live by the local HTTP server), in the
  GitHub Pages demo (`docs/app/`, a generated copy), and in the PWA
  (`docs/pwa/`, also a generated copy) — see "Sync scripts" below for how
  those copies stay in sync. Nothing in this package may import anything
  from `packages/electron`.
- `packages/electron/` — the Electron main process: `main.js`,
  `preload.cjs`, `lib/` (main-process-only modules, plus its own
  independent copy of `lib/logger.js` — deliberately not shared with
  `packages/core`'s copy; a cross-package import here would resolve
  differently in dev vs. a packaged build, since packaging copies
  `packages/core` into a nested `core/` subfolder rather than leaving it as
  a sibling), `build/` (installer icon), and the gitignored
  `spotify-credentials.json`.
- `packages/pwa/` — the installable web app. See its own section below.
```

- [ ] **Step 3: Replace the "Local HTTP server (main.js)" subsection**

```markdown
### Local HTTP server (main.js)

The renderer is served from `http://127.0.0.1:<dynamic-port>/index.html`,
not `file://`. This is required because the YouTube IFrame Player API uses
`postMessage` between the parent window and the iframe, which needs a real
HTTP origin — `file://` doesn't work as a postMessage origin.
`startLocalServer()` spins up a plain `http.createServer` on port 0
(OS-assigned) before `createWindow()` runs, serving `packages/core`
directly in dev. `main.js` computes this root (`coreRoot`) differently
depending on `app.isPackaged`: a sibling `../core` in dev, or a nested
`core/` subfolder in a packaged build (copied in by
`packages/electron/scripts/sync-core.mjs` before `electron-builder` runs,
since `electron-builder`'s file globbing can't reach a sibling package).
```

- [ ] **Step 4: Add a "Sync scripts" subsection**

Insert after the "Local HTTP server" subsection:

```markdown
### Sync scripts

`packages/core` has no build step — it's plain static files — but three
things need their own real copy of it rather than a live reference:
`electron-builder` packaging (`packages/electron/core/`, gitignored,
regenerated by `packages/electron/scripts/sync-core.mjs` before every
`npm run build`/`npm run dist`), the GitHub Pages demo (`docs/app/`,
regenerated by `npm run sync:demo`), and the PWA (`docs/pwa/`, regenerated
by `npm run sync:pwa`). All three call the same
`scripts/lib/syncCore.mjs#syncCoreInto(destDir)` helper. None of the three
destination directories should ever be hand-edited — re-run the relevant
sync command instead.
```

- [ ] **Step 5: Fix the stale Spotify description**

Find the existing "**Spotify status**" paragraph (currently describes a
Client-Credentials/30s-preview flow) and replace it with:

```markdown
**Spotify**: a full Authorization Code login
(`packages/electron/lib/spotifyAuth.js`) — client secret held in the main
process, loopback redirect (`http://127.0.0.1:8888/callback`), tokens
encrypted at rest via `safeStorage`. Playback launches the OS Spotify
desktop app via `shell.openExternal("spotify:track:<id>")` (full track,
not a preview) and syncs pause/resume through the Web API
(`SpotifyAlarmProvider.js`) — pausing requires Spotify **Premium**; free
accounts silently fail to pause and the track plays until manually
stopped. Client ID/secret are loaded from the gitignored
`packages/electron/spotify-credentials.json` (see
`packages/electron/spotify-credentials.example.json` for the shape); the
secret is never sent to the renderer. Not available in the PWA — see its
section below.
```

- [ ] **Step 6: Update remaining path references throughout the file**

Read through the rest of `CLAUDE.md` (the "Timer tick loop", "Alarm
provider architecture", "Mini window", "Presets", "Alarm link health",
"Adding a new alarm source" sections) and prefix every bare file path with
its new package location — e.g. `js/logic/Timer.js` becomes
`packages/core/js/logic/Timer.js`, `main.js` becomes
`packages/electron/main.js`, `lib/presetsIpc.js` becomes
`packages/electron/lib/presetsIpc.js`. None of the described *behavior*
changes — this is a mechanical path-prefixing pass, not a rewrite of what
each section says.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md for the monorepo restructure

Documents the packages/core + packages/electron split, the sync
scripts, and corrects the Spotify section (it described the old
Client-Credentials/30s-preview flow; production has used full
Authorization Code login + OS-launch playback for a while).
EOF
)"
```

---

### Task 8: Full manual verification

**Files:** none — this task only runs and inspects, doesn't change anything (unless it finds a bug, in which case fix it, re-verify, and commit the fix before checking this task off).

- [ ] **Step 1: Fresh install**

```bash
rm -rf node_modules packages/core/node_modules packages/electron/node_modules
npm install
```

Expected: completes with no errors; a single `node_modules/` exists at the repo root.

- [ ] **Step 2: Dev launch**

```bash
npm start
```

Manually verify in the launched window:
- Main window opens and shows the Interval Timer tab.
- Switch to the Timer tab and back — both timers run (start/pause/reset).
- Open Settings, Alarm Sound modal — local file section, YouTube section, Spotify connect button all render.
- Click the pin icon (always-on-top) — the mini window opens, shows the running countdown, its pause/continue/reset buttons work, its resize handles work, closing it returns focus to the main window.
- Open the language toggle — switches en/tr.
- Quit via the topbar quit button.

Expected: everything above behaves exactly as it did before the restructure (no visual or functional change). If anything fails, use the DevTools console (main window) and the terminal's `log.error` output to find which path is wrong, fix it, and re-verify from Step 2.

- [ ] **Step 3: Packaged build**

```bash
npm run dist
```

Expected: completes with no errors, produces an NSIS installer under `packages/electron/dist/`. Install it (or run the unpacked `win-unpacked/Interval Timer.exe` directly, faster to iterate on) and repeat the same manual checks as Step 2 against the packaged app — this is the one path (`app.isPackaged === true`) that Task 3's `coreRoot` branch specifically exists for, so it's not optional.

- [ ] **Step 4: Confirm the GitHub Pages demo still works**

```bash
npm run sync:demo
git status docs/app
```

Expected: no changes (same check as Task 5 Step 3, repeated here as a final regression check now that everything else has landed). Optionally serve `docs/` locally (e.g. `npx serve docs`) and open `index.html`, click through to the live demo iframe, confirm it still loads and runs.

- [ ] **Step 5: Final commit if anything needed fixing**

If Steps 2–4 required any code changes, stage and commit them now with a message describing what was broken and why (e.g. a missed path reference). If nothing needed fixing, there's nothing to commit here — this task was verification-only.
