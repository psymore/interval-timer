export class Timer {
  constructor({ duration, onTick, onComplete }) {
    this.duration = duration * 1000; // in ms
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.startTime = null;
    this.remainingTime = this.duration;
    this.rafId = null;
  }

  start() {
    this.startTime = Date.now();
    this.tick();
  }

  tick = () => {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(this.remainingTime - elapsed, 0);

    this.onTick(remaining);

    if (remaining <= 0) {
      this.stop();
      this.onComplete();
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  stop() {
    cancelAnimationFrame(this.rafId);
    this.remainingTime -= Date.now() - this.startTime;
  }

  reset() {
    this.stop();
    this.remainingTime = this.duration;
    this.startTime = null;
  }
}
