import { BaseAlarmProvider } from "./BaseAlarmProvider.js";

/**
 * LocalAlarmProvider
 *
 * Sorumluluk: HTML5 Audio API kullanarak local dosyaları çalar.
 * Desteklenen formatlar: mp3, wav, ogg
 * Fallback provider olarak kullanılır — her zaman çalışmalı.
 *
 * Renderer process'te yaşar.
 */
export class LocalAlarmProvider extends BaseAlarmProvider {
  constructor() {
    super();
    this._audio = null; // HTMLAudioElement
    this._source = null; // file:// path
    this._ready = false;
    this._timeoutId = null;
    this._hasDurationCap = false; // play()'a duration > 0 verildi mi?
    this._remainingMs = 0; // kalan otomatik-durdurma süresi
    this._segmentStartedAt = null; // mevcut çalma segmentinin başladığı an
    this._isActive = false; // play() ile başladı, stop() ile bitti mi?
    this._playToken = 0; // her play()/stop() ile artan nesil sayacı — yarış koruması
  }

  /**
   * Ses dosyasını yükler ve çalmaya hazırlar.
   * @param {string} source - file:// protokolüyle tam yol
   */
  async load(source) {
    return new Promise((resolve, reject) => {
      // Önceki instance'ı temizle
      this._cleanup();

      this._source = source;
      this._audio = new Audio();

      this._audio.preload = "auto";

      this._audio.addEventListener(
        "canplaythrough",
        () => {
          this._ready = true;
          resolve();
        },
        { once: true },
      );

      this._audio.addEventListener(
        "error",
        e => {
          this._ready = false;
          reject(
            new Error(
              `LocalAlarmProvider: Failed to load "${source}". ` +
                `Code: ${this._audio?.error?.code}`,
            ),
          );
        },
        { once: true },
      );

      this._audio.src = source;
      this._audio.load();
    });
  }

  /**
   * Alarmı çalar.
   * Eğer duration > 0 ise o kadar saniye sonra otomatik durur.
   * Eğer duration = 0 ise dosya bitene kadar çalar.
   *
   * audio.play() bir Promise döner ve genelde hızlı çözülür, ama garanti
   * değil. Bir faz bu bekleme sırasında bitip yeni bir play() çağrısı
   * gelirse (çok kısa faz + kısa alarm duration kombinasyonu), iki çağrı
   * aynı paylaşılan _remainingMs/_timeoutId üzerinde çakışabilir.
   * _playToken bunu engeller: her play()/stop() onu artırır, await
   * sonrası devam eden kod kendi token'ının hâlâ güncel olup olmadığını
   * kontrol eder.
   * @param {number} duration - saniye
   */
  async play(duration = 0) {
    if (!this._audio || !this._ready) {
      throw new Error("LocalAlarmProvider: Not ready. Call load() first.");
    }

    const myToken = ++this._playToken;

    // Önceki timeout varsa iptal et
    this._clearTimeout();

    this._audio.currentTime = 0;
    await this._audio.play();

    if (myToken !== this._playToken) return; // araya daha yeni bir play()/stop() girdi

    this._isActive = true;
    this._hasDurationCap = duration > 0;
    this._remainingMs = this._hasDurationCap ? duration * 1000 : 0;
    if (this._hasDurationCap) this._armTimer(this._remainingMs);

    // Doğal bitiş
    this._audio.addEventListener(
      "ended",
      () => {
        if (myToken !== this._playToken) return;
        this._clearTimeout();
        this._hasDurationCap = false;
        this._isActive = false;
      },
      { once: true },
    );
  }

  /**
   * Alarmı durdurur ve sıfırlar.
   */
  async stop() {
    this._playToken++; // devam eden bir play() varsa geçersiz kıl
    this._clearTimeout();
    this._hasDurationCap = false;
    this._remainingMs = 0;
    this._segmentStartedAt = null;
    this._isActive = false;
    if (this._audio) {
      try {
        this._audio.pause();
        this._audio.currentTime = 0;
      } catch (e) {
        // Zaten durmuş olabilir — güvenle yutuyoruz
      }
    }
  }

  /**
   * Alarmı geçici olarak duraklatır (Timer'ın kendi Pause/Continue
   * butonları için) — stop()'un aksine pozisyonu sıfırlamaz. Duration
   * sınırı varsa, bu segmentte geçen süreyi kalan süreden düşer ki
   * resume() sonrası orijinal duration hâlâ geçerli olsun.
   *
   * Alarm zaten kendi duration'ını doldurup doğal olarak durmuşsa
   * (_isActive false) burada yapacak bir şey yok — aksi halde resume()
   * onu sıfırdan yeniden başlatırdı.
   */
  async pause() {
    if (!this._isActive) return;

    this._playToken++; // devam eden bir play() varsa geçersiz kıl
    if (this._hasDurationCap && this._segmentStartedAt !== null) {
      const elapsed = Date.now() - this._segmentStartedAt;
      this._remainingMs = Math.max(0, this._remainingMs - elapsed);
      this._segmentStartedAt = null;
    }
    this._clearTimeout();
    if (this._audio) {
      try {
        this._audio.pause();
      } catch (e) {}
    }
  }

  /**
   * pause() ile duraklatılmış sesi kaldığı yerden devam ettirir. Duration
   * sınırı varsa, kalan süre için otomatik-durdurma zamanlayıcısını yeniden
   * kurar — aksi halde alarm, orijinal duration'ı unutup dosya bitene kadar
   * çalmaya devam eder.
   *
   * Alarm pause() çağrılmadan ÖNCE zaten doğal olarak durmuşsa (_isActive
   * false) burada hiçbir şey yapılmaz — aksi halde Continue, bitmiş bir
   * alarmı sıfırdan yeniden başlatırdı.
   */
  async resume() {
    if (!this._isActive) return;

    const myToken = this._playToken;
    if (this._audio) {
      try {
        await this._audio.play();
      } catch (e) {}
    }
    if (myToken !== this._playToken) return; // araya daha yeni bir play()/stop() girdi

    if (this._hasDurationCap) {
      this._armTimer(this._remainingMs);
    }
  }

  isReady() {
    return this._ready;
  }

  // ── Private ────────────────────────────────────────────────
  _armTimer(ms) {
    this._segmentStartedAt = Date.now();
    this._timeoutId = setTimeout(() => this.stop(), ms);
  }

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  _cleanup() {
    this._playToken++; // devam eden bir play() varsa geçersiz kıl
    this._clearTimeout();
    this._hasDurationCap = false;
    this._remainingMs = 0;
    this._segmentStartedAt = null;
    this._isActive = false;
    if (this._audio) {
      this._audio.pause();
      this._audio.src = "";
      this._audio = null;
    }
    this._ready = false;
    this._source = null;
  }
}
