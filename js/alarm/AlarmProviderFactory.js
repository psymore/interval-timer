import { LocalAlarmProvider } from "./providers/LocalAlarmProvider.js";
import { YouTubeAlarmProvider } from "./providers/YouTubeAlarmProvider.js";
import { SpotifyAlarmProvider } from "./providers/SpotifyAlarmProvider.js";

/**
 * AlarmProviderFactory
 *
 * Sorumluluk: Kaynak türüne göre doğru provider'ı üretir.
 * AlarmManager bu factory'yi kullanır — provider sınıflarını doğrudan bilmez.
 *
 * Yeni provider eklemek için:
 *   1. /providers klasörüne yeni dosyayı ekle
 *   2. Factory'ye import ve kayıt ekle
 *   3. Başka hiçbir şey değişmez.
 *
 * Renderer process'te yaşar.
 */
export class AlarmProviderFactory {
  /**
   * Kayıtlı provider tipleri.
   * key   → tip adı (string)
   * value → provider class veya factory function
   */
  static _registry = new Map([
    ["local", () => new LocalAlarmProvider()],
    ["youtube", () => new YouTubeAlarmProvider()],
    ["spotify", opts => new SpotifyAlarmProvider(opts)],
    // Gelecekte:
    // ["soundcloud", () => new SoundCloudAlarmProvider()],
    // ["radio",      () => new RadioAlarmProvider()],
  ]);

  /**
   * Kaynak string'den provider tipini otomatik tespit eder.
   * @param {string} source
   * @returns {"local"|"youtube"|"spotify"|"unknown"}
   */
  static detect(source) {
    if (!source) return "local";

    // Local — file:// protokolü veya Windows path
    if (
      source.startsWith("file://") ||
      /^[a-zA-Z]:[\\\/]/.test(source) ||
      source.startsWith("/")
    )
      return "local";

    // YouTube
    if (
      source.includes("youtube.com") ||
      source.includes("youtu.be") ||
      /^[a-zA-Z0-9_-]{11}$/.test(source)
    )
      return "youtube";

    // Spotify
    if (source.includes("spotify.com") || source.startsWith("spotify:"))
      return "spotify";

    return "local"; // bilinmeyeni local'e düşür
  }

  /**
   * Belirtilen tip için yeni bir provider instance'ı oluşturur.
   * @param {string} type  - "local" | "youtube" | "spotify"
   * @param {object} opts  - Provider'a özel opsiyonlar
   * @returns {BaseAlarmProvider}
   */
  static create(type, opts = {}) {
    const factory = this._registry.get(type);
    if (!factory) {
      throw new Error(
        `AlarmProviderFactory: Unknown provider type "${type}". ` +
          `Registered types: ${[...this._registry.keys()].join(", ")}`,
      );
    }
    return factory(opts);
  }

  /**
   * Kaynak string'den otomatik provider oluşturur.
   * Tip tespiti + instance üretimini birleştirir.
   * @param {string} source
   * @param {object} opts
   * @returns {{ provider: BaseAlarmProvider, type: string }}
   */
  static createFromSource(source, opts = {}) {
    const type = this.detect(source);
    const provider = this.create(type, opts);
    return { provider, type };
  }

  /**
   * Yeni bir provider tipini runtime'da kaydeder.
   * Gelecekteki plugin sistemi için.
   * @param {string}   type
   * @param {Function} factory
   */
  static register(type, factory) {
    if (this._registry.has(type)) {
      console.warn(
        `AlarmProviderFactory: Overwriting existing provider "${type}".`,
      );
    }
    this._registry.set(type, factory);
  }

  /**
   * Kayıtlı tüm provider tiplerini döner.
   * @returns {string[]}
   */
  static getRegisteredTypes() {
    return [...this._registry.keys()];
  }
}
