// Produces docs/pwa/ — packages/core's servable files plus this package's
// own manifest.json, service-worker.js, platform/, and icons/. Run via
// "npm run sync:pwa" from the repo root (or `node
// packages/pwa/scripts/build.mjs` directly). docs/pwa/ is a generated
// mirror — never hand-edit it, re-run this script instead.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "../../../scripts/lib/syncCore.mjs";

const pwaDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(pwaDir));
const destDir = path.join(repoRoot, "docs", "pwa");

syncCoreInto(destDir);

const PWA_ENTRIES = ["manifest.json", "service-worker.js", "platform", "icons"];
for (const entry of PWA_ENTRIES) {
  const src = path.join(pwaDir, entry);
  if (existsSync(src)) {
    cpSync(src, path.join(destDir, entry), { recursive: true });
  }
}

console.log(`Synced ${PWA_ENTRIES.join(", ")} from packages/pwa -> ${destDir}`);
