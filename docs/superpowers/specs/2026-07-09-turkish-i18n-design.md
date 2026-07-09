# Turkish language toggle for the landing page

## Goal

Let visitors to `docs/index.html` (the GitHub Pages landing page) view the entire
page in Turkish, with the choice persisted across visits, without splitting the
page into a second URL (which would fragment the giscus comment thread, since
giscus maps threads by `pathname`).

## Approach: `data-i18n` attributes + in-page translation object

A small vanilla-JS layer, no build step, no dependency:

- Every translatable element gets a `data-i18n="<key>"` attribute.
- A `translations = { en: {...}, tr: {...} }` object in an inline `<script>`
  maps each key to its string in each language.
- `applyLanguage(lang)`:
  - Sets `document.documentElement.lang = lang`.
  - Walks all `[data-i18n]` elements and sets `textContent` to the matching
    string.
  - For the one element that needs embedded markup (the hero `<h1>`, which
    wraps "your" in `<em>`), uses a separate `data-i18n-html` attribute so that
    element gets `innerHTML` instead of `textContent`. This is the only
    `data-i18n-html` use on the page.
  - For the hero screenshot's `alt` text, uses `data-i18n-alt` (sets the `alt`
    attribute instead of content).
  - Updates the toggle button's label to show the *other* language (button
    reads "TR" while on English, "EN" while on Turkish).
  - Syncs giscus's language (see below).
  - Persists the choice to `localStorage` (best-effort; see Error handling).
- A toggle button (plain text button, top-right of the nav bar, next to the
  existing Features/Feedback/Source links) calls `applyLanguage()` with
  whichever language isn't currently active.
- On page load: read `localStorage`, default to `"en"` if unset or unreadable.
  No `navigator.language` auto-detection — keeps first-load behavior
  predictable and avoids a flash-of-wrong-language while JS decides.

### Why this over the alternatives

- **A second HTML file (`index.tr.html`)** was the main alternative. Rejected:
  it splits the giscus thread in two (mapping is by pathname), needs a language
  switcher that's actually a page navigation (worse persistence story), and
  doubles the maintenance surface for every future copy edit.
- **A full i18n library** (e.g. i18next) is overkill for one page with ~25
  strings and no plurals/interpolation needs — plain object lookup is enough.

## Scope: what gets translated

All visible body copy: nav links, hero eyebrow/heading/lede, both CTA buttons,
the download-stat caption, the hero screenshot alt text, the features section
heading and all four feature cards, the feedback section heading/body/button,
the giscus section heading, and the footer line + footer links.

