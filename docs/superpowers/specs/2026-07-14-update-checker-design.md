# Update checker — design

## Problem

Interval Timer has no way for an installed copy to learn that a newer version
exists. Releases are cut manually to GitHub Releases (confirmed: no
`electron-updater`/`autoUpdater` wired in — it only appears as a transitive
dependency in `package-lock.json`, never imported). A user only finds out
about `vX.Y.Z` by revisiting the GitHub Releases page or the landing page
themselves, or by watching the repo on GitHub.

## Goals

- Tell the user, inside the app, when a newer version has shipped.
- Never touch the installed app or download anything automatically — this is
  a notify-only feature. Actually downloading/installing is out of scope.
- Fit the app's existing patterns: `lib/xIpc.js` modules registered from
  `main.js`, `electron-store` for persisted state, IPC surface exposed
  through `preload.cjs`, dedicated small renderer modules (e.g. `js/presets.js`)
  rather than inlining UI into existing controllers.

## Non-goals

- Silent background download/install (`electron-updater` full auto-update
  flow). Rejected: it expects a code-signed installer and a GitHub `publish`
  config in `electron-builder` that generates `latest.yml`/`app-update.yml`
  manifests on every release — real process overhead for a feature being
  deliberately kept notify-only, and this app's installer isn't signed
  (`signExecutable: false` in `package.json`).
- One-click direct `.exe` download inside the app. Rejected in favor of
  linking out to the Releases page — same reasoning, keeps the app from ever
  touching an unverified binary itself.
- Mobile/other platforms — this app is Windows-only.

## Architecture

A new module, `lib/updateChecker.js`, following the same `initX()` /
`registerXIpc(store)` shape as `lib/settingsIpc.js`. `main.js` wires it in
next to the other `lib/*Ipc.js` registrations, and triggers the first check
right after `createWindow()` resolves in the `app.whenReady()` block (same
place the tray and power-save blocker get set up).

### Check mechanism

Plain `fetch` to GitHub's REST API from the main process:

```
GET https://api.github.com/repos/psymore/interval-timer/releases/latest
```

No new dependency, no `electron-builder` publish config changes, no
code-signing prerequisite. Response `tag_name` (e.g. `"v1.1.0"`) has its
leading `v` stripped and is compared against `app.getVersion()` with a small
hand-rolled comparator — versions here are always plain `X.Y.Z`, so a
three-part numeric split-and-compare is enough; no `semver` package needed.

Unauthenticated GitHub REST calls are capped at 60 requests/hour per IP.
One check per app launch, per user, is nowhere near that ceiling.

### IPC surface

Mirrors the existing `spotify:open-track` pattern for opening external URLs:
`lib/windows.js` denies all in-app navigation and `window.open` on purpose
(`will-navigate` / `setWindowOpenHandler` both blocked, to keep the
`electronAPI` bridge from ever leaking to an untrusted origin), so opening
the Releases page has to go through `shell.openExternal` in the main
process — a plain `<a href>` would silently do nothing.

- `updates:check` (invoke, no args) → `{ currentVersion, latestVersion, updateAvailable, releaseUrl }` or `{ error: string }`.
  Used by both the launch-time check and the manual "Check for updates" button — always does a live fetch, never reads cached/dismissed state.
- `updates:dismiss` (invoke, `version: string`) → persists `version` to `electron-store` under a new `dismissedUpdateVersion` field (added to the existing `defaults` block in `main.js`, alongside `presets`/`activePresetId`/`language`).
- `updates:open-releases` (invoke, `url: string`) → `shell.openExternal(url)`.

`preload.cjs` gains matching entries: `updatesCheck()`, `updatesDismiss(version)`, `updatesOpenReleases(url)`, `onUpdateAvailable(cb)`.

### Renderer

A new `js/updates.js` module, wired from `js/renderer.js` the same way
`onMiniAction`/`onMiniClosed` listeners are registered today.

- Launch check: main process only pushes an `updates:available` event (via
  `mainWindow.webContents.send`) if `updateAvailable && latestVersion !== dismissedUpdateVersion`.
  `js/updates.js` listens for it and renders a small dismissible banner in
  the **main window only** — not the mini window, which is deliberately
  cramped and just mirrors main-window state, not a place to introduce new
  UI.
- Banner has two actions: "Download vX.Y.Z" → `updatesOpenReleases(releaseUrl)`;
  dismiss (×) → `updatesDismiss(latestVersion)` and hide the banner. Either
  action marks that version seen — the banner won't reappear for the same
  version, but a genuinely newer one will still show.
- Manual check: a "Check for updates" row added to the existing settings
  modal, calling `updatesCheck()` directly (bypassing the dismissed-version
  filter — a manual check always reports the live truth) and showing one of:
  "You're up to date (vX.Y.Z)", the same banner UI if a newer version
  exists, or "Couldn't check for updates" on failure.

## Data flow

```
main.js (whenReady, after createWindow)
  → updateChecker.checkOnLaunch(store)
      → fetch GitHub API
      → compare versions
      → if newer AND != dismissedUpdateVersion:
          mainWindow.webContents.send("updates:available", { version, url })
  → js/updates.js renders banner

Settings modal "Check for updates" click
  → electronAPI.updatesCheck()  (IPC invoke, always live)
  → renders inline result (up to date / banner / error)

Banner dismiss or Download click
  → electronAPI.updatesDismiss(version)  (invoke)
  → electron-store.dismissedUpdateVersion = version
```

## Error handling

Network failure, GitHub rate-limiting, or an unexpected response shape all
resolve to `{ error: string }` from `updates:check`, logged via
`createLogger("update-checker")`.

- **Launch-time check failing**: fully silent. A background check that
  can't reach GitHub should never interrupt the user — no banner, no error
  toast, just a log line.
- **Manual check failing**: surfaced inline in the settings modal as
  "Couldn't check for updates" — the user explicitly asked, so silence would
  read as broken.

## Testing

No test suite exists in this repo (`npm test` is a stub). Verification is
manual:

1. Temporarily fake an older `app.getVersion()` (or point the fetch at a
   fixture/older tag) and confirm the banner appears once on launch.
2. Dismiss it, restart the app, confirm it does **not** reappear for that
   same version.
3. Use the settings modal's manual check and confirm it reports "up to
   date" correctly against the real current release.
4. Kill network access and confirm the launch check fails silently (no
   banner, no crash) while the manual check surfaces the error message.
