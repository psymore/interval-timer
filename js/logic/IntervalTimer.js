export class IntervalTimer {
  constructor({ workDuration, breakDuration, onTick, onPhaseChange }) {
    this.workDuration = workDuration * 1000; // in ms
    this.breakDuration = breakDuration * 1000;
    this.onTick = onTick;
    this.onPhaseChange = onPhaseChange;

    this.startTime = null;
    this.duration = this.workDuration;
    this.phase = "work";
    this.rafId = null;
  }

  start() {
    this.startTime = Date.now();
    this.tick();
  }

  tick = () => {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(this.duration - elapsed, 0);

    this.onTick(remaining, this.phase);

    if (remaining <= 0) {
      this.phase = this.phase === "work" ? "break" : "work";
      this.duration =
        this.phase === "work" ? this.workDuration : this.breakDuration;
      this.startTime = Date.now();

      this.onPhaseChange(this.phase);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  stop() {
    cancelAnimationFrame(this.rafId);
  }

  reset() {
    this.stop();
    this.phase = "work";
    this.duration = this.workDuration;
    this.startTime = null;
  }
}