**Out of scope, stays English:** `<title>`, `<meta name="description">`, and
the Open Graph tags. These serve search engines and social-link previews, not
in-page visitors, and translating them would need server-side content
negotiation to matter (a static GitHub Pages site can't vary them by visitor).

## Giscus language sync

The giscus `<script>` tag's `data-lang="en"` only sets the *initial* load
language of the iframe it injects — it can't be changed by re-rendering the
script tag. Giscus supports runtime language changes via `postMessage`:

```js
iframe.contentWindow.postMessage(
  { giscus: { setConfig: { lang } } },
  "https://giscus.app"
);
```

The iframe (`iframe.giscus-frame`) is injected asynchronously by giscus's own
script, so it may not exist yet when `applyLanguage()` first runs (e.g. user
toggles language before giscus has finished loading). Handled with a
`MutationObserver` on the `.giscus-wrap` container: if the iframe isn't present
yet, the observer watches for it, sends the pending language once it appears,
then disconnects. If the toggle is clicked again before the iframe shows up,
the observer just sends whatever the latest requested language is when it
fires — no queue needed since only the last-requested language matters.

Giscus's supported language list includes `tr`, so no fallback mapping is
needed.

## Error handling

- **`localStorage` unavailable** (privacy mode, disabled storage): reading and
  writing are each wrapped in `try/catch`. On failure, the toggle still works
  for the current page view — it just won't persist across reloads. No error
  surfaced to the user; this is a nice-to-have, not a requirement.
- **Giscus iframe never appears** (ad blocker, script blocked, network
  failure): the `MutationObserver` simply never fires and is never explicitly
  torn down beyond the page lifetime — harmless, since it's a single lightweight
  observer on a small subtree. The rest of the page's language toggle is
  unaffected.

## Translation table

| Key | English | Turkish |
|---|---|---|
| `nav.features` | Features | Özellikler |
| `nav.feedback` | Feedback | Geri Bildirim |
| `nav.source` | Source | Kaynak Kod |
| `hero.eyebrow` | Free · Windows · No account needed | Ücretsiz · Windows · Hesap gerekmez |
| `hero.h1` (html) | Work. Break. Repeat.<br>Wake up to *your* music, not a beep. | Çalış. Mola ver. Tekrarla.<br>Bir bip sesine değil, *kendi* müziğine uyan. |
| `hero.lede` | An interval & countdown timer whose alarm can be a local file, a YouTube video, or a real Spotify track — plus a background-safe tick loop that keeps counting even while the window is minimized. | Alarmı yerel bir dosya, bir YouTube videosu ya da gerçek bir Spotify parçası olabilen bir aralık ve geri sayım sayacı — pencere küçültülse bile saymaya devam eden arka plan güvenli bir döngüyle. |
| `hero.download` | ⬇ Download for Windows | ⬇ Windows için indir |
| `hero.releases` | See all releases | Tüm sürümleri gör |
| `hero.stat` | free · open source · unsigned installer (SmartScreen may warn once) | ücretsiz · açık kaynak · imzasız kurulum dosyası (SmartScreen bir kez uyarabilir) |
| `hero.shot.alt` | Interval Timer app showing an 18:42 countdown mid-work session | Interval Timer uygulaması, çalışma seansı ortasında 18:42 geri sayımı gösteriyor |
| `features.eyebrow` | What it does | Ne yapar |
| `features.h2` | Small, focused, and it stays out of your way | Küçük, odaklı ve yolunuza çıkmıyor |
| `features.card1.h3` | Alarms that don't sound like alarms | Alarm gibi çalmayan alarmlar |
| `features.card1.p` | Point the alarm at a local sound file, a YouTube video, or a Spotify track. It falls back to a local sound automatically if a source is unreachable. | Alarmı yerel bir ses dosyasına, bir YouTube videosuna ya da bir Spotify parçasına yönlendirin. Kaynağa ulaşılamazsa otomatik olarak yerel sese döner. |
| `features.card2.h3` | Keeps ticking, even minimized | Küçültülse bile saymaya devam eder |
| `features.card2.p` | Built on an elapsed-time loop rather than tick-counting, so it self-corrects instead of drifting or freezing when the window is backgrounded. | Tık saymak yerine geçen süreye dayalı bir döngü üzerine kurulu; bu sayede pencere arka plana alındığında kaymak ya da donmak yerine kendini düzeltir. |
| `features.card3.h3` | Presets for how you actually work | Gerçekten nasıl çalıştığınıza göre hazır ayarlar |
| `features.card3.p` | Save your usual work/break/loop combinations and switch between them from a dropdown instead of re-typing numbers every session. | Sık kullandığınız çalışma/mola/döngü kombinasyonlarını kaydedin ve her seansta yeniden yazmak yerine bir açılır menüden aralarında geçiş yapın. |
| `features.card4.h3` | An always-on-top mini window | Her zaman üstte kalan bir mini pencere |
| `features.card4.p` | Pop out a small frameless timer that floats above everything else while you work, synced live with the main window. | Çalışırken her şeyin üzerinde yüzen, çerçevesiz küçük bir sayacı ayrı bir pencerede açın; ana pencereyle canlı olarak senkronize. |
| `feedback.h2` | Found a bug? Missing something? | Bir hata mı buldunuz? Bir şey mi eksik? |
| `feedback.p` | This is a small, actively-developed project — reports and feature requests go straight into what gets built next. | Bu küçük, aktif olarak geliştirilen bir proje — bildirimler ve özellik istekleri doğrudan bir sonraki geliştirmelere yansıyor. |
| `feedback.discussion` | Open a discussion → | Bir tartışma başlat → |
| `feedback.giscus.h3` | Or leave a comment right here | Ya da doğrudan buraya bir yorum bırakın |
| `footer.line` | Interval Timer — MIT-style personal project. | Interval Timer — MIT tarzı kişisel proje. |
| `footer.download` | Download | İndir |
| `footer.discussions` | Discussions | Tartışmalar |

Not translated (brand name / proper nouns, unchanged in both languages):
the "Interval Timer" brand text in the nav, and "GitHub" in the footer links.

## Verification plan (manual, no test suite in this repo)

1. Load the page fresh (clear `localStorage` for the site first) — confirm it
   renders in English and the toggle reads "TR".
2. Click the toggle — confirm every section's text switches to Turkish, the
   hero `<em>` styling on the swapped word is preserved, and the button now
   reads "EN".
3. Reload the page — confirm it comes back in Turkish (persistence worked).
4. Click the toggle back to English, reload, confirm it stays English.
5. With the comment widget visible, toggle language and confirm the giscus
   iframe's own UI (its buttons/labels) switches language too.
6. Open the page in a fresh incognito window with `localStorage` blocked via
   DevTools (Application → Storage → Block), confirm the toggle still works
   for that single view and no console errors appear.
