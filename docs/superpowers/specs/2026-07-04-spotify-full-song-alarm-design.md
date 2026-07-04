# Spotify full-song alarm

## Problem

`SpotifyAlarmProvider` currently only plays a 30-second preview clip through an
`<audio>` element, using a Client Credentials token. Many tracks have no
`preview_url` at all, so Spotify alarms are unreliable and never play the
actual song. Web Playback SDK (real in-app full-track playback) is not an
option — it requires Widevine DRM, which isn't present in stock Electron
builds.

## Goal

Selecting a Spotify track as an alarm source should open the real Spotify
desktop app and play the full track. The app should also be able to pause
that playback later — when the configured alarm duration elapses, or when
the user manually dismisses/stops the alarm. Also alarm duration feature should control the playback length of the song.

## Design

### Starting playback — OS URI launch

`play()` invokes a new main-process IPC handler that calls
`shell.openExternal("spotify:track:<id>")`. Opening this URI launches (or
foregrounds) the installed Spotify desktop app and starts playing that exact
track immediately. This works for both Free and Premium accounts and
requires no API call to start.

### Stopping playback — Web API pause

`stop()` calls Spotify's Web API pause endpoint
(`PUT https://api.spotify.com/v1/me/player/pause`) using the user's OAuth
access token. This is a Connect API call against whatever device is
currently active — which, immediately after the URI launch, is the desktop
app that just started playing. **Requires Spotify Premium** — free accounts
can't be paused remotely via this API, so on a free account the track will
keep playing until the user pauses it by hand in the Spotify app. Pause
failures (no active device, free account, expired token) are caught and
ignored, matching the existing `AlarmManager._stopCurrent()` contract, which
already swallows provider `stop()` errors.

`play(duration)` keeps the existing per-provider contract used by
`LocalAlarmProvider`/`YouTubeAlarmProvider`: if `duration > 0`, arm a
`setTimeout(() => this.stop(), duration * 1000)`. If `duration === 0`, the
track plays with no auto-stop (fire-and-forget), consistent with "natural
end" behavior for other providers — except there's no actual end event to
observe here, since playback happens outside our process.

### Authentication

The Authorization Code OAuth flow already exists end-to-end in `main.js`
(`spotify:login`, `spotify:refresh` IPC handlers) but nothing in the
renderer currently calls `spotify:login`, and `AlarmManager._buildSpotifyOpts()`
only ever fetches a Client Credentials token (app-level, cannot call
`/me/player/*`). This flow is wired up:

- `AlarmManager._buildSpotifyOpts()` is rewritten to require a **user**
  access token (from `localStorage`, refreshed via `spotify:refresh` when
  near expiry — reusing the existing `_refreshSpotifyTokenIfNeeded()` logic
  already called before every `play()`). The Client Credentials/preview path
  is removed entirely — it can't drive playback control and previews are no
  longer needed.
- If no valid session exists (never logged in, and refresh fails), building
  opts throws. This propagates through `AlarmManager.load()`'s existing
  non-local-provider catch block, which activates the local-alarm fallback —
  the same failure path already used for “no preview available” etc. No new
  fallback mechanism needed.
- `SPOTIFY_SCOPES` in `main.js` gains `user-read-playback-state` (needed to
  query/target the active device for pause), alongside the existing
  `user-modify-playback-state`.

### UI

- Alarm modal gets a "Connect Spotify" button next to the existing
  "Disconnect" button in `#spotifyStatusRow`. Exactly one of the two is
  visible at a time, based on whether a valid (or refreshable) token exists
  in `localStorage` — checked on modal init and after login/logout.
- "Connect Spotify" calls `window.electronAPI.spotifyLogin()` (opens the
  existing OAuth popup in `main.js`), saves the returned tokens via
  `AlarmManager._saveSpotifyTokens()`, and flips the UI to "Connected".
- "Disconnect" (already wired) clears the saved tokens; it's extended to
  also flip the UI back to "Connect Spotify".
- The alarm-url-hint copy is updated to mention that Spotify links require
  connecting an account and play through the real Spotify app rather than
  in-app preview.

### Components touched

| File                                         | Change                                                                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.js`                                    | Import `shell`; add `user-read-playback-state` scope; add `spotify:open-track` IPC handler (`shell.openExternal`)                                                                            |
| `preload.cjs`                                | Expose `spotifyOpenTrack(trackId)`                                                                                                                                                           |
| `js/alarm/providers/SpotifyAlarmProvider.js` | Remove preview/`<audio>`/Client-Credentials logic; `load()` validates track ID + requires a user access token; `play()` opens the URI + arms stop timeout; `stop()` calls the pause endpoint |
| `js/alarm/AlarmManager.js`                   | `_buildSpotifyOpts()` requires/refreshes a user token instead of fetching Client Credentials                                                                                                 |
| `js/alarmModal.js`                           | Wire up "Connect Spotify" button; toggle Connect/Disconnect visibility on init, login, and logout                                                                                            |
| `index.html`                                 | Add "Connect Spotify" button in `#spotifyStatusRow`; update alarm-url-hint copy                                                                                                              |

### Out of scope

- Track search/picker UI — track selection stays "paste a Spotify track
  URL/URI" as it is today.
- Detecting whether the Spotify desktop app is installed at all — if it
  isn't, `shell.openExternal` fails silently/opens a browser fallback
  depending on OS; not handled specially.
- Distinguishing Free vs Premium proactively — the app always attempts the
  pause call and silently ignores failure.
