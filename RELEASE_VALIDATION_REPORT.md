# Release Validation Report — Interval Timer v1.0.0

Generated: 2026-07-08
Scope: Final manual release validation only (production code review already completed separately).

---

## PART 1 — CLAUDE CODE TASKS (automated/inspectable)

### 1. Build & packaging configuration

| Check | Result |
|---|---|
| `electron-builder` config present | PASS — `appId`, Windows `nsis` target, icon configured |
| `files` allowlist configured | **FIXED** — originally no `files`/`extraResources` restriction in `package.json`'s `build` block (packed the entire project directory by default); an explicit allowlist was added this session excluding dev/doc/internal directories |
| Current `dist/` build up to date | **FIXED** — original `dist/win-unpacked` predated the "Remove stale markdown export files" commit; `npm run dist` was re-run with the new `files` config and verified |

### 2. Electron security configuration

| Check | Result |
|---|---|
| `contextIsolation` | PASS — `true` on main window, mini window, and Spotify auth window |
| `sandbox` | PASS — `true` on all three `BrowserWindow`s |
| `nodeIntegration` | PASS — never enabled (default false); relies on `contextBridge` only |
| `webSecurity` | PASS — left at default `true` everywhere; explicitly set `true` on the Spotify auth window |
| `contextBridge` / preload surface | PASS — `preload.cjs` exposes a narrow, named API (`quitApp`, presets, mini/timer state, Spotify) — no raw `ipcRenderer`/`require` leak |
| Content-Security-Policy | PASS — strict `default-src 'self'` in both `index.html` and `mini.html`, external origins scoped to exactly what's needed (YouTube, Spotify) |
| Navigation hijack protection | PASS — `will-navigate` and `setWindowOpenHandler` deny-by-default on main and mini windows, preventing a compromised page from carrying the preload bridge elsewhere |
| Permission requests | PASS — `setPermissionRequestHandler` denies everything by default (camera/mic/geolocation/notifications) |
| `shell.openExternal` usage | PASS — only used for `spotify:track:<id>`, with the track ID re-validated against a strict regex in the main process (doesn't trust the renderer's own check) |
| IPC input validation | PASS — `presets:save` validates shape/bounds (`isValidPreset`), `MAX_PRESETS` enforced server-side; local audio server enforces path containment + a single-file allowlist (no path traversal) |
| Application menu | **Minor gap** — no `Menu.setApplicationMenu(null)`/`autoHideMenuBar` on the main window, so the default Electron menu (Reload, Force Reload, Toggle DevTools, etc.) is reachable in production |

### 3. Package contents (verified by extracting the built `app.asar`)

**Originally FAIL, now FIXED** — because of the missing `files` allowlist (§1), the packaged app originally included, beyond the app source: `.claude/settings.local.json`, `.superpowers/sdd/` (task briefs, review diffs, progress notes), `docs/` (GitHub Pages landing site + `screenshot.png`), `README.md`, `CLAUDE.md`, `spotify-credentials.example.json`, plus `spotify-credentials.json` (the critical finding, §4).

After adding the `files` allowlist and rebuilding, re-extracting `app.asar` confirms only app source, `assets/`, `css/`, `js/`, `lib/`, `node_modules/`, `main.js`, `preload.cjs`, `index.html`, `mini.html`, `package.json`, and the (intentionally kept) `spotify-credentials.json` remain. `biome.json`/`knip.json` (harmless dev tool configs, not secrets) are still present but low priority to exclude further.

### 4. Secrets — **CRITICAL FINDING — RESOLVED**

`spotify-credentials.json` (a **real, live Spotify `clientId`/`clientSecret`**, not placeholder values) was packed in plaintext inside `app.asar` in the original build. It's gitignored (never committed), but electron-builder doesn't consult `.gitignore` — it packs the whole project directory absent a `files` filter, so the secret shipped to every installer regardless of git state. Confirmed by extracting the actual built asar and reading the secret out of it directly.

