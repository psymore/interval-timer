// Pre-package step, run before electron-builder (see package.json's
// build/dist scripts). electron-builder's file globbing is scoped to this
// package's own directory and can't reach the sibling packages/core — this
// copies it in as a gitignored core/ subfolder first. main.js resolves
// packages/core directly (no copy) in dev; this copy only exists for
// packaged builds. Re-run automatically by "npm run build"/"npm run dist"
// — never hand-edited.
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "../../../scripts/lib/syncCore.mjs";

const electronDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
syncCoreInto(path.join(electronDir, "core"));
