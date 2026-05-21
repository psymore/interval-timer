export class Timer {
  constructor({ duration, onTick, onComplete }) {
    this.duration = duration * 1000; // in ms
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.startTime = null;
    this.remainingTime = this.duration;
    this._intervalId = null;
    this._completed = false;
  }

  start() {
    if (this._completed) return; // Don't restart if already finished
    this.startTime = Date.now();
    this._clearInterval();
    this._intervalId = setInterval(() => this._tick(), 200);
    this._tick(); // Fire immediately so UI doesn't lag on start
  }

  _tick() {
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
    this._clearInterval();
    // Snapshot remaining time correctly so resume works
    const elapsed = Date.now() - this.startTime;
    this.remainingTime = Math.max(this.remainingTime - elapsed, 0);
    this.startTime = null; // Clear so start() anchors fresh on resume
  }

  reset() {
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
