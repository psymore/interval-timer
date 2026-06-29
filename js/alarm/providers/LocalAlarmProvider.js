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
   * @param {number} duration - saniye
   */
  async play(duration = 0) {
    if (!this._audio || !this._ready) {
      throw new Error("LocalAlarmProvider: Not ready. Call load() first.");
    }

    // Önceki timeout varsa iptal et
    this._clearTimeout();

    this._audio.currentTime = 0;
    await this._audio.play();

    if (duration > 0) {
      this._timeoutId = setTimeout(() => this.stop(), duration * 1000);
    }

    // Doğal bitiş
    this._audio.addEventListener(
      "ended",
      () => {
        this._clearTimeout();
      },
      { once: true },
    );
  }

  /**
   * Alarmı durdurur ve sıfırlar.
   */
  async stop() {
    this._clearTimeout();
    if (this._audio) {
      try {
        this._audio.pause();
        this._audio.currentTime = 0;
      } catch (e) {
        // Zaten durmuş olabilir — güvenle yutuyoruz
      }
    }
  }

  isReady() {
    return this._ready;
  }

  // ── Private ────────────────────────────────────────────────
  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  _cleanup() {
    this._clearTimeout();
    if (this._audio) {
      this._audio.pause();
      this._audio.src = "";
      this._audio = null;
    }
    this._ready = false;
    this._source = null;
  }
}
