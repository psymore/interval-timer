import { BaseAlarmProvider } from "./BaseAlarmProvider.js";

export class SpotifyAlarmProvider extends BaseAlarmProvider {
  constructor({
    accessToken = null,
    clientId = null,
    clientSecret = null,
    mode = "preview",
  } = {}) {
    super();
    this._accessToken = accessToken;
    this._clientId = clientId;
    this._clientSecret = clientSecret;
    this._mode = mode;
    this._trackId = null;
    this._previewUrl = null;
    this._audio = null;
    this._player = null;
    this._deviceId = null;
    this._ready = false;
    this._timeoutId = null;
  }

  async load(source) {
    this._trackId = this._extractTrackId(source);
    if (!this._trackId) {
      throw new Error(
        `SpotifyAlarmProvider: Could not extract track ID from "${source}".`,
      );
    }

    // Token yoksa Client Credentials ile al
    if (!this._accessToken) {
      if (this._clientId && this._clientSecret) {
        await this._fetchClientToken();
      } else {
        throw new Error(
          "SpotifyAlarmProvider: Access token required. " +
            "Provide accessToken or clientId + clientSecret.",
        );
      }
    }

    if (this._mode === "preview") {
      await this._loadPreview();
    } else {
      await this._loadFullPlayback();
    }

    this._ready = true;
  }

  // ── Client Credentials token ───────────────────────────────
  async _fetchClientToken() {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${this._clientId}:${this._clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(
        `SpotifyAlarmProvider: Token fetch failed (${response.status}). ` +
          `Check clientId and clientSecret.`,
      );
    }

    const data = await response.json();
    this._accessToken = data.access_token;
  }

  // ── Preview ────────────────────────────────────────────────
  async _loadPreview() {
    const response = await fetch(
      `https://api.spotify.com/v1/tracks/${this._trackId}`,
      { headers: { Authorization: `Bearer ${this._accessToken}` } },
    );

    if (!response.ok) {
      throw new Error(
        `SpotifyAlarmProvider: Track fetch failed (${response.status}).`,
      );
    }

    const data = await response.json();
    this._previewUrl = data.preview_url;

    if (!this._previewUrl) {
      throw new Error(
        `SpotifyAlarmProvider: No preview available for track "${this._trackId}". ` +
          `Some tracks do not have 30s previews.`,
      );
    }

    await new Promise((resolve, reject) => {
      this._audio = new Audio();
      this._audio.preload = "auto";
      this._audio.addEventListener("canplaythrough", resolve, { once: true });
      this._audio.addEventListener(
        "error",
        () =>
          reject(
            new Error("SpotifyAlarmProvider: Preview audio failed to load."),
          ),
        { once: true },
      );
      this._audio.src = this._previewUrl;
      this._audio.load();
    });
  }

  async _playPreview(duration) {
    if (!this._audio) return;
    this._audio.currentTime = 0;
    await this._audio.play();
    const stopAfter = duration > 0 ? duration * 1000 : 30000;
    this._timeoutId = setTimeout(() => this.stop(), stopAfter);
  }

  // ── Full playback ──────────────────────────────────────────
  async _loadFullPlayback() {
    if (!this._accessToken) {
      throw new Error(
        "SpotifyAlarmProvider: Access token required for full playback mode.",
      );
    }
    await this._loadSpotifySDK();
    await this._createPlayer();
  }

  _loadSpotifySDK() {
    return new Promise((resolve, reject) => {
      if (window.Spotify) {
        resolve();
        return;
      }
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.onerror = () =>
        reject(new Error("SpotifyAlarmProvider: Failed to load Spotify SDK."));
      document.head.appendChild(script);
    });
  }

  _createPlayer() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("SpotifyAlarmProvider: Player init timed out.")),
        15000,
      );

      this._player = new window.Spotify.Player({
        name: "Timer App Alarm",
        getOAuthToken: cb => cb(this._accessToken),
        volume: 1.0,
      });

      this._player.addListener("ready", ({ device_id }) => {
        clearTimeout(timeout);
        this._deviceId = device_id;
        resolve();
      });

      this._player.addListener("not_ready", () =>
        reject(new Error("SpotifyAlarmProvider: Device went offline.")),
      );

      this._player.addListener("initialization_error", ({ message }) =>
        reject(new Error(`SpotifyAlarmProvider: Init error — ${message}`)),
      );

      this._player.addListener("authentication_error", ({ message }) =>
        reject(new Error(`SpotifyAlarmProvider: Auth error — ${message}`)),
      );

      this._player.connect();
    });
  }

  async _playFull(duration) {
    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${this._deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this._accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [`spotify:track:${this._trackId}`],
        }),
      },
    );
    if (duration > 0) {
      this._timeoutId = setTimeout(() => this.stop(), duration * 1000);
    }
  }

  async play(duration = 0) {
    if (!this._ready) {
      throw new Error("SpotifyAlarmProvider: Not ready. Call load() first.");
    }
    this._clearTimeout();
    if (this._mode === "preview") {
      await this._playPreview(duration);
    } else {
      await this._playFull(duration);
    }
  }

  async stop() {
    this._clearTimeout();
    if (this._mode === "preview" && this._audio) {
      try {
        this._audio.pause();
        this._audio.currentTime = 0;
      } catch (e) {}
    } else if (this._player) {
      try {
        await this._player.pause();
      } catch (e) {}
    }
  }

  isReady() {
    return this._ready;
  }

  _extractTrackId(source) {
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

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
