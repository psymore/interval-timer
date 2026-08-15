export function renderTimerView() {
  return `
    <div class="timer-container">

      <div class="input-group">
        <label for="minutes">
          <span data-i18n="timer.minutes">Minutes:</span>
          <input type="number" id="minutes" min="0" value="0" />
        </label>
        <label for="seconds">
          <span data-i18n="timer.seconds">Seconds:</span>
          <input type="number" id="seconds" min="0" max="59" value="0" />
        </label>
      </div>

      <h2 id="countdown">00:00</h2>
      <p id="timerStatus">Status: Ready</p>

      <div class="button-group">
        <button id="startBtn" data-i18n="timer.start">Start</button>
        <button id="pauseBtn" data-i18n="timer.pause">Pause</button>
        <button id="continueBtn" data-i18n="timer.continue">Continue</button>
        <button id="stopBtn" data-i18n="timer.stop">Stop</button>
        <button id="resetBtn" data-i18n="timer.reset">Reset</button>
      </div>

    </div>
  `;
}
