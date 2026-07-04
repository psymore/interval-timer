import { BaseAlarmProvider } from "./BaseAlarmProvider.js";

// OS URI launch, Spotify masaüstü uygulamasını fiilen sesi başlatana kadar
// genelde bir-iki saniye sürüyor. Bunu kesin tespit etmenin tek yolu Web
// API'yi polling yapmak olurdu ki bu da eski bağlı hesaplarda henüz izin
// verilmemiş olabilecek bir scope'a bağımlılık ekler; onun yerine sayacı
// sabit bir grace-period kadar erteliyoruz ki duration, sessiz açılış
// süresini değil fiili çalma süresini yansıtsın.
const PLAYBACK_START_GRACE_MS = 2000;

/**
 * SpotifyAlarmProvider
 *
 * Sorumluluk: OS URI launch ile Spotify masaüstü uygulamasını açıp track'i
 * tam olarak çalar (shell.openExternal("spotify:track:<id>") — token
 * gerekmez). Durdurma işlemi Spotify Web API'nin pause endpoint'i ile
 * yapılır ve bu **Spotify Premium** gerektirir; free hesaplarda pause
 * çağrısı sessizce başarısız olur ve track manuel durdurulana kadar çalar.
 *
 * Renderer process'te yaşar.
 */
export class SpotifyAlarmProvider extends BaseAlarmProvider {
  constructor({ accessToken = null } = {}) {
    super();
    this._accessToken = accessToken;
    this._trackId = null;
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

    if (!this._accessToken) {
      throw new Error(
        "SpotifyAlarmProvider: Access token required. Connect a Spotify account first.",
      );
    }

    this._ready = true;
  }

  async play(duration = 0) {
    if (!this._ready) {
      throw new Error("SpotifyAlarmProvider: Not ready. Call load() first.");
    }
    this._clearTimeout();

    await window.electronAPI.spotifyOpenTrack(this._trackId);

    if (duration > 0) {
      this._timeoutId = setTimeout(() => {
        this._timeoutId = setTimeout(() => this.stop(), duration * 1000);
      }, PLAYBACK_START_GRACE_MS);
    }
  }

  async stop() {
    this._clearTimeout();
    if (!this._accessToken) return;

    try {
      await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { Authorization: `Bearer ${this._accessToken}` },
      });
    } catch (e) {
      // Free hesap / aktif cihaz yok / token süresi dolmuş — sessizce yut,
      // AlarmManager._stopCurrent() zaten provider stop() hatalarını yutuyor.
    }
  }

  /**
   * Alarmı geçici olarak duraklatır. Spotify Web API'de pause/resume ayrı
   * endpoint'ler değil — pause() stop() ile aynı çağrıyı yapar (Spotify
   * pozisyonu kendi tarafında tutar); resume() ile devam ettirilebilir.
   */
  async pause() {
    await this.stop();
  }

  /**
   * pause() ile duraklatılmış track'i kaldığı yerden devam ettirir.
   * Body'siz PUT .../play, aktif cihazdaki mevcut context'i resume eder.
   */
  async resume() {
    if (!this._accessToken) return;
    try {
      await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { Authorization: `Bearer ${this._accessToken}` },
      });
    } catch (e) {
      // Free hesap / aktif cihaz yok / token süresi dolmuş — sessizce yut.
    }
  }

  isReady() {
    return this._ready;
  }

  /**
   * AlarmManager, play() öncesi token'ı refresh ettiğinde bu instance'ın
   * accessToken'ını günceller — provider load() sırasında yakaladığı token
   * saatler sonra çalınca (alarm tetiklendiğinde) süresi dolmuş olabilir.
   */
  setAccessToken(token) {
    this._accessToken = token;
  }

  // ── Helpers ────────────────────────────────────────────────
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
