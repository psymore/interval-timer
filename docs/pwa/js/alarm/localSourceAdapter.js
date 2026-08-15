// Strategy seam for "local file" alarm sources. Electron resolves a real
// filesystem path through the native file dialog and serves it via the
// local HTTP server's /local-audio/ route; the PWA has no filesystem
// access and instead stores the picked File as a Blob (keyed by filename)
// in IndexedDB, played back via an object URL. AlarmManager.initialize()
// (on every app launch/preset switch) and js/alarmModal.js (on every new
// user selection) both go through this one seam instead of branching on
// platform themselves.
//
// The PWA strategy lives in packages/pwa/platform/localBlobStrategy.js,
// deployed alongside this file as docs/pwa/platform/localBlobStrategy.js.
// It's loaded here via a dynamic import — never a static one —
// specifically so this file (and packages/core as a whole) stays
// deployable standalone to targets that never have a platform/ directory
// at all (real Electron, the ?demo=1 preview). The import path below is
// relative (`../../platform/...`), not root-relative (`/platform/...`) —
// GitHub Pages serves this project's docs/ under a `/interval-timer/`
// path prefix, not the domain root, so a root-relative import would
// resolve to the wrong URL there even though it would happen to work
// under a plain `npx serve docs/pwa` local test (verified: no CNAME file
// in docs/, so there's no custom domain putting Pages at a bare root).

const electronStrategy = {
  async pick() {
    return window.electronAPI.getFilePath();
  },
  async fromDroppedFile(file) {
    return window.electronAPI.getPathForFile(file);
  },
  async registerExisting(value) {
    const result = await window.electronAPI.alarmUseLocalPath(value);
    return !result?.error;
  },
  async getPlayableUrl(value) {
    return `${window.location.origin}/local-audio/${encodeURIComponent(value)}`;
  },
  async exists(value) {
    const [ok] = await window.electronAPI.alarmCheckPathsExist([value]);
    return ok;
  },
};

let strategyPromise = null;

async function resolveStrategy() {
  if (window.electronAPI?.__platform === "pwa") {
    const { pwaLocalSourceStrategy } = await import("../../platform/localBlobStrategy.js");
    return pwaLocalSourceStrategy;
  }
  return electronStrategy;
}

function getStrategy() {
  if (!strategyPromise) strategyPromise = resolveStrategy();
  return strategyPromise;
}

export async function pickLocalSource() {
  return (await getStrategy()).pick();
}

export async function localSourceFromDroppedFile(file) {
  return (await getStrategy()).fromDroppedFile(file);
}

export async function registerExistingLocalSource(value) {
  return (await getStrategy()).registerExisting(value);
}

export async function getPlayableUrl(value) {
  return (await getStrategy()).getPlayableUrl(value);
}

export async function localSourceExists(value) {
  return (await getStrategy()).exists(value);
}
