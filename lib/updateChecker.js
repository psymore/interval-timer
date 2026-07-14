import { app, ipcMain, shell } from "electron";

import { createLogger } from "./logger.js";
import { getMainWindow } from "./windows.js";

const log = createLogger("update-checker");

const REPO = "psymore/interval-timer";
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * Compares two "X.Y.Z" version strings numerically, segment by segment.
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) return numA > numB ? 1 : -1;
  }
  return 0;
}

async function fetchLatestRelease() {
  const res = await fetch(RELEASES_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.tag_name !== "string" || typeof data.html_url !== "string") {
    throw new Error("Unexpected GitHub release response shape");
  }
  return { version: data.tag_name.replace(/^v/, ""), url: data.html_url };
}

export async function checkForUpdate() {
  const currentVersion = app.getVersion();
  const { version: latestVersion, url: releaseUrl } = await fetchLatestRelease();
  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
  return { currentVersion, latestVersion, updateAvailable, releaseUrl };
}

export function initUpdateChecker({ store }) {
  checkForUpdate()
    .then(result => {
      log.info(
        `Update check: current=${result.currentVersion} latest=${result.latestVersion} available=${result.updateAvailable}`,
      );
      if (!result.updateAvailable) return;
      if (result.latestVersion === store.get("dismissedUpdateVersion")) return;

      // By the time this fetch resolves, js/renderer.js (a small local
      // script) has certainly already run and registered its
      // onUpdateAvailable listener — the network round-trip here takes far
      // longer than the local page's load+parse.
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("updates:available", {
          version: result.latestVersion,
          url: result.releaseUrl,
        });
      }
    })
    .catch(e => log.warn("Launch-time update check failed:", e.message));
}

export function registerUpdateIpc(store) {
  ipcMain.handle("updates:check", async () => {
    try {
      return await checkForUpdate();
    } catch (e) {
      log.error("Manual update check failed:", e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle("updates:dismiss", (_event, version) => {
    if (typeof version !== "string") {
      return { error: "Invalid version." };
    }
    try {
      store.set("dismissedUpdateVersion", version);
    } catch (e) {
      log.error("updates:dismiss error:", e.message);
      return { error: "Failed to save dismissed version." };
    }
  });

  ipcMain.handle("updates:open-releases", (_event, url) => {
    if (typeof url === "string" && url.startsWith("https://github.com/")) {
      shell.openExternal(url);
    }
  });
}
