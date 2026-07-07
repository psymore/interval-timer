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
    this._onPlayingForTimer = null; // pending onStateChange listener, if any
    this._hasDurationCap = false; // play()'a duration > 0 verildi mi?
    this._remainingMs = 0; // kalan otomatik-durdurma süresi
    this._segmentStartedAt = null; // mevcut çalma segmentinin başladığı an
    this._isActive = false; // play() ile başladı, stop() ile bitti mi?
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

    // Ses ayarları sadece gerçekten çalma anında yapılır
    this._player.unMute();
    this._player.setVolume(100);
    this._player.playVideo();

    this._isActive = true;
    this._hasDurationCap = duration > 0;
    this._remainingMs = this._hasDurationCap ? duration * 1000 : 0;
    if (this._hasDurationCap) this._armDurationTimer(this._remainingMs);
  }

  /**
   * Videoyu tamamen durdurur ve pozisyonu sıfırlar. Reset gibi kullanıcı
   * eylemlerinde ve kaynak değişiminde çağrılır — bir sonraki play()
   * videoyu baştan başlatmalı.
   */
  async stop() {
    this._clearTimeout();
    this._hasDurationCap = false;
    this._remainingMs = 0;
    this._segmentStartedAt = null;
    this._isActive = false;
    if (this._player) {
      try {
        this._player.stopVideo();
      } catch (e) {}
    }
  }

  /**
   * Faz geçişleri arasında sesi keser ama pozisyonu korur — pauseVideo()
   * kullanır, stopVideo() DEĞİL (o video'yu unload edip sıfırlıyor).
   * Böylece bir sonraki play() kaldığı yerden devam eder.
   */
  _pauseForContinuity() {
    this._timeoutId = null;
    if (this._player) {
      try {
        this._player.pauseVideo();
      } catch (e) {}
    }
  }

  /**
   * Alarmı geçici olarak duraklatır (Timer'ın kendi Pause/Continue
   * butonları için) — pozisyon korunur. Duration sınırı varsa, bu
   * segmentte geçen süreyi kalan süreden düşer ki resume() sonrası
   * orijinal duration hâlâ geçerli olsun.
   *
   * Alarm zaten kendi duration'ını doldurup doğal olarak durmuşsa
   * (_isActive false) burada yapacak bir şey yok — aksi halde resume()
   * onu sıfırdan yeniden başlatırdı.
   */
  async pause() {
    if (!this._isActive) return;

    if (this._hasDurationCap && this._segmentStartedAt !== null) {
      const elapsed = Date.now() - this._segmentStartedAt;
      this._remainingMs = Math.max(0, this._remainingMs - elapsed);
      this._segmentStartedAt = null;
    }
    this._clearTimeout();
    this._pauseForContinuity();
  }

  /**
   * pause() ile duraklatılmış videoyu kaldığı yerden devam ettirir.
   * Duration sınırı varsa, kalan süre için otomatik-durdurma
   * zamanlayıcısını yeniden kurar — aksi halde alarm, orijinal duration'ı
   * unutup video bitene kadar çalmaya devam eder.
   *
   * Alarm pause() çağrılmadan ÖNCE zaten doğal olarak durmuşsa (_isActive
   * false) burada hiçbir şey yapılmaz — aksi halde Continue, bitmiş bir
   * videoyu sıfırdan yeniden başlatırdı.
   */
  async resume() {
    if (!this._isActive) return;

    if (this._player) {
      try {
        this._player.playVideo();
      } catch (e) {}
    }
    if (this._hasDurationCap) {
      this._armDurationTimer(this._remainingMs);
    }
  }

  /**
   * Süre sayacını videonun GERÇEKTEN çalmaya başladığı anda başlatır.
   * playVideo() çağrısı ile fiili ses başlangıcı arasında buffering
   * gecikmesi olabiliyor — sayaç play() anından başlarsa duration'ın
   * büyük kısmı sessiz beklemeye gidip alarm kısa çalıyormuş gibi
   * hissettiriyordu.
   * @param {number} ms - kalan süre, milisaniye
   */
  _armDurationTimer(ms) {
    this._clearPlayingListener();

    if (this._player.getPlayerState?.() === window.YT.PlayerState.PLAYING) {
      this._segmentStartedAt = Date.now();
      this._timeoutId = setTimeout(() => {
        this._remainingMs = 0;
        this._isActive = false;
        this._pauseForContinuity();
      }, ms);
      return;
    }

    this._onPlayingForTimer = event => {
      if (event.data === window.YT.PlayerState.PLAYING) {
        this._clearPlayingListener();
        this._segmentStartedAt = Date.now();
        this._timeoutId = setTimeout(() => {
          this._remainingMs = 0;
          this._isActive = false;
          this._pauseForContinuity();
        }, ms);
      }
    };
    this._player.addEventListener("onStateChange", this._onPlayingForTimer);
  }

  _clearPlayingListener() {
    if (this._onPlayingForTimer) {
      this._player.removeEventListener(
        "onStateChange",
        this._onPlayingForTimer,
      );
      this._onPlayingForTimer = null;
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
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          mute: 1, // ← yükleme sırasında her zaman muted başlasın
        },
        // load() aşamasında SADECE player'ı hazırla, ses ile ilgili hiçbir şey yapma
        events: {
          onReady: () => {
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
    this._clearPlayingListener();
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
}
