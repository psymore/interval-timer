// Produces docs/pwa/ — packages/core's servable files plus this package's
// own manifest.json, service-worker.js, platform/, and icons/. Run via
// "npm run sync:pwa" from the repo root (or `node
// packages/pwa/scripts/build.mjs` directly). docs/pwa/ is a generated
// mirror — never hand-edit it, re-run this script instead.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "../../../scripts/lib/syncCore.mjs";

const pwaDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(pwaDir));
const destDir = path.join(repoRoot, "docs", "pwa");

syncCoreInto(destDir);

const PWA_ENTRIES = ["manifest.json", "platform", "icons"];
for (const entry of PWA_ENTRIES) {
  const src = path.join(pwaDir, entry);
  if (existsSync(src)) {
    cpSync(src, path.join(destDir, entry), { recursive: true });
  }
}

// service-worker.js needs a cache name that changes on every build — a
// byte-for-byte copy would never trip the browser's service-worker update
// check (same bytes in == no install/activate re-fire == cache never gets
// purged == stale content served forever). Stamp CACHE_NAME with the build
// timestamp instead of cpSync-ing the file verbatim.
const swSource = readFileSync(path.join(pwaDir, "service-worker.js"), "utf8");
const swStamped = swSource.replace(
  /const CACHE_NAME = "interval-timer-pwa-v1";/,
  `const CACHE_NAME = "interval-timer-pwa-${Date.now()}";`,
);
writeFileSync(path.join(destDir, "service-worker.js"), swStamped);

console.log(
  `Synced ${[...PWA_ENTRIES, "service-worker.js"].join(", ")} from packages/pwa -> ${destDir}`,
);
