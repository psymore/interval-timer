export class Timer {
  constructor({ duration, onTick, onComplete }) {
    this.duration = duration * 1000;
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.startTime = null;
    this.remainingTime = this.duration;
    this._intervalId = null;
    this._completed = false;
    this._stopped = false; // ← same guard as IntervalTimer
  }

  start() {
    if (this._completed) return;
    this._stopped = false;
    this.startTime = Date.now();
    this._clearInterval();
    this._intervalId = setInterval(() => this._tick(), 200);
    this._tick();
  }

  _tick() {
    if (this._stopped) return;

    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(this.remainingTime - elapsed, 0);

    this.onTick(remaining);

    if (remaining <= 0) {
      this._clearInterval();
      this._completed = true;
      this.remainingTime = 0;
      this.onComplete();
    }
  }

  stop() {
    if (this._completed) return;
    this._stopped = true;
    this._clearInterval();
    const elapsed = Date.now() - this.startTime;
    this.remainingTime = Math.max(this.remainingTime - elapsed, 0);
    this.startTime = null;
  }

  reset() {
    this._stopped = true;
    this._clearInterval();
    this.remainingTime = this.duration;
    this.startTime = null;
    this._completed = false;
  }

  getRemainingTime() {
    if (this._completed) return 0;
    if (!this.startTime) return this.remainingTime;
    const elapsed = Date.now() - this.startTime;
    return Math.max(this.remainingTime - elapsed, 0);
  }

  _clearInterval() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
