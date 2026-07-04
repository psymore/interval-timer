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
    this._hasStarted = false; // ← OS launch bir kez yeter, sonrası Web API resume
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

    this._hasStarted = false;
    this._ready = true;
  }

  async play(duration = 0) {
    if (!this._ready) {
      throw new Error("SpotifyAlarmProvider: Not ready. Call load() first.");
    }
    this._clearTimeout();

    // İlk çalışta track'i OS launch ile en baştan açıyoruz. Sonraki faz
    // geçişlerinde — track zaten önceki stop() ile duraklatıldığından —
    // Web API resume() ile kaldığı yerden devam ettiriyoruz; aksi halde
    // spotifyOpenTrack() her seferinde track'i sıfırdan başlatıyordu.
    // resume() başarısız olursa (uygulama kapanmış, cihaz aktif değil)
    // OS launch'a düşüyoruz.
    const resumed = this._hasStarted && (await this.resume());

    if (!resumed) {
      await window.electronAPI.spotifyOpenTrack(this._trackId);
      this._hasStarted = true;
    }

    if (duration > 0) {
      if (resumed) {
        this._timeoutId = setTimeout(() => this._pauseForContinuity(), duration * 1000);
      } else {
        this._timeoutId = setTimeout(() => {
          this._timeoutId = setTimeout(() => this._pauseForContinuity(), duration * 1000);
        }, PLAYBACK_START_GRACE_MS);
      }
    }
  }

  /**
   * Alarmı tamamen durdurur. _hasStarted'ı sıfırlar — Reset gibi kullanıcı
   * eylemlerinde ve kaynak değişiminde çağrılır; bir sonraki play() track'i
   * resume ile değil, OS launch ile baştan başlatmalı.
   */
  async stop() {
    this._clearTimeout();
    this._hasStarted = false;
    await this._pausePlayback();
  }

  /**
   * Faz geçişleri arasında sesi keser ama _hasStarted'ı korur — bir
   * sonraki play() Web API resume ile kaldığı yerden devam etsin diye.
   */
  async _pauseForContinuity() {
    this._clearTimeout();
    await this._pausePlayback();
  }

  async _pausePlayback() {
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
   * Alarmı geçici olarak duraklatır (Timer'ın kendi Pause/Continue
   * butonları için) — _hasStarted korunur ki Continue sonrası resume()
   * kaldığı yerden devam etsin, OS launch'a düşmesin.
   */
  async pause() {
    await this._pauseForContinuity();
  }

  /**
   * pause() ile duraklatılmış track'i kaldığı yerden devam ettirir.
   * Body'siz PUT .../play, aktif cihazdaki mevcut context'i resume eder.
   * @returns {Promise<boolean>} resume gerçekten başarılı oldu mu — play()
   *   bunu OS launch'a düşüp düşmeyeceğine karar vermek için kullanıyor.
   */
  async resume() {
    if (!this._accessToken) return false;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { Authorization: `Bearer ${this._accessToken}` },
      });
      return res.ok;
    } catch (e) {
      // Free hesap / aktif cihaz yok / token süresi dolmuş — sessizce yut.
      return false;
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
