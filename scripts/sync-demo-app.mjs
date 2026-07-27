// Copies the app's renderer files (everything index.html actually loads:
// itself, js/, css/, assets/) into docs/app/, so GitHub Pages — which only
// serves docs/ — can load the real app in an iframe. main.js, preload.cjs,
// and the rest of lib/** are Electron-main-only and are deliberately not
// copied; the iframe never needs them. lib/logger.js is the one exception:
// js/alarmModal.js and js/alarm/AlarmManager.js import `createLogger` from
// it directly (it's dual-environment-safe, guards `typeof process`), so it
// has to ship alongside js/ or those modules 404 on import and the whole
// renderer module graph silently fails to execute in the iframe. Run this
// after any change to the copied files, before deploying docs/ to Pages.
// docs/app/ is a generated mirror — never hand-edit it, re-run this script
// instead.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destDir = path.join(repoRoot, "docs", "app");

const ENTRIES = ["index.html", "js", "css", "assets"];

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true, force: true });
}

for (const entry of ENTRIES) {
  cpSync(path.join(repoRoot, entry), path.join(destDir, entry), {
    recursive: true,
  });
}

mkdirSync(path.join(destDir, "lib"), { recursive: true });
cpSync(
  path.join(repoRoot, "lib", "logger.js"),
  path.join(destDir, "lib", "logger.js"),
);

console.log(`Synced ${ENTRIES.join(", ")}, lib/logger.js -> docs/app/`);
