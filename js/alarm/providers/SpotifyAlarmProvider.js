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
    this._hasDurationCap = false; // play()'a duration > 0 verildi mi?
    this._remainingMs = 0; // kalan otomatik-durdurma süresi
    this._segmentStartedAt = null; // mevcut çalma segmentinin başladığı an
    this._isActive = false; // play() ile başladı, stop() ile bitti mi?
    this._playToken = 0; // her play()/stop() ile artan nesil sayacı — yarış koruması
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

    this._playToken++; // devam eden bir play() varsa geçersiz kıl
    this._hasStarted = false;
    this._isActive = false;
    this._ready = true;
  }

  /**
   * play() ile stop() arasında geçen OS launch / Web API round-trip'leri
   * gerçek ağ gecikmesi taşır (bkz. PLAYBACK_START_GRACE_MS yorumu). Bir
   * faz, bu gecikmeden daha kısa sürerse — ya da alarm duration'ı faza
   * göre uzunsa — yeni bir play() çağrısı öncekinin await'leri hâlâ
   * sürerken gelebilir. _playToken, hangi çağrının hâlâ güncel olduğunu
   * işaretler: her play()/stop() onu artırır, her await sonrası devam
   * eden kod kendi token'ının hâlâ günceli olup olmadığını kontrol eder.
   * Değilse (daha yeni bir play()/stop() araya girmişse) sessizce çıkar —
   * aksi halde paylaşılan _remainingMs/_timeoutId üzerinde çakışan iki
   * zamanlayıcı zinciri birbirini bozar.
   */
  async play(duration = 0) {
    if (!this._ready) {
      throw new Error("SpotifyAlarmProvider: Not ready. Call load() first.");
    }
    const myToken = ++this._playToken;
    this._clearTimeout();
    this._isActive = true;
    const myHasDurationCap = duration > 0;
    const myRemainingMs = myHasDurationCap ? duration * 1000 : 0;
    this._hasDurationCap = myHasDurationCap;
    this._remainingMs = myRemainingMs;

    // İlk çalışta track'i OS launch ile en baştan açıyoruz. Sonraki faz
    // geçişlerinde — track zaten önceki stop() ile duraklatıldığından —
    // Web API resume() ile kaldığı yerden devam ettiriyoruz; aksi halde
    // spotifyOpenTrack() her seferinde track'i sıfırdan başlatıyordu.
    // resume() başarısız olursa (uygulama kapanmış, cihaz aktif değil)
    // OS launch'a düşüyoruz. armTimer: false — zamanlayıcıyı burada, tam
    // duration ile ve OS launch grace-period'unu gözeterek biz kuruyoruz.
    const resumed =
      this._hasStarted && (await this.resume({ armTimer: false, token: myToken }));

    if (myToken !== this._playToken) return; // araya daha yeni bir play()/stop() girdi

    if (!resumed) {
      await window.electronAPI.spotifyOpenTrack(this._trackId);
      if (myToken !== this._playToken) return;
      this._hasStarted = true;
    }

    if (myHasDurationCap) {
      if (resumed) {
        this._armTimer(myRemainingMs);
      } else {
        this._timeoutId = setTimeout(() => {
          if (myToken !== this._playToken) return;
          this._armTimer(myRemainingMs);
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
    this._playToken++; // devam eden play()/resume() çağrılarını geçersiz kıl
    this._clearTimeout();
    this._hasStarted = false;
    this._hasDurationCap = false;
    this._remainingMs = 0;
    this._segmentStartedAt = null;
    this._isActive = false;
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

  _armTimer(ms) {
    this._segmentStartedAt = Date.now();
    this._timeoutId = setTimeout(() => {
      this._remainingMs = 0;
      this._isActive = false;
      this._pauseForContinuity();
    }, ms);
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
   * kaldığı yerden devam etsin, OS launch'a düşmesin. Duration sınırı
   * varsa, bu segmentte geçen süreyi kalan süreden düşer ki resume()
   * sonrası orijinal duration hâlâ geçerli olsun.
   */
  async pause() {
    if (!this._isActive) return;

    this._playToken++; // devam eden bir play()/resume() varsa geçersiz kıl
    if (this._hasDurationCap && this._segmentStartedAt !== null) {
      const elapsed = Date.now() - this._segmentStartedAt;
      this._remainingMs = Math.max(0, this._remainingMs - elapsed);
      this._segmentStartedAt = null;
    }
    await this._pauseForContinuity();
  }

  /**
   * pause() ile duraklatılmış track'i kaldığı yerden devam ettirir.
   * Body'siz PUT .../play, aktif cihazdaki mevcut context'i resume eder.
   * Duration sınırı varsa (ve armTimer false değilse) kalan süre için
   * otomatik-durdurma zamanlayıcısını yeniden kurar — aksi halde alarm,
   * orijinal duration'ı unutup track manuel durdurulana kadar çalar.
   *
   * Alarm pause() çağrılmadan ÖNCE zaten doğal olarak durmuşsa (_isActive
   * false) burada hiçbir şey yapılmaz — aksi halde Continue, gerçek
   * Spotify cihazında bitmiş bir track'i sıfırdan yeniden başlatıp hemen
   * ardından durdururdu (duyulabilir bir "blip").
   * @param {object} [opts]
   * @param {boolean} [opts.armTimer=true] - play() içeriden çağırırken
   *   false geçer; zamanlayıcıyı tam duration ve grace-period ile play()
   *   kendisi kurar.
   * @param {number} [opts.token] - play() içeriden çağırırken kendi
   *   _playToken'ını geçer, ki fetch beklerken araya daha yeni bir
   *   play()/stop() girerse bu resume() de kendini geçersiz saysın.
   *   Continue butonundan doğrudan çağrıldığında verilmez — o zaman
   *   token, çağrı anındaki _playToken'dır.
   * @returns {Promise<boolean>} resume gerçekten başarılı oldu mu — play()
   *   bunu OS launch'a düşüp düşmeyeceğine karar vermek için kullanıyor.
   */
  async resume({ armTimer = true, token } = {}) {
    if (!this._isActive) return false;
    if (!this._accessToken) return false;
    const myToken = token ?? this._playToken;
    let ok = false;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { Authorization: `Bearer ${this._accessToken}` },
      });
      ok = res.ok;
    } catch (e) {
      // Free hesap / aktif cihaz yok / token süresi dolmuş — sessizce yut.
      ok = false;
    }

    if (myToken !== this._playToken) return ok; // araya daha yeni bir play()/stop() girdi

    if (ok && armTimer && this._hasDurationCap) {
      this._armTimer(this._remainingMs);
    }

    return ok;
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
