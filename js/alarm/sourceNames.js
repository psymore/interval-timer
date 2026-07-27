// js/alarm/sourceNames.js
// Best-effort lookup of the human-readable name behind a YouTube/Spotify
// alarm source (video title / track name), for display in the presets
// list. Same "unknown must never block the UI" spirit as linkHealth.js:
// a failed or missing lookup just means the caller shows no name, never
// an error state.
//
// Once a name is found for a given link, it's cached for the rest of the
// session — no repeat API calls for that link unless it changes (a
// different preset.alarmSource.value is a different cache key). In-flight
// lookups are also deduped so rapidly reopening the presets dropdown
// before the first fetch resolves can't fire duplicate requests.
import { extractYoutubeId, extractSpotifyTrackId } from "./linkHealth.js";

const youtubeTitleCache = new Map();
const spotifyNameCache = new Map();
const pendingFetches = new Map(); // source -> in-flight Promise

export function peekYoutubeTitle(source) {
  return youtubeTitleCache.get(source) ?? null;
}

export function peekSpotifyName(source) {
  return spotifyNameCache.get(source) ?? null;
}

function dedupe(source, cache, fetcher) {
  if (cache.has(source)) return Promise.resolve(cache.get(source));
  if (pendingFetches.has(source)) return pendingFetches.get(source);

  const promise = fetcher().then(name => {
    pendingFetches.delete(source);
    if (name) cache.set(source, name);
    return name;
  });
  pendingFetches.set(source, promise);
  return promise;
}

// Resolves and caches the video title via the same no-auth oEmbed
// endpoint linkHealth.js uses for its health check.
export function resolveYoutubeTitle(source) {
  return dedupe(source, youtubeTitleCache, async () => {
    const videoId = extractYoutubeId(source);
    if (!videoId) return null;

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

    try {
      const res = await fetch(oembedUrl);
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.title === "string" ? data.title : null;
    } catch {
      return null;
    }
  });
}

// Requires a Spotify access token (Client Credentials or user login,
// whichever AlarmManager currently has) — no token means no name, same
// silent-degrade behavior as checkSpotifyLinks().
export function resolveSpotifyName(source) {
  return dedupe(source, spotifyNameCache, async () => {
    const trackId = extractSpotifyTrackId(source);
    if (!trackId) return null;

    const tokens = await window.electronAPI.spotifyGetTokens();
    if (!tokens?.accessToken) return null;

    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.name === "string" ? data.name : null;
    } catch {
      return null;
    }
  });
}
