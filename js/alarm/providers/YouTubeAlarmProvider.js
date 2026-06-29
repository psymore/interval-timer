import { BaseAlarmProvider } from "./BaseAlarmProvider.js";

/**
 * YouTubeAlarmProvider
 *
 * Sorumluluk: YouTube IFrame Player API kullanarak video/müzik çalar.
 * Gizli bir iframe container içinde çalışır — UI göstermez.
 *
 * Kısıtlamalar:
 *   - Autoplay bazı tarayıcılarda (Chromium dahil) kullanıcı etkileşimi gerektirir.
 *   - Content-Security-Policy'de https://www.youtube.com izinli olmalı.
 *   - Bazı videolar embed'e kapalı olabilir → fallback tetiklenir.
 *
 * Renderer process'te yaşar.
 */
export class YouTubeAlarmProvider extends BaseAlarmProvider {
  constructor() {
    super();
    this._player = null; // YT.Player instance
    this._videoId = null;
    this._ready = false;
    this._container = null; // iframe container div
    this._timeoutId = null;
  }

  /**
   * YouTube URL veya video ID'den provider'ı hazırlar.
   * @param {string} source - YouTube URL veya video ID
   *   Örnek: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   *   Örnek: "dQw4w9WgXcQ"
   */
  async load(source) {
    this._videoId = this._extractVideoId(source);
    if (!this._videoId) {
      throw new Error(
        `YouTubeAlarmProvider: Could not extract video ID from "${source}".`,
      );
    }

    // YouTube IFrame API'yi yükle (bir kez yüklenir, sonraki çağrılarda atlanır)
    await this._loadYouTubeAPI();

    // Gizli container oluştur
    this._setupContainer();

    // Player'ı oluştur ve hazır olmasını bekle
    await this._createPlayer();
    this._ready = true;
  }

  /**
   * Videoyu çalar.
   * @param {number} duration - saniye (0 = video bitene kadar)
   */
  async play(duration = 0) {
    if (!this._player || !this._ready) {
      throw new Error("YouTubeAlarmProvider: Not ready. Call load() first.");
    }

    this._clearTimeout();
    this._player.playVideo();

    if (duration > 0) {
      this._timeoutId = setTimeout(() => this.stop(), duration * 1000);
    }
  }

  /**
   * Videoyu durdurur.
   */
  async stop() {
    this._clearTimeout();
    if (this._player) {
      try {
        this._player.stopVideo();
      } catch (e) {}
    }
  }

  isReady() {
    return this._ready;
  }

  // ── Private ────────────────────────────────────────────────

  /**
   * YouTube URL'den video ID'yi çıkarır.
   * Desteklenen formatlar:
   *   https://www.youtube.com/watch?v=ID
   *   https://youtu.be/ID
   *   ID (direkt)
   */
  _extractVideoId(source) {
    if (!source) return null;

    // Direkt ID (11 karakter)
    if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;

    try {
      const url = new URL(source);
      const fromV = url.searchParams.get("v");
      if (fromV) return fromV;

      // youtu.be/ID formatı
      if (url.hostname === "youtu.be") {
        return url.pathname.slice(1);
      }
    } catch {
      // Geçersiz URL
    }
    return null;
  }

  /**
   * YouTube IFrame API script'ini DOM'a yükler.
   * Zaten yüklüyse beklemez.
   */
  _loadYouTubeAPI() {
    return new Promise((resolve, reject) => {
      // Zaten yüklü
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      // Script zaten eklendi, callback'i bekle
      if (document.getElementById("yt-iframe-api")) {
        const interval = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
        return;
      }

      // İlk kez yükle
      window.onYouTubeIframeAPIReady = resolve;

      const script = document.createElement("script");
      script.id = "yt-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () =>
        reject(
          new Error("YouTubeAlarmProvider: Failed to load YouTube IFrame API."),
        );
      document.head.appendChild(script);
    });
  }

  /**
   * Gizli player container'ı oluşturur.
   */
  _setupContainer() {
    // Varsa temizle
    document.getElementById("yt-alarm-container")?.remove();

    this._container = document.createElement("div");
    this._container.id = "yt-alarm-container";
    this._container.style.cssText = `
      position: fixed;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      bottom: 0;
      right: 0;
      z-index: -1;
    `;
    document.body.appendChild(this._container);
  }

  /**
   * YT.Player instance'ı oluşturur ve hazır olmasını bekler.
   */
  _createPlayer() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("YouTubeAlarmProvider: Player init timed out."));
      }, 10000);

      this._player = new window.YT.Player(this._container, {
        height: "1",
        width: "1",
        videoId: this._videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3, // annotation yok
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            this._player.unMute();
            this._player.setVolume(100);
            this._player.playVideo();

            clearTimeout(timeout);
            resolve();
          },
          onError: e => {
            clearTimeout(timeout);
            reject(
              new Error(
                `YouTubeAlarmProvider: Player error code ${e.data}. ` +
                  `Video may be restricted or unavailable.`,
              ),
            );
          },
        },
      });
    });
  }

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
