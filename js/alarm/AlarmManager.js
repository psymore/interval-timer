import { AlarmProviderFactory } from "./AlarmProviderFactory.js";
import { LocalAlarmProvider } from "./providers/LocalAlarmProvider.js";

/**
 * AlarmManager
 *
 * Sorumluluk: Alarm çalma operasyonlarının merkezi yöneticisi.
 *
 *   - Aktif provider'ı yönetir
 *   - Yükleme başarısız olursa fallback provider'a geçer
 *   - Çalma başarısız olursa fallback'e geçer
 *   - Event callback'leri ile dışarıya durum bildirir
 *   - Tek instance (singleton) olarak kullanılır
 *
 * Renderer process'te yaşar.
 * AlarmManager dışarıdan doğrudan provider sınıflarını bilmez.
 */

export class AlarmManager {
  constructor() {
    this._provider = null; // Aktif provider
    this._fallbackProvider = null; // Local fallback
    this._fallbackSource = null; // Fallback için local dosya yolu
    this._currentSource = null; // Yüklü kaynak
    this._providerType = null; // Aktif provider tipi

    // Event callbacks
    this._onError = null;
    this._onFallback = null;
    this._onPlay = null;
    this._onStop = null;
  }

  /**
   * Default local kaynağı ayarlar ve yükler.
   * Uygulama başlarken çağrılmalı.
   */
  async initialize(defaultSource) {
    this._defaultSource = defaultSource;
    this.setFallbackSource(defaultSource);

    const savedPath = localStorage.getItem("selectedAlarmPath");
    const source = savedPath ? this._toFileUrl(savedPath) : defaultSource;

    try {
      await this.load(source);
    } catch (e) {
      // Kayıtlı dosya artık yoksa default'a dön
      if (savedPath) {
        console.warn(
          "AlarmManager: Saved path failed, falling back to default.",
        );
        await this.load(defaultSource);
      }
    }
  }

  _toFileUrl(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith("/")
      ? `file://${normalized}`
      : `file:///${normalized}`;
  }

  // ── Konfigürasyon ─────────────────────────────────────────

  /**
   * Fallback için kullanılacak local dosya yolunu ayarlar.
   * Uygulama başlarken çağrılmalı.
   * @param {string} localFilePath - file:// yolu
   */
  setFallbackSource(localFilePath) {
    this._fallbackSource = localFilePath;
  }

  /**
   * Event callback'lerini ayarlar.
   * @param {{ onError, onFallback, onPlay, onStop }} callbacks
   */
  // AlarmManager.js içinde setCallbacks'i güncelle
  setCallbacks(callbacks = {}) {
    // Mevcut callback'leri koru, sadece verilenlerle merge et
    this._onError = callbacks.onError ?? this._onError ?? null;
    this._onFallback = callbacks.onFallback ?? this._onFallback ?? null;
    this._onPlay = callbacks.onPlay ?? this._onPlay ?? null;
    this._onStop = callbacks.onStop ?? this._onStop ?? null;
  }

  // ── Ana API ────────────────────────────────────────────────

  /**
   * Kaynağı yükler ve provider'ı hazırlar.
   * Yükleme başarısız olursa fallback'e geçer.
   *
   * @param {string} source - Dosya yolu, YouTube URL, Spotify URL vb.
   * @param {object} opts   - Provider opsiyonları (Spotify token vb.)
   * @returns {Promise<{ type: string, usedFallback: boolean }>}
   */
  async load(source, opts = {}) {
    // Önceki provider'ı durdur
    await this._stopCurrent();

    const { provider, type } = AlarmProviderFactory.createFromSource(
      source,
      opts,
    );

    try {
      await provider.load(source);
      this._provider = provider;
      this._providerType = type;
      this._currentSource = source;

      console.log(`AlarmManager: Loaded [${type}] — "${source}"`);
      return { type, usedFallback: false };
    } catch (loadError) {
      console.error(`AlarmManager: [${type}] load failed:`, loadError.message);
      this._emit("onError", { error: loadError, type, source });

      // Fallback — sadece zaten local değilsek
      if (type !== "local") {
        return this._activateFallback(
          `${type} provider failed to load. Using local alarm.`,
        );
      }

      throw loadError; // Local da başarısız olduysa fırlat
    }
  }

  /**
   * Alarmı çalar.
   * Çalma başarısız olursa fallback'e geçer.
   *
   * @param {number} duration - saniye (0 = doğal bitiş)
   * @returns {Promise<void>}
   */
  async play(duration = 0) {
    if (!this._provider) {
      throw new Error("AlarmManager: No provider loaded. Call load() first.");
    }

    try {
      await this._provider.play(duration);
      this._emit("onPlay", { type: this._providerType, duration });
      console.log(
        `AlarmManager: Playing [${this._providerType}] for ${duration || "∞"}s`,
      );
    } catch (playError) {
      console.error(
        `AlarmManager: [${this._providerType}] play failed:`,
        playError.message,
      );
      this._emit("onError", { error: playError, type: this._providerType });

      // Çalma başarısız → fallback'i yükle ve çal
      if (this._providerType !== "local") {
        await this._activateFallback(
          `${this._providerType} playback failed. Using local alarm.`,
        );
        await this._provider.play(duration);
        this._emit("onPlay", { type: "local", duration, wasFallback: true });
      }
    }
  }

  /**
   * Aktif alarmı durdurur.
   */
  async stop() {
    await this._stopCurrent();
    this._emit("onStop");
  }

  /**
   * Kaynağı yükler ve hemen çalar.
   * load() + play() kısayolu.
   *
   * @param {string} source
   * @param {number} duration
   * @param {object} opts
   */
  async loadAndPlay(source, duration = 0, opts = {}) {
    await this.load(source, opts);
    await this.play(duration);
  }

  /**
   * Aktif provider'ın hazır olup olmadığını döner.
   */
  isReady() {
    return this._provider?.isReady() ?? false;
  }

  /**
   * Aktif provider tipini döner.
   * @returns {string|null}
   */
  getProviderType() {
    return this._providerType;
  }

  // ── Private ────────────────────────────────────────────────

  /**
   * Fallback local provider'ı aktive eder.
   * @param {string} reason - Log mesajı
   */
  async _activateFallback(reason) {
    console.warn(`AlarmManager: Fallback triggered — ${reason}`);
    this._emit("onFallback", { reason });

    if (!this._fallbackSource) {
      console.error("AlarmManager: No fallback source configured.");
      return { type: "local", usedFallback: true };
    }

    // Fallback provider'ı yükle
    const fallback = new LocalAlarmProvider();
    await fallback.load(this._fallbackSource);

    this._provider = fallback;
    this._providerType = "local";

    return { type: "local", usedFallback: true };
  }

  async _stopCurrent() {
    if (this._provider) {
      try {
        await this._provider.stop();
      } catch (e) {}
    }
  }

  _emit(event, data = {}) {
    const cb = this[`_${event}`];
    if (typeof cb === "function") {
      try {
        cb(data);
      } catch (e) {
        console.error(`AlarmManager: ${event} callback error:`, e);
      }
    }
  }
}

// ── Singleton export ──────────────────────────────────────────
export const alarmManager = new AlarmManager();