**Resolution taken this session:**
1. User rotated the Spotify client secret in the Spotify Dashboard (the old value baked into the stale `dist/` build is now invalid).
2. `package.json`'s `build.files` now has an explicit allowlist excluding `.claude/**`, `.superpowers/**`, `docs/**`, `markdown/**`, `production-review/**`, `README.md`, `CLAUDE.md`, `*.md`, and `spotify-credentials.example.json` from the package.
3. **Decision**: `spotify-credentials.json` itself is intentionally still packaged (not excluded) — the user chose to keep Spotify functional for all end users rather than ship without it. This is a deliberate, informed tradeoff: the client_id/secret pair only identifies the app to Spotify's API (each user still authenticates their own account separately); shipping a desktop app's OAuth "secret" this way is standard practice since desktop clients can't truly keep it confidential. Noted as a **future improvement**: migrate to PKCE (Authorization Code with PKCE) so no client secret needs to ship at all — Spotify's recommended flow for public/desktop clients.
4. `npm run dist` was re-run and the new `app.asar` was verified to no longer contain `docs/`, `.claude/`, `.superpowers/`, `README.md`, or `CLAUDE.md`.

No `.env` files, no other API keys/tokens/passwords/certificates found anywhere in the source tree.

### 5. Logging

| Check | Result |
|---|---|
| Structured logging exists | PASS — `lib/logger.js`, namespaced, level-gated via `LOG_LEVEL` |
| No sensitive data logged | PASS — grepped for `clientSecret`/`accessToken`/`refreshToken`/`client_secret` across `js/`; only variable names and boolean presence checks are logged (e.g. `hasToken: !!opts.accessToken`), never token values |
| Crash logging | PASS (main process) — `render-process-gone`, `did-fail-load`, `unresponsive` all logged with reason/description |
| Crash logging | **Gap (renderer)** — no global `window.onerror`/`unhandledrejection` handler in renderer code; an uncaught error there is invisible in a production build (no DevTools open) with zero diagnostic trail |

### 6. Error handling

- Main process installs `process.on("uncaughtException")` and `process.on("unhandledRejection")` — both log rather than crash silently. PASS.
- `app.whenReady().catch(...)`, all async window/tray/Spotify flows wrapped in try/catch with user-facing rejects where relevant. PASS.
- Renderer-side: no top-level safety net (see §5 gap above). Not urgent — Timer/IntervalTimer state machines are defensively written — but worth a one-line addition for production diagnosability.

### 7. Performance risks

- No `requestAnimationFrame` used for the timer loop (intentional — see CLAUDE.md, avoids throttling when backgrounded). PASS.
- `disable-background-timer-throttling`, `disable-renderer-backgrounding`, `backgroundThrottling: false`, and `powerSaveBlocker` all in place to keep the tick loop alive. PASS.
- The one recurring interval outside the timer logic (`miniTopmostInterval` in `lib/windows.js`) is correctly cleared in the window's `closed` handler — no leak. PASS.
- No synchronous blocking I/O found on the main thread at startup beyond small config reads (`electron-store`, `spotify-credentials.json`) — negligible cost. PASS.
- No unbounded listener registration found in a loop (mini/renderer wiring is one-time setup). PASS.

---

## Summary of Part 1 findings

| Severity | Finding | Status |
|---|---|---|
| **Critical** | Real Spotify client secret shipped in plaintext inside `app.asar` (§4) | **Fixed** — secret rotated; `files` allowlist added; rebuilt and re-verified. `spotify-credentials.json` is still intentionally packaged (user decision to keep Spotify working for all users) |
| High | No `files` allowlist in `electron-builder` config — root cause of the above and of dev-file bloat (§1, §3) | **Fixed** |
| Medium | `dist/` build was stale, predated a recent cleanup commit | **Fixed** — rebuilt |
| Medium | Default Electron app menu not suppressed — DevTools/Reload reachable in production (§2) | Open |
| Low | No renderer-side global error/rejection handler — production errors leave no trace (§5, §6) | Open |
| Info | 17 Dependabot vulnerabilities (4 high/9 moderate/4 low) flagged on GitHub, not yet triaged | Open (outside file-level scope) |
| Info | Spotify uses a shared client_id/secret model (Authorization Code flow) rather than PKCE — standard for desktop OAuth clients but worth migrating away from the client-secret requirement long-term | Open (future improvement, not a blocker) |

Part 2 (manual validation) has not started yet.

---

## PART 2 — MANUAL VALIDATION (USER)

Pending — to be run interactively, one step at a time.

---

## FINAL REPORT

Not yet generated — pending completion of Part 2, and pending your decision on the Critical secrets finding above.
