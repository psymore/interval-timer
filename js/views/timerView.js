export function renderTimerView() {
  return `
  <div class="timer-container">
      <div class="button-group">
        <button id="startBtn">Start</button>
        <button id="stopBtn">Stop</button>
        <button id="continueBtn">Continue</button>
        <button id="resetBtn">Reset</button>
      </div>
  
      <div class="input-group">
        <div>
          <label> Minutes:</label>
           <input type="number" id="minutes" min="0" value="0" />
        </div>
        <div>
          <label> Seconds:</label>
           <input type="number" id="seconds" min="0" max="59" value="0" />
        </div>
      </div>
  
      <h2 id="countdown">00:00</h2>
  </div>
    `;
}
