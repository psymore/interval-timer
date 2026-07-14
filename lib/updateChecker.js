import { app } from "electron";

import { createLogger } from "./logger.js";

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
