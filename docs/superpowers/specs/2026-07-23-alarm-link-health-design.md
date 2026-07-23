# Alarm Link Health — Design

## Problem

With per-preset alarm links (see `2026-07-23-preset-alarm-links-design.md`),
a preset's YouTube or Spotify alarm source can silently go bad — a video
gets deleted/restricted, a Spotify session expires and can't be refreshed.
`AlarmManager` already has a reactive fallback for this (falls back to the
local default alarm and shows a transient toast), but that's easy to miss
and gives no way to see, ahead of time, that a specific saved link is dead
without triggering the fallback path first.

This adds two independent, complementary ways to surface link health:

1. A badge on the preset picker itself, for the currently active preset's
   alarm link only — visible without opening the Alarm Sound modal at all.
2. Per-entry "broken" badges inside the modal's saved-link lists (YouTube
   and Spotify), for every saved link, not just the active one.

Both reuse the same underlying health-check logic. Neither changes the
existing reactive fallback-and-toast behavior — this is purely additive,
proactive visibility on top of it.

## Non-goals

- Not changing the link-addition flow. Adding a link already validates in
  real time via an actual load attempt (stronger than the checks here for
  YouTube), and only saves to the list on success.
- Not checking multiple presets' links at once, or checking anything on a
  schedule/interval. Only ever the specific link(s) relevant to what's
  currently visible/active.
- Not distinguishing *why* a link is broken (deleted vs. private vs.
  network error for YouTube; track removed vs. region-locked for Spotify)
  — a link is either "confirmed broken" or "not flagged," nothing more
  granular.

## Shared detection logic (`js/alarm/linkHealth.js`, new)

Two exported functions, both pure network-calling helpers with no DOM/UI
concerns:

- `checkYoutubeLink(url)` — fetches
  `https://www.youtube.com/oembed?url=<url>&format=json`. A successful
  (2xx) response means the video is alive and embeddable; a 4xx/error
  response (or a network failure) means "not confirmed broken" is the
  wrong read only for actual 4xx responses — network failures resolve to
  "unknown," never "broken." Returns `"alive" | "broken" | "unknown"`.
  Already covered by the existing CSP (`connect-src` already allows
  `youtube.com`) — no CSP change needed.
- `checkSpotifyLinks(urls)` — takes an array of Spotify track URLs (used
  with a single-element array for the preset-picker case, and up to 5 for
  the modal's per-entry case — same function either way, no separate
  single-track code path). Extracts track IDs, calls the Spotify Web API's
  batched `GET /v1/tracks?ids=id1,id2,...` (up to 50 IDs per call, well
  within the 5-per-type cap this app enforces) using the existing stored
  access token. Returns a `Map<url, "alive" | "broken" | "unknown">` — a
  track present and non-null in the response is `"alive"`, present-but-null
  is `"broken"` (Spotify's API returns `null` in that array slot for a
  removed/invalid ID), and if there's no session or the request fails
  outright, every URL maps to `"unknown"` (already covered by the existing
  CSP's `connect-src https://api.spotify.com`).

`"unknown"` is never displayed as broken in either mechanism below — only
a confirmed `"broken"` result ever produces a badge. This matches the
already-agreed rule: never guess broken from an inconclusive check.

## Mechanism 1: preset-picker badge (active link only)

Checks only the currently active preset's `alarmSource` — a single link,
never a batch across presets, since only one preset's alarm is ever
active on a given machine.

**Trigger points** — everywhere the active `alarmSource` can change, which
turns out to be exactly the two places already established in the preset
alarm links feature:
- `loadPresetAlarm(preset)` in `js/alarmModal.js` — covers both app
  startup and preset switching (both already funnel through this one
  function).
- `handleUrlLoad`'s success branch — covers adding a new link or
  reactivating a saved one.

When the resolved `alarmSource.type` is `"youtube"` or `"spotify"`, run the
matching `linkHealth.js` check on that one URL. When it's `"local"` or
`null`, immediately clear any existing badge (health-checking a local file
or "no source" is meaningless here — the local-file Recent list already
has its own separate "missing" indicator).

**Cross-module communication:** `js/alarmModal.js` owns the check;
`js/presets.js` owns the preset-picker DOM. Following the same pattern
already established for `preset-activated`, `alarmModal.js` dispatches a
new `window` `CustomEvent` named `preset-alarm-health` with
`detail: { presetId, broken: boolean }` after every check (including the
immediate-clear case, with `broken: false`).

**Display:** `js/presets.js` listens for `preset-alarm-health` and toggles
a badge in two places that already coexist in the DOM regardless of
open/closed state (the dropdown list is always rendered, just CSS-hidden
when closed):
- The collapsed trigger (`#presetTriggerLabel`), so it's visible without
  opening the dropdown at all.
- The matching `.preset-item` row in the open list — only the row whose
  `preset.id === detail.presetId` (in practice, always the currently
  `.preset-item--active` row, since only the active preset is ever
  checked).

Badge visual: a small text tag reading "broken" (new translation key,
en + tr), styled after the modal's existing `.alarm-recent-tag` — no new
icon asset. Placed immediately after the preset name in both the trigger
label and the active list row.

**Race safety:** a health check is async (network round-trip); the user
can switch presets again before it resolves. `js/presets.js`'s listener
must compare `detail.presetId` against whichever preset is active *at the
time the event arrives* (re-derived, not cached from when the check
started) and discard the result if they no longer match — otherwise a
slow check for a preset the user has already switched away from could
apply a stale badge to the now-active preset. This mirrors the exact
stale-snapshot bug the final review caught in the original preset alarm
links feature (`loadPresetAlarm` trusting `e.detail` instead of re-reading
current state) — same class of bug, same fix shape: never trust data
carried by an async event as still-current without a fresh check.

## Mechanism 2: modal per-entry badges (all saved links in a section)

**Trigger:** expanding the YouTube or Spotify accordion section in the
Alarm Sound modal (not on every modal open — avoids network calls for a
section the user never looks at). Re-checks fresh every expand (no
caching), consistent with how the local-file Recent list already
re-checks on every relevant trigger.

**Behavior:** calls the matching `linkHealth.js` function against every
link currently in that section's saved list (`renderLinkList`'s existing
data source — the active preset's `alarmLinks[type]`). For YouTube, that's
up to 5 individual `checkYoutubeLink` calls (oEmbed has no batch
endpoint); for Spotify, one `checkSpotifyLinks` call covering the whole
list at once.

**Display:** entries whose result is `"broken"` get a tag matching the
existing `.alarm-recent-tag.missing` style from the local-file Recent
list (reusing the class, new translation key for the label text). Entries
that are `"alive"` or `"unknown"` show no tag — identical to today's
behavior. The remove button continues to work on a broken entry exactly
as it already does on a "missing" local entry.

**Relationship to Mechanism 1:** independent. If the active link happens
to be inside a section that's also expanded, both mechanisms may check the
same URL redundantly — that's acceptable; keeping the two mechanisms
simple and independent is preferable to threading a shared result between
them for a negligible efficiency gain (at most one extra network call).

## Testing

Per this repo's established practice (no automated test suite/lint script
configured — see `CLAUDE.md`): manual verification via `npm start` and/or
CDP after implementation. Specifically: a preset with a saved-but-deleted
YouTube video shows the picker badge on both app startup and after
switching to it, and shows the modal per-entry badge once its section is
expanded; a preset with an expired-and-unrefreshable Spotify session shows
the same; a preset with a healthy link shows no badge in either place; a
preset with no Spotify session connected shows no badge for its Spotify
links (unverifiable, not broken).
