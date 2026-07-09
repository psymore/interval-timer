# Turkish Language Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language toggle to `docs/index.html` (the GitHub Pages landing page) that switches all visible body copy between English and Turkish, persists the choice across visits, and syncs the giscus comment widget's own UI language.

**Architecture:** A single new plain-JS file (`docs/assets/i18n.js`, loaded via `<script defer>`, no module system) holds a `translations` lookup object and an `applyLanguage(lang)` function that rewrites `[data-i18n]`/`[data-i18n-html]`/`[data-i18n-alt]` elements already marked up in `docs/index.html`. A toggle button in the nav bar calls it. No build step, no new dependency, no second HTML file.

**Tech Stack:** Vanilla JS (ES2017+, no bundler), plain CSS already in `docs/index.html`'s `<style>` block, Node.js (already a dev dependency of the repo) for a standalone translation-key consistency check.

## Global Constraints

- No build step and no new npm dependency — `docs/` is served as-is by GitHub Pages.
- This repo has no test suite or lint script configured (see root `CLAUDE.md`); verification here is a small standalone Node script (checked into the repo, run manually) plus manual browser checks — there is no CI to wire it into.
- `<title>`, `<meta name="description">`, and the Open Graph tags stay English — out of scope per the spec (static site can't vary them per visitor).
- Default language on first visit is English; no `navigator.language` auto-detection.
- Persisted via `localStorage` key `"interval-timer-lang"`, values `"en"` / `"tr"`; all reads/writes wrapped in `try/catch` (privacy mode can throw).
- Giscus's `data-lang="en"` script attribute only sets the *initial* load language; runtime changes go through `iframe.contentWindow.postMessage({ giscus: { setConfig: { lang } } }, "https://giscus.app")` on the injected `iframe.giscus-frame`.
- Full translation table and per-element rationale live in `docs/superpowers/specs/2026-07-09-turkish-i18n-design.md` — treat that file as the source of truth for copy text.

---

### Task 1: Mark up translatable elements and add the translation data

**Files:**
- Modify: `docs/index.html` — add `data-i18n`, `data-i18n-html`, or `data-i18n-alt` attributes to every translatable element listed below.
- Create: `docs/assets/i18n.js` — `translations` object only (behavior added in Task 2).
- Create: `docs/assets/i18n-check.js` — standalone Node script that verifies every `data-i18n*` key used in `docs/index.html` has a matching entry in both `translations.en` and `translations.tr`, and flags any translation key nothing references. Kept permanently as a cheap guard against future copy edits silently breaking a language (this repo has no test runner to catch that otherwise).

**Interfaces:**
- Produces: `docs/assets/i18n.js` exposing a top-level `const translations = { en: {...}, tr: {...} }` (plain script, no `export` — loaded via `<script src="assets/i18n.js">`, consumed by `window`-scope code in Task 2).
- Produces: `docs/assets/i18n-check.js`, runnable via `node docs/assets/i18n-check.js`, exit code 0 on success / 1 on failure.

- [ ] **Step 1: Write the consistency check script**

Create `docs/assets/i18n-check.js`:

```js
// Guards against translation drift: every data-i18n* attribute in
// index.html must have a matching key in both languages below, and every
// defined key must be referenced by something. Run manually — this repo
// has no test runner to wire it into.
const fs = require("fs");
const path = require("path");

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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node docs/assets/i18n-check.js`
Expected: fails with `Error: ENOENT ... i18n.js` (the file doesn't exist yet).

- [ ] **Step 3: Create the translations data file**

Create `docs/assets/i18n.js`:

```js
const translations = {
  en: {
    "nav.features": "Features",
    "nav.feedback": "Feedback",
    "nav.source": "Source",
    "hero.eyebrow": "Free · Windows · No account needed",
    "hero.h1": "Work. Break. Repeat.<br />Wake up to <em>your</em> music, not a beep.",
    "hero.lede": "An interval &amp; countdown timer whose alarm can be a local file, a YouTube video, or a real Spotify track — plus a background-safe tick loop that keeps counting even while the window is minimized.",
    "hero.download": "⬇ Download for Windows",
    "hero.releases": "See all releases",
    "hero.stat": "free · open source · unsigned installer (SmartScreen may warn once)",
    "hero.shot.alt": "Interval Timer app showing an 18:42 countdown mid-work session",
    "features.eyebrow": "What it does",
    "features.h2": "Small, focused, and it stays out of your way",
    "features.card1.h3": "Alarms that don't sound like alarms",
    "features.card1.p": "Point the alarm at a local sound file, a YouTube video, or a Spotify track. It falls back to a local sound automatically if a source is unreachable.",
    "features.card2.h3": "Keeps ticking, even minimized",
    "features.card2.p": "Built on an elapsed-time loop rather than tick-counting, so it self-corrects instead of drifting or freezing when the window is backgrounded.",
    "features.card3.h3": "Presets for how you actually work",
    "features.card3.p": "Save your usual work/break/loop combinations and switch between them from a dropdown instead of re-typing numbers every session.",
    "features.card4.h3": "An always-on-top mini window",
    "features.card4.p": "Pop out a small frameless timer that floats above everything else while you work, synced live with the main window.",
    "feedback.h2": "Found a bug? Missing something?",
    "feedback.p": "This is a small, actively-developed project — reports and feature requests go straight into what gets built next.",
    "feedback.discussion": "Open a discussion →",
    "feedback.giscus.h3": "Or leave a comment right here",
    "footer.line": "Interval Timer — MIT-style personal project.",
    "footer.download": "Download",
    "footer.discussions": "Discussions"
  },
  tr: {
    "nav.features": "Özellikler",
    "nav.feedback": "Geri Bildirim",
    "nav.source": "Kaynak Kod",
    "hero.eyebrow": "Ücretsiz · Windows · Hesap gerekmez",
    "hero.h1": "Çalış. Mola ver. Tekrarla.<br />Bir bip sesine değil, <em>kendi</em> müziğine uyan.",
    "hero.lede": "Alarmı yerel bir dosya, bir YouTube videosu ya da gerçek bir Spotify parçası olabilen bir aralık ve geri sayım sayacı — pencere küçültülse bile saymaya devam eden arka plan güvenli bir döngüyle.",
    "hero.download": "⬇ Windows için indir",
    "hero.releases": "Tüm sürümleri gör",
    "hero.stat": "ücretsiz · açık kaynak · imzasız kurulum dosyası (SmartScreen bir kez uyarabilir)",
    "hero.shot.alt": "Interval Timer uygulaması, çalışma seansı ortasında 18:42 geri sayımı gösteriyor",
    "features.eyebrow": "Ne yapar",
    "features.h2": "Küçük, odaklı ve yolunuza çıkmıyor",
    "features.card1.h3": "Alarm gibi çalmayan alarmlar",
    "features.card1.p": "Alarmı yerel bir ses dosyasına, bir YouTube videosuna ya da bir Spotify parçasına yönlendirin. Kaynağa ulaşılamazsa otomatik olarak yerel sese döner.",
    "features.card2.h3": "Küçültülse bile saymaya devam eder",
    "features.card2.p": "Tık saymak yerine geçen süreye dayalı bir döngü üzerine kurulu; bu sayede pencere arka plana alındığında kaymak ya da donmak yerine kendini düzeltir.",
    "features.card3.h3": "Gerçekten nasıl çalıştığınıza göre hazır ayarlar",
    "features.card3.p": "Sık kullandığınız çalışma/mola/döngü kombinasyonlarını kaydedin ve her seansta yeniden yazmak yerine bir açılır menüden aralarında geçiş yapın.",
    "features.card4.h3": "Her zaman üstte kalan bir mini pencere",
    "features.card4.p": "Çalışırken her şeyin üzerinde yüzen, çerçevesiz küçük bir sayacı ayrı bir pencerede açın; ana pencereyle canlı olarak senkronize.",
    "feedback.h2": "Bir hata mı buldunuz? Bir şey mi eksik?",
    "feedback.p": "Bu küçük, aktif olarak geliştirilen bir proje — bildirimler ve özellik istekleri doğrudan bir sonraki geliştirmelere yansıyor.",
    "feedback.discussion": "Bir tartışma başlat →",
    "feedback.giscus.h3": "Ya da doğrudan buraya bir yorum bırakın",
    "footer.line": "Interval Timer — MIT tarzı kişisel proje.",
    "footer.download": "İndir",
    "footer.discussions": "Tartışmalar"
  }
};
```

- [ ] **Step 4: Add `data-i18n*` attributes to `docs/index.html`**

Apply these exact attribute additions (element identified by its current text/attribute; only the opening tag changes shown):

```html
<!-- nav -->
<a href="#features" data-i18n="nav.features">Features</a>
<a href="#feedback" data-i18n="nav.feedback">Feedback</a>
<a href="https://github.com/psymore/interval-timer" data-i18n="nav.source">Source</a>

<!-- hero -->
<div class="eyebrow" data-i18n="hero.eyebrow">Free · Windows · No account needed</div>
<h1 data-i18n-html="hero.h1">Work. Break. Repeat.<br />Wake up to <em>your</em> music, not a beep.</h1>
<p class="lede" data-i18n="hero.lede">
  An interval &amp; countdown timer whose alarm can be a local file, a YouTube
  video, or a real Spotify track — plus a background-safe tick loop that
  keeps counting even while the window is minimized.
</p>

<a class="btn-download" href="https://github.com/psymore/interval-timer/releases/latest" data-i18n="hero.download">
  ⬇ Download for Windows
</a>
<a class="btn-secondary" href="https://github.com/psymore/interval-timer/releases" data-i18n="hero.releases">
  See all releases
</a>

<span class="hero-meta" data-i18n="hero.stat">free · open source · unsigned installer (SmartScreen may warn once)</span>

<img src="assets/screenshot.png" data-i18n-alt="hero.shot.alt" alt="Interval Timer app showing an 18:42 countdown mid-work session" />

<!-- features -->
<div class="eyebrow" data-i18n="features.eyebrow">What it does</div>
<h2 data-i18n="features.h2">Small, focused, and it stays out of your way</h2>

<h3><span class="dot"></span><span data-i18n="features.card1.h3">Alarms that don't sound like alarms</span></h3>
<p data-i18n="features.card1.p">Point the alarm at a local sound file, a YouTube video, or a Spotify
  track. It falls back to a local sound automatically if a source is
  unreachable.</p>

<h3><span class="dot"></span><span data-i18n="features.card2.h3">Keeps ticking, even minimized</span></h3>
<p data-i18n="features.card2.p">Built on an elapsed-time loop rather than tick-counting, so it
  self-corrects instead of drifting or freezing when the window is
  backgrounded.</p>

<h3><span class="dot"></span><span data-i18n="features.card3.h3">Presets for how you actually work</span></h3>
<p data-i18n="features.card3.p">Save your usual work/break/loop combinations and switch between
  them from a dropdown instead of re-typing numbers every session.</p>

<h3><span class="dot"></span><span data-i18n="features.card4.h3">An always-on-top mini window</span></h3>
<p data-i18n="features.card4.p">Pop out a small frameless timer that floats above everything else
  while you work, synced live with the main window.</p>

<!-- feedback -->
<h2 data-i18n="feedback.h2">Found a bug? Missing something?</h2>
<p data-i18n="feedback.p">This is a small, actively-developed project — reports and feature
  requests go straight into what gets built next.</p>
<a class="btn-secondary" href="https://github.com/psymore/interval-timer/discussions" data-i18n="feedback.discussion">
  Open a discussion →
</a>

<h3 data-i18n="feedback.giscus.h3">Or leave a comment right here</h3>

<!-- footer -->
<span data-i18n="footer.line">Interval Timer — MIT-style personal project.</span>
<a href="https://github.com/psymore/interval-timer/releases/latest" data-i18n="footer.download">Download</a>
<a href="https://github.com/psymore/interval-timer/discussions" data-i18n="footer.discussions">Discussions</a>
```

Note: each feature-card `<h3>` has a leading `<span class="dot"></span>` decorator. `data-i18n` goes on a second, dedicated `<span>` wrapping just the text (as shown above), not on the `<h3>` itself — `applyLanguage`'s `textContent` assignment would otherwise wipe out the `.dot` span.

- [ ] **Step 5: Run the check again to confirm it passes**

Run: `node docs/assets/i18n-check.js`
Expected: `PASS: all 27 data-i18n keys match translations.en and translations.tr, no unused keys`

- [ ] **Step 6: Commit**

```bash
git add docs/index.html docs/assets/i18n.js docs/assets/i18n-check.js
git commit -m "Add Turkish translation data and data-i18n markup to landing page"
```

---

### Task 2: Implement the language toggle (render + persist)

**Files:**
- Modify: `docs/assets/i18n.js` — append `getStoredLanguage()`, `storeLanguage()`, `applyLanguage()`, `initLanguage()`, and a temporary no-op `syncGiscusLanguage()` stub (real implementation in Task 3).
- Modify: `docs/index.html` — add the toggle `<button>` in the nav bar, its CSS, and the `<script src="assets/i18n.js" defer></script>` tag before `</body>`.

**Interfaces:**
- Consumes: `translations` object from Task 1 (`docs/assets/i18n.js`), `data-i18n`/`data-i18n-html`/`data-i18n-alt` attributes from Task 1 (`docs/index.html`).
- Produces: `applyLanguage(lang)` — global function, `lang` is `"en"` or `"tr"`, no return value. `initLanguage()` — called once on `DOMContentLoaded`, no params, no return value. Button `id="lang-toggle"`. Both consumed by Task 3 (`applyLanguage` calls `syncGiscusLanguage(lang)`, which Task 3 replaces).

- [ ] **Step 1: Append the toggle logic to `docs/assets/i18n.js`**

Add to the end of `docs/assets/i18n.js` (after the `translations` object):

```js
function getStoredLanguage() {
  try {
    return localStorage.getItem("interval-timer-lang");
  } catch {
    return null;
  }
}

function storeLanguage(lang) {
  try {
    localStorage.setItem("interval-timer-lang", lang);
  } catch {
    // localStorage unavailable (privacy mode, disabled storage) — the
    // toggle still works for this page view, it just won't persist.
  }
}

function syncGiscusLanguage(lang) {
  // Implemented in Task 3.
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  const strings = translations[lang];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (strings[key] !== undefined) el.textContent = strings[key];
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (strings[key] !== undefined) el.innerHTML = strings[key];
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    const key = el.getAttribute("data-i18n-alt");
    if (strings[key] !== undefined) el.setAttribute("alt", strings[key]);
  });

  const toggle = document.getElementById("lang-toggle");
  if (toggle) toggle.textContent = lang === "en" ? "TR" : "EN";

  storeLanguage(lang);
  syncGiscusLanguage(lang);
}

function initLanguage() {
  const stored = getStoredLanguage();
  const lang = stored === "tr" ? "tr" : "en";
  applyLanguage(lang);

  document.getElementById("lang-toggle").addEventListener("click", () => {
    const current = document.documentElement.lang === "tr" ? "tr" : "en";
    applyLanguage(current === "en" ? "tr" : "en");
  });
}

document.addEventListener("DOMContentLoaded", initLanguage);
```

- [ ] **Step 2: Add the toggle button, its CSS, and the script tag to `docs/index.html`**

Add to the `<style>` block, after the `.navlinks a:hover` rule:

```css
    .lang-toggle {
      background: none;
      border: 1px solid var(--border-quiet);
      color: var(--ink-muted);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 150ms ease, color 150ms ease;
    }

    .lang-toggle:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
```

In the `<nav>` markup, add the button as the last child of `.navlinks`:

```html
      <div class="navlinks">
        <a href="#features" data-i18n="nav.features">Features</a>
        <a href="#feedback" data-i18n="nav.feedback">Feedback</a>
        <a href="https://github.com/psymore/interval-timer" data-i18n="nav.source">Source</a>
        <button id="lang-toggle" class="lang-toggle" type="button" aria-label="Switch language">TR</button>
      </div>
```

Before `</body>`, add:

```html
  <script src="assets/i18n.js" defer></script>
</body>
```

- [ ] **Step 3: Manual verification**

Open `docs/index.html` directly in a browser (double-click the file, or `start docs/index.html` on Windows).

Expected:
1. Page loads in English, toggle button reads "TR".
2. Click the toggle — every section's text switches to Turkish instantly (hero `<em>` styling on "kendi" is preserved), button now reads "EN".
3. Reload the page — it comes back in Turkish (persisted via `localStorage`).
4. Click the toggle back to English, reload — stays English.

- [ ] **Step 4: Commit**

```bash
git add docs/assets/i18n.js docs/index.html
git commit -m "Wire up language toggle button with localStorage persistence"
```

---

### Task 3: Sync giscus comment widget language

**Files:**
- Modify: `docs/assets/i18n.js` — replace the `syncGiscusLanguage()` stub from Task 2 with the real implementation.

**Interfaces:**
- Consumes: `applyLanguage(lang)` from Task 2, which already calls `syncGiscusLanguage(lang)` on every language change.
- Produces: nothing consumed by later tasks — this is the last behavioral piece.

- [ ] **Step 1: Implement `syncGiscusLanguage`**

Replace the stub in `docs/assets/i18n.js`:

```js
function syncGiscusLanguage(lang) {
  const wrap = document.querySelector(".giscus-wrap");
  if (!wrap) return;

  const sendConfig = (iframe) => {
    iframe.contentWindow.postMessage(
      { giscus: { setConfig: { lang } } },
      "https://giscus.app"
    );
  };

  const existing = wrap.querySelector("iframe.giscus-frame");
  if (existing) {
    sendConfig(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const iframe = wrap.querySelector("iframe.giscus-frame");
    if (iframe) {
      sendConfig(iframe);
      observer.disconnect();
    }
  });
  observer.observe(wrap, { childList: true, subtree: true });
}
```

- [ ] **Step 2: Manual verification**

Open `docs/index.html` in a browser, scroll to the comment section, wait for the giscus widget to finish loading (it shows its own "Sign in with GitHub to comment" UI in English by default).

Expected:
1. Click the language toggle — the giscus widget's own labels/buttons switch to Turkish, not just the surrounding page copy.
2. Toggle back to English — giscus switches back too.
3. Reload the page and click the toggle immediately (before giscus visibly finishes loading) — once giscus appears, it still ends up in the requested language (confirms the `MutationObserver` path, not just the "already loaded" path).

- [ ] **Step 3: Commit**

```bash
git add docs/assets/i18n.js
git commit -m "Sync giscus comment widget language with the page toggle"
```

---

### Task 4: Full spec verification pass

**Files:** none (verification only; fix forward in the relevant file from Tasks 1-3 if something's wrong).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing — this is the final acceptance gate for the feature.

- [ ] **Step 1: Re-run the automated consistency check**

Run: `node docs/assets/i18n-check.js`
Expected: `PASS: all 27 data-i18n keys match translations.en and translations.tr, no unused keys`

- [ ] **Step 2: Run the full manual checklist from the spec**

Open `docs/index.html` in a browser and work through each item:

1. Clear `localStorage` for the page (DevTools → Application → Local Storage → right-click → Clear), reload — confirm English + toggle reads "TR".
2. Click toggle — confirm every section (nav, hero, both feature-grid rows, feedback, giscus heading, footer) switches to Turkish, hero `<em>` styling survives, button reads "EN".
3. Reload — confirm it stays Turkish.
4. Toggle back to English, reload — confirm it stays English.
5. With the comment widget visible, toggle language — confirm giscus's own UI switches too.
6. Open the page in an incognito window with DevTools → Application → Storage → "Block" enabled for `localStorage` (or use `about:blank` storage-partitioned mode) — confirm the toggle still works for that single view and no errors appear in the console.

If any step fails, fix it in the relevant file from Task 1, 2, or 3, re-run Step 1, and re-walk the checklist before continuing.

- [ ] **Step 3: Commit (only if Step 2 required fixes)**

```bash
git add docs/assets/i18n.js docs/index.html
git commit -m "Fix issues found in Turkish i18n verification pass"
```

If no fixes were needed, skip this commit — Task 3's commit is the final state.
