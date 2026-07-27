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
    this._stopped = false; // ← guards against restart after stop
  }

  start(remainingTime = null) {
    if (remainingTime !== null) {
      this.duration = remainingTime;
    }
    this._stopped = false; // ← clear flag on every start
    this.startTime = Date.now();
    this._clearInterval();
    this._intervalId = setInterval(() => this._tick(), 200);
    this._tick();
  }

  _tick() {
    if (this._stopped) return; // ← bail if stopped mid-tick

    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(this.duration - elapsed, 0);

    this.onTick(remaining, this.phase);

    if (remaining <= 0) {
      this._clearInterval();

      this.phase = this.phase === "work" ? "break" : "work";
      this.duration =
        this.phase === "work" ? this.workDuration : this.breakDuration;
      this.startTime = Date.now();

      // onPhaseChange may call stop() — check _stopped before restarting
      this.onPhaseChange(this.phase);

      // Only restart if stop() was NOT called during onPhaseChange
      if (!this._stopped) {
        this._intervalId = setInterval(() => this._tick(), 200);
      }
    }
  }

  stop() {
    this._stopped = true; // ← set before clearing so _tick sees it
    this._clearInterval();
  }

  reset() {
    this._stopped = true;
    this._clearInterval();
    this.phase = "work";
    this.duration = this.workDuration;
    this.startTime = null;
  }

  getRemainingTime() {
    if (!this.startTime) return this.duration;
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
