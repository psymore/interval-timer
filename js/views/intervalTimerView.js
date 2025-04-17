export function renderIntervalView() {
  return `
    <div class="interval-timer-container">
      <div class="button-group">
        <button id="startLoopBtn">Start Loop</button>
        <button id="stopLoopBtn">Stop After Current</button>
        <button id="resetIntervalBtn">Reset</button>
      </div>

      <div class="input-group">
        <label>Work Minutes: <input type="number" id="workMinutes" min="0" value="0" /></label>
        <label>Work Seconds: <input type="number" id="workSeconds" min="0" max="59" value="1" /></label>
        <label>Break Minutes: <input type="number" id="breakMinutes" min="0" value="0" /></label>
        <label>Break Seconds: <input type="number" id="breakSeconds" min="0" max="59" value="1" /></label>
        <label>Number of Loops: <input type="number" id="loopCount" min="1" value="3" /></label>
        <label>Current Loop: <span id="currentLoop">1</span></label>  
      </div>

      <h2 id="intervalCountdown">00:00</h2>
      <p id="intervalStatus">Status: Ready</p>
    </div>
  `;
}
