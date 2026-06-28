export function renderIntervalView() {
  return `
    <div class="interval-timer-container">

      <!-- Preset dropdown trigger -->
      <div class="preset-dropdown-wrapper">
        <button class="preset-trigger" id="presetTriggerBtn"
          aria-haspopup="listbox" aria-expanded="false"
          aria-label="Select preset">
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
        </button>

        <div class="preset-dropdown" id="presetDropdown"
          role="listbox" aria-label="Presets" hidden>
          <ul class="preset-dropdown__list" id="presetsContainer"></ul>
          <div class="preset-dropdown__footer">
            <button id="addPresetBtn" class="preset-dropdown__add">
              + New preset
            </button>
          </div>
        </div>
      </div>

      <!-- Inputs -->
      <div class="input-group">
        <div>
          <label for="workMinutes">Work Minutes:</label>
          <input type="number" id="workMinutes" min="0" value="25" />
        </div>
        <div>
          <label for="workSeconds">Work Seconds:</label>
          <input type="number" id="workSeconds" min="0" max="59" value="0" />
        </div>
        <div>
          <label for="breakMinutes">Break Minutes:</label>
          <input type="number" id="breakMinutes" min="0" value="5" />
        </div>
        <div>
          <label for="breakSeconds">Break Seconds:</label>
          <input type="number" id="breakSeconds" min="0" max="59" value="0" />
        </div>
        <div>
          <label for="loopCount">Number of Loops:</label>
          <input type="number" id="loopCount" min="1" value="4" />
        </div>
      </div>

      <div class="currentLoop">
        <label>Current Loop:</label>
        <span id="currentLoop">0</span>
      </div>

      <h1 id="intervalCountdown">00:00</h1>
      <p id="intervalStatus">Status: Ready</p>
      <p id="intervalPhase">Phase: -</p>

      <div class="button-group">
        <button id="startLoopBtn">Start</button>
        <button id="pauseLoopBtn">Pause</button>
        <button id="continueLoopBtn">Continue</button>
        <button id="resetIntervalBtn">Reset</button>
      </div>

    </div>
  `;
}
