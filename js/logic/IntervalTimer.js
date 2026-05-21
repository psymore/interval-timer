export class IntervalTimer {
  constructor({ workDuration, breakDuration, onTick, onPhaseChange }) {
    this.workDuration = workDuration * 1000;
    this.breakDuration = breakDuration * 1000;
    this.onTick = onTick;
    this.onPhaseChange = onPhaseChange;

    this.startTime = null;
    this.duration = this.workDuration;
    this.phase = "work";
    this._intervalId = null;
  }

  start(remainingTime = null) {
    if (remainingTime !== null) {
      this.duration = remainingTime;
    }
    this.startTime = Date.now();
    this._clearInterval();
    this._intervalId = setInterval(() => this._tick(), 200); // 200ms for smooth UI, still reliable
    this._tick(); // fire immediately so UI doesn't lag on start
  }

  _tick() {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(this.duration - elapsed, 0);

    this.onTick(remaining, this.phase);

    if (remaining <= 0) {
      // Stop current interval before switching phase to prevent double-firing
      this._clearInterval();

      this.phase = this.phase === "work" ? "break" : "work";
      this.duration =
        this.phase === "work" ? this.workDuration : this.breakDuration;
      this.startTime = Date.now();

      this.onPhaseChange(this.phase);

      // Restart interval for the new phase
      this._intervalId = setInterval(() => this._tick(), 200);
    }
  }

  stop() {
    this._clearInterval();
  }

  reset() {
    this._clearInterval();
    this.phase = "work";
    this.duration = this.workDuration;
    this.startTime = null;
  }

  getRemainingTime() {
    if (!this.startTime) {
      return this.duration;
    }
    const elapsed = Date.now() - this.startTime;
    return Math.max(this.duration - elapsed, 0);
  }

  _clearInterval() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
