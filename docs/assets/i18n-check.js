// Guards against translation drift: every data-i18n* attribute in
// index.html must have a matching key in both languages below, and every
// defined key must be referenced by something. Run manually — this repo
// has no test runner to wire it into.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.join(__dirname, "..", "index.html");
const i18nPath = path.join(__dirname, "i18n.js");

const html = fs.readFileSync(htmlPath, "utf8");
const i18nSrc = fs.readFileSync(i18nPath, "utf8");

const attrPattern = /data-i18n(?:-html|-alt)?="([^"]+)"/g;
const usedKeys = new Set();
let match;
while ((match = attrPattern.exec(html))) {
  usedKeys.add(match[1]);
}

const translationsMatch = i18nSrc.match(/const translations = (\{[\s\S]*?\n\});/);
if (!translationsMatch) {
  console.error("Could not find `const translations = {...};` in i18n.js");
  process.exit(1);
}
const translations = eval(`(${translationsMatch[1]})`);

const languages = Object.keys(translations);
if (languages.length !== 2 || !languages.includes("en") || !languages.includes("tr")) {
  console.error(`Expected exactly "en" and "tr" languages, found: ${languages.join(", ")}`);
  process.exit(1);
}

let failed = false;

for (const key of usedKeys) {
  for (const lang of languages) {
    if (!(key in translations[lang])) {
      console.error(`Missing key "${key}" in translations.${lang}`);
      failed = true;
    }
  }
}

const definedKeys = new Set(Object.keys(translations.en));
for (const key of definedKeys) {
  if (!usedKeys.has(key)) {
    console.error(`Unused translation key "${key}" (no data-i18n* attribute references it)`);
    failed = true;
  }
}

if (failed) {
  console.error(`\nFAIL: ${usedKeys.size} keys used in HTML, ${definedKeys.size} defined in translations.en`);
  process.exit(1);
}

console.log(`PASS: all ${usedKeys.size} data-i18n keys match translations.en and translations.tr, no unused keys`);
