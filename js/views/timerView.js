export function renderTimerView() {
  return `
    <div class="timer-container">

      <div class="input-group">
        <label for="minutes">
          <span>Minutes:</span>
          <input type="number" id="minutes" min="0" value="0" />
        </label>
        <label for="seconds">
          <span>Seconds:</span>
          <input type="number" id="seconds" min="0" max="59" value="0" />
        </label>
      </div>

      <h2 id="countdown">00:00</h2>
      <p id="timerStatus">Status: Ready</p>

      <div class="button-group">
        <button id="startBtn">Start</button>
        <button id="pauseBtn">Pause</button>
        <button id="continueBtn">Continue</button>
        <button id="stopBtn">Stop</button>
        <button id="resetBtn">Reset</button>
      </div>

    </div>
  `;
}
