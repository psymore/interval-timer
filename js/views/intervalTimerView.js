export function renderIntervalView() {
  return `
    <div class="interval-timer-container">
      <div class="button-group">
        <button id="startLoopBtn">Start Loop</button>
        <button id="stopLoopBtn">Stop After Current</button>
        <button id="pauseLoopBtn">Pause</button>
        <button id="continueLoopBtn">Continue</button>
        <button id="resetIntervalBtn">Reset</button>
      </div>

      <div class="input-group">
        <div>
          <label for="workMinutes">Work Minutes:</label>
          <input type="number" id="workMinutes" min="0" value="0" />
        </div>
        <div>
          <label for="workSeconds">Work Seconds:</label>
          <input type="number" id="workSeconds" min="0" max="59" value="1" />
        </div>
        <div>
          <label for="breakMinutes">Break Minutes:</label>
          <input type="number" id="breakMinutes" min="0" value="0" />
        </div>
        <div>
          <label for="breakSeconds">Break Seconds:</label>
          <input type="number" id="breakSeconds" min="0" max="59" value="1" />
        </div>
        <div>
          <label for="loopCount">Number of Loops:</label>
          <input type="number" id="loopCount" min="1" value="3" />
        </div>
      </div>

      <div class="currentLoop">
        <label>Current Loop</label>
        <span id="currentLoop">1</span>
      </div>

      <h2 id="intervalCountdown">00:00</h2>
      <p id="intervalStatus">Status: Ready</p>
    </div>
  `;
}
