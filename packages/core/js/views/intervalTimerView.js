export function renderIntervalView() {
  return `
    <div class="interval-timer-container">

      <!-- Preset dropdown trigger -->
      <div class="preset-dropdown-wrapper">
        <button class="preset-trigger no-hover-lift" id="presetTriggerBtn"
          aria-haspopup="listbox" aria-expanded="false"
          aria-label="Select preset" data-i18n-aria-label="interval.selectPresetAriaLabel">
          <span class="preset-trigger__label" id="presetTriggerLabel">Presets</span>
          <span class="preset-alarm-health-badge hidden" id="presetTriggerAlarmBadge" data-i18n="presets.alarmBrokenBadge">broken</span>
          <span class="preset-trigger__chevron" aria-hidden="true">▾</span>
        </button>

        <div class="preset-dropdown" id="presetDropdown"
          role="listbox" aria-label="Presets" data-i18n-aria-label="interval.presetsListAriaLabel" hidden>
          <ul class="preset-dropdown__list" id="presetsContainer"></ul>
          <div class="preset-dropdown__footer">
            <button id="addPresetBtn" class="preset-dropdown__add no-hover-lift" data-i18n="interval.addPreset">
              + New preset
            </button>
          </div>
        </div>
      </div>

      <div class="currentLoop">
        <label data-i18n="interval.currentLoop">Current Loop:</label>
        <span id="currentLoop">0</span>
      </div>

      <h1 id="intervalCountdown">00:00</h1>
      <p id="intervalStatus">Status: Ready</p>
      <p id="intervalPhase">Phase: -</p>

      <div class="button-group">
        <button id="startLoopBtn" data-i18n="interval.start">Start</button>
        <button id="pauseLoopBtn" data-i18n="interval.pause">Pause</button>
        <button id="continueLoopBtn" data-i18n="interval.continue">Continue</button>
        <button id="resetIntervalBtn" data-i18n="interval.reset">Reset</button>
      </div>

      <!-- Inputs -->
      <div class="input-group">
        <label for="workMinutes">
          <span data-i18n="interval.workMinutes">Work Minutes:</span>
          <input type="number" id="workMinutes" min="0" value="25" />
        </label>
        <label for="workSeconds">
          <span data-i18n="interval.workSeconds">Work Seconds:</span>
          <input type="number" id="workSeconds" min="0" max="59" value="0" />
        </label>
        <label for="breakMinutes">
          <span data-i18n="interval.breakMinutes">Break Minutes:</span>
          <input type="number" id="breakMinutes" min="0" value="5" />
        </label>
        <label for="breakSeconds">
          <span data-i18n="interval.breakSeconds">Break Seconds:</span>
          <input type="number" id="breakSeconds" min="0" max="59" value="0" />
        </label>
        <label for="loopCount">
          <span data-i18n="interval.loopCount">Number of Loops:</span>
          <input type="number" id="loopCount" min="1" value="4" />
        </label>
      </div>

    </div>
  `;
}
