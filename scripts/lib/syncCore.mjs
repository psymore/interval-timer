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
