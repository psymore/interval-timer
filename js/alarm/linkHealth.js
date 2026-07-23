// js/alarm/linkHealth.js
// Pure network-calling checks for whether a saved YouTube/Spotify alarm
// link still works. No DOM access, no app state — callers own what to do
// with the result. "unknown" (no session, network failure, non-2xx that
// isn't a definitive not-found) must never be treated as "broken" by
// callers — only a confirmed-dead link is.

function extractYoutubeId(source) {
  if (!source) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;
  try {
    const url = new URL(source);
    const fromV = url.searchParams.get("v");
    if (fromV) return fromV;
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
  } catch {}
  return null;
}

function extractSpotifyTrackId(source) {
  if (!source) return null;
  if (/^[a-zA-Z0-9]{22}$/.test(source)) return source;
  const uriMatch = source.match(/spotify:track:([a-zA-Z0-9]{22})/);
  if (uriMatch) return uriMatch[1];
  try {
    const url = new URL(source);
    const segments = url.pathname.split("/");
    const idx = segments.indexOf("track");
    if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
  } catch {}
  return null;
}

export async function checkYoutubeLink(url) {
  const videoId = extractYoutubeId(url);
  if (!videoId) return "unknown";

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  try {
    const res = await fetch(oembedUrl);
    if (res.status === 404 || res.status === 401) return "broken";
    if (!res.ok) return "unknown";
    return "alive";
  } catch {
    return "unknown";
  }
}

// No token refresh attempted here — if the stored access token happens to
// be expired, the request 401s and every URL resolves to "unknown" rather
// than "broken", which is the correct degrade per this feature's "never
// guess broken from an inconclusive check" rule. AlarmManager's own
// refresh logic (js/alarm/AlarmManager.js) is what keeps actual playback
// working; this is a lightweight, best-effort visibility check only.
export async function checkSpotifyLinks(urls) {
  const results = new Map();
  const ids = urls.map(extractSpotifyTrackId);

  const validIds = ids.filter(Boolean);
  if (validIds.length === 0) {
    urls.forEach(url => results.set(url, "unknown"));
    return results;
  }

  const tokens = await window.electronAPI.spotifyGetTokens();
  if (!tokens?.accessToken) {
    urls.forEach(url => results.set(url, "unknown"));
    return results;
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${validIds.join(",")}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!res.ok) {
      urls.forEach(url => results.set(url, "unknown"));
      return results;
    }
    const data = await res.json();
    const tracksById = new Map();
    validIds.forEach((id, i) => tracksById.set(id, data.tracks?.[i] ?? null));

    urls.forEach((url, i) => {
      const id = ids[i];
      if (!id) {
        results.set(url, "unknown");
        return;
      }
      results.set(url, tracksById.get(id) ? "alive" : "broken");
    });
  } catch {
    urls.forEach(url => results.set(url, "unknown"));
  }

  return results;
}
