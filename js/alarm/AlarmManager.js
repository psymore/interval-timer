import { AlarmProviderFactory } from "./AlarmProviderFactory.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("AlarmManager");

class AlarmManager {
  constructor() {
    this._provider = null;
    this._fallbackSource = null;
    this._defaultSource = null;
    this._currentSource = null;
    this._providerType = null;
    this._onError = null;
    this._onFallback = null;
    this._onPlay = null;
    this._onStop = null;
  }

  // ── Başlangıç ─────────────────────────────────────────────

  /**
   * AlarmManager'ı başlatır.
   * localStorage'daki kaynağı tespit eder, doğru şekilde yükler.
   * @param {string} defaultSource - Hiçbir şey seçilmemişse kullanılacak yol
   */
  async initialize(defaultSource) {
    this._defaultSource = defaultSource;
    this.setFallbackSource(defaultSource);

    const savedSource = localStorage.getItem("selectedAlarmPath");

    if (!savedSource) {
      // Kayıtlı kaynak yok — default'u yükle
      try {
        await this.load(defaultSource);
      } catch (e) {
        log.error("AlarmManager: Default source failed:", e.message);
      }
      return;
    }

    // Kaynak tipini tespit et — local mi, URL mi?
    const detectedType = AlarmProviderFactory.detect(savedSource);
    let sourceToLoad = savedSource;

    if (detectedType === "local") {
      // Sadece local dosyalar için file:// dönüşümü yap
      sourceToLoad = this._toFileUrl(savedSource);
    }
    // Spotify veya YouTube ise ham URL'yi koru

    try {
      if (detectedType === "spotify") {
        // Spotify için token hazırla, sonra yükle
        const opts = await this._buildSpotifyOpts();
        await this.load(sourceToLoad, opts);
      } else {
        await this.load(sourceToLoad);
      }
    } catch (e) {
      log.warn(
        `AlarmManager: Saved source [${detectedType}] failed, ` +
          `falling back to default. Error: ${e.message}`,
      );
      try {
        await this.load(defaultSource);
      } catch (e2) {
        log.error("AlarmManager: Default source also failed:", e2.message);
      }
    }
  }

  // ── Konfigürasyon ──────────────────────────────────────────

  setFallbackSource(localFilePath) {
    this._fallbackSource = localFilePath;
  }

  setCallbacks({ onError, onFallback, onPlay, onStop } = {}) {
    if (onError !== undefined) this._onError = onError;
    if (onFallback !== undefined) this._onFallback = onFallback;
    if (onPlay !== undefined) this._onPlay = onPlay;
    if (onStop !== undefined) this._onStop = onStop;
  }

  // ── Ana API ────────────────────────────────────────────────

  /**
   * Kaynağı yükler. Tip otomatik tespit edilir.
   * @param {string} source
   * @param {object} opts - Provider opsiyonları
   */
  async load(source, opts = {}) {
    await this._stopCurrent();

    if (
      AlarmProviderFactory.detect(source) === "spotify" &&
      !opts.accessToken
    ) {
      try {
        const spotifyOpts = await this._buildSpotifyOpts();
        opts = { ...spotifyOpts, ...opts };
        log.info("AlarmManager: Spotify opts prepared:", {
          hasToken: !!opts.accessToken,
        });
      } catch (e) {
        log.error("AlarmManager: Spotify token prep FAILED:", e.message); // ← warn yerine error, daha görünür
      }
    }

    const { provider, type } = AlarmProviderFactory.createFromSource(
      source,
      opts,
    );

    try {
      await provider.load(source);
      // Tear down the outgoing provider's external resources (e.g. a
      // YouTube YT.Player instance) before it's discarded — otherwise
      // switching alarm sources repeatedly leaks players.
      this._provider?.destroy?.();
      this._provider = provider;
      this._providerType = type;
      this._currentSource = source;
      log.info(`AlarmManager: Loaded [${type}] — "${source}"`);
      return { type, usedFallback: false };
    } catch (loadError) {
      log.error(`AlarmManager: [${type}] load failed:`, loadError.message);
      this._emit("onError", { error: loadError, type, source });

      if (type !== "local") {
        return this._activateFallback(
          `${type} provider failed to load. Using local alarm.`,
        );
      }
      throw loadError;
    }
  }

  /**
   * Alarmı çalar.
   * @param {number} duration - saniye (0 = doğal bitiş)
   */
  async play(duration = 0) {
    if (!this._provider) {
      throw new Error("AlarmManager: No provider loaded. Call load() first.");
    }

    // Spotify token süresi dolmuş olabilir — çalmadan önce kontrol et
    if (this._providerType === "spotify") {
      try {
        await this._refreshSpotifyTokenIfNeeded();
        const tokens = await window.electronAPI.spotifyGetTokens();
        this._provider.setAccessToken(tokens?.accessToken ?? null);
      } catch (e) {
        log.warn("AlarmManager: Spotify token refresh failed:", e.message);
      }
    }

    try {
      await this._provider.play(duration);
      this._emit("onPlay", { type: this._providerType, duration });
    } catch (playError) {
      log.error(
        `AlarmManager: [${this._providerType}] play failed:`,
        playError.message,
      );
      this._emit("onError", { error: playError, type: this._providerType });

      if (this._providerType !== "local") {
        await this._activateFallback(
          `${this._providerType} playback failed. Using local alarm.`,
        );
        await this._provider.play(duration);
        this._emit("onPlay", { type: "local", duration, wasFallback: true });
      }
    }
  }

