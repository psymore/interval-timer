// Copies packages/core's servable files into docs/app/, so GitHub Pages —
// which only serves docs/ — can load the real app in an iframe. Run this
// after any change to packages/core relevant to the demo, before deploying
// docs/ to Pages. docs/app/ is a generated mirror — never hand-edit it, re-
// run this script instead.
import { fileURLToPath } from "node:url";
import path from "node:path";

import { syncCoreInto } from "./lib/syncCore.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
syncCoreInto(path.join(repoRoot, "docs", "app"));
