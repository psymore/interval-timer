/**
 * BaseAlarmProvider
 *
 * Tüm provider'ların implemente etmesi gereken interface.
 * Doğrudan kullanılmaz — sadece miras alınır.
 *
 * Contract:
 *   - load(source)  → provider'ı hazırlar
 *   - play()        → alarmı başlatır
 *   - stop()        → alarmı durdurur
 *   - isReady()     → çalmaya hazır mı?
 *   - getName()     → provider adı (debug için)
 */
export class BaseAlarmProvider {
  constructor() {
    if (new.target === BaseAlarmProvider) {
      throw new Error("BaseAlarmProvider cannot be instantiated directly.");
    }
  }

  /**
   * Provider'ı verilen kaynak için hazırlar.
   * @param {string} source - Dosya yolu, URL, track ID vb.
   * @returns {Promise<void>}
   */
  async load(source) {
    throw new Error(`${this.getName()}: load() must be implemented.`);
  }

  /**
   * Alarmı başlatır.
   * @param {number} duration - Kaç saniye çalacak (0 = dosya bitene kadar)
   * @returns {Promise<void>}
   */
  async play(duration = 0) {
    throw new Error(`${this.getName()}: play() must be implemented.`);
  }

  /**
   * Alarmı durdurur ve sıfırlar.
   * @returns {Promise<void>}
   */
  async stop() {
    throw new Error(`${this.getName()}: stop() must be implemented.`);
  }

  /**
   * Provider çalmaya hazır mı?
   * @returns {boolean}
   */
  isReady() {
    throw new Error(`${this.getName()}: isReady() must be implemented.`);
  }

  /**
   * Provider'ın adını döner.
   * @returns {string}
   */
  getName() {
    return this.constructor.name;
  }
}