  async stop() {
    await this._stopCurrent();
    this._emit("onStop");
  }

  /**
   * Mevcut provider duraklatmayı destekliyorsa (şu an sadece Spotify)
   * duraklatır; desteklemiyorsa (local/YouTube) sessizce hiçbir şey yapmaz.
   */
  async pauseCurrent() {
    if (this._provider && typeof this._provider.pause === "function") {
      try {
        await this._provider.pause();
      } catch (e) {}
    }
  }

  /**
   * pauseCurrent() ile duraklatılmış olanı devam ettirir. play() ile aynı
   * şekilde, devam ettirmeden önce Spotify token'ını tazeler.
   */
  async resumeCurrent() {
    if (!this._provider || typeof this._provider.resume !== "function") return;

    if (this._providerType === "spotify") {
      try {
        await this._refreshSpotifyTokenIfNeeded();
        const tokens = await window.electronAPI.spotifyGetTokens();
        this._provider.setAccessToken(tokens?.accessToken ?? null);
      } catch (e) {
        log.warn("AlarmManager: Spotify token refresh failed:", e.message);
      }
    }

    try {
      await this._provider.resume();
    } catch (e) {}
  }

  async loadAndPlay(source, duration = 0, opts = {}) {
    await this.load(source, opts);
    await this.play(duration);
  }

  isReady() {
    return this._provider?.isReady() ?? false;
  }

  getProviderType() {
    return this._providerType;
  }

  // ── Spotify token yönetimi ────────────────────────────────

  /**
   * Spotify için geçerli bir kullanıcı accessToken'ı içeren opts döner.
   * Önce localStorage'a bakar. Token süresi dolmuşsa/dolmak üzereyse
   * refresh eder. Ne geçerli token ne de refresh token varsa fırlatır —
   * bu, load()'daki mevcut non-local-provider catch bloğunu tetikleyip
   * local alarm fallback'ine düşürür.
   */
  async _buildSpotifyOpts() {
    const stored = await window.electronAPI.spotifyGetTokens();
    const refreshToken = stored?.refreshToken;
    const expiresAt = stored?.expiresAt ?? 0;
    const accessToken = stored?.accessToken;

    if (accessToken && Date.now() < expiresAt) {
      return { accessToken };
    }

    if (refreshToken) {
      try {
        const tokens = await window.electronAPI.spotifyRefresh(refreshToken);
        await this._saveSpotifyTokens(tokens);
        return { accessToken: tokens.accessToken };
      } catch (e) {
        log.warn("AlarmManager: Refresh token failed:", e.message);
        await this._clearSpotifyTokens();
      }
    }

    throw new Error(
      "AlarmManager: No Spotify session. Connect a Spotify account first.",
    );
  }

  /**
   * Alarm çalmadan önce token'ın geçerliliğini kontrol eder.
   * Süresi dolmak üzereyse sessizce refresh eder.
   */
  async _refreshSpotifyTokenIfNeeded() {
    const stored = await window.electronAPI.spotifyGetTokens();
    const expiresAt = stored?.expiresAt ?? 0;
    const refreshToken = stored?.refreshToken;

    // 60 saniyeden az kaldıysa refresh et
    if (refreshToken && Date.now() > expiresAt - 60_000) {
      try {
        const tokens = await window.electronAPI.spotifyRefresh(refreshToken);
        await this._saveSpotifyTokens(tokens);
        log.info("AlarmManager: Spotify token silently refreshed.");
      } catch (e) {
        log.warn("AlarmManager: Silent token refresh failed:", e.message);
      }
    }
  }

  async _saveSpotifyTokens(tokens) {
    await window.electronAPI.spotifySaveTokens(tokens);
  }

  async _clearSpotifyTokens() {
    await window.electronAPI.spotifyClearTokens();
  }

  // ── Private ────────────────────────────────────────────────

  async _activateFallback(reason) {
    log.warn(`AlarmManager: Fallback triggered — ${reason}`);
    this._emit("onFallback", { reason });

    if (!this._fallbackSource) {
      log.error("AlarmManager: No fallback source configured.");
      return { type: "local", usedFallback: true };
    }

    const fallback = AlarmProviderFactory.create("local");
    await fallback.load(this._fallbackSource);
    this._provider?.destroy?.();
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

  // Renderer http:// origin'inden yüklendiği için file:// kaynaklar artık
  // çalışmıyor — main.js'in /local-audio/ route'u üzerinden aynı origin'den
  // servis ediyoruz (bkz. alarmModal.js toFileUrl).
  _toFileUrl(filePath) {
    return `${window.location.origin}/local-audio/${encodeURIComponent(filePath)}`;
  }

  _emit(event, data = {}) {
    const cb = this[`_${event}`];
    if (typeof cb === "function") {
      try {
        cb(data);
      } catch (e) {
        log.error(`AlarmManager: ${event} callback error:`, e);
      }
    }
  }
}

export const alarmManager = new AlarmManager();
