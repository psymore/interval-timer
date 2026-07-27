// Copies the app's renderer files (everything index.html actually loads:
// itself, js/, css/, assets/) into docs/app/, so GitHub Pages — which only
// serves docs/ — can load the real app in an iframe. main.js, preload.cjs,
// and lib/** are Electron-main-only and are deliberately not copied; the
// iframe never needs them. Run this after any change to the copied files,
// before deploying docs/ to Pages. docs/app/ is a generated mirror — never
// hand-edit it, re-run this script instead.
import { cpSync, rmSync, existsSync } from "node:fs";
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

console.log(`Synced ${ENTRIES.join(", ")} -> docs/app/`);
