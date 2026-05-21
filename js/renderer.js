import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";
import { setupTabListeners } from "./tabs.js";

const app = document.getElementById("app");

// ── Active cleanup registry ───────────────────────────────────
// Each tab setup can register a cleanup function here
let activeCleanup = null;

// ── Alarm settings (declared first, before any switchTab call) ──
export let alarmSettings = {
  timerAlarmLength: 5,
  workAlarmLength: 5,
  breakAlarmLength: 5,
};

export function registerCleanup(fn) {
  activeCleanup = fn;
}

// ── Tab switching ─────────────────────────────────────────────
export function switchTab(tab) {
  // Run cleanup for the previously active tab (stops any running timers)
  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }

  // Render the new view
  if (tab === "interval") {
    app.innerHTML = renderIntervalView();
    setupIntervalTimer();
  } else if (tab === "timer") {
    app.innerHTML = renderTimerView();
    setupTimer();
  }

  // Highlight the active tab button
  document.querySelectorAll(".tab-buttons button").forEach(button => {
    button.classList.toggle("active", button.getAttribute("data-tab") === tab);
  });

  // Sync settings modal visibility to active tab
  const timerSettings = document.getElementById("timerSettings");
  const intervalSettings = document.getElementById("intervalSettings");
  if (timerSettings) timerSettings.classList.toggle("hidden", tab !== "timer");
  if (intervalSettings)
    intervalSettings.classList.toggle("hidden", tab !== "interval");
}

// ── Settings modal ────────────────────────────────────────────
document.getElementById("settingsIcon").onclick = () => {
  const currentTab =
    document
      .querySelector(".tab-buttons button.active")
      ?.getAttribute("data-tab") || "timer";

  const timerSettings = document.getElementById("timerSettings");
  const intervalSettings = document.getElementById("intervalSettings");
  if (timerSettings)
    timerSettings.classList.toggle("hidden", currentTab !== "timer");
  if (intervalSettings)
    intervalSettings.classList.toggle("hidden", currentTab !== "interval");

  document.getElementById("settingsModal").classList.remove("hidden");
};

document.getElementById("closeSettingsBtn").onclick = () => {
  document.getElementById("settingsModal").classList.add("hidden");
};

document.getElementById("saveSettingsBtn").onclick = () => {
  const timerAlarmLength = parseInt(
    document.getElementById("timerAlarmLength").value,
    10,
  );
  const workAlarmLength = parseInt(
    document.getElementById("workAlarmLength").value,
    10,
  );
  const breakAlarmLength = parseInt(
    document.getElementById("breakAlarmLength").value,
    10,
  );

  // Use isNaN instead of || so that 0 is a valid saved value
  if (!isNaN(timerAlarmLength))
    alarmSettings.timerAlarmLength = timerAlarmLength;
  if (!isNaN(workAlarmLength)) alarmSettings.workAlarmLength = workAlarmLength;
  if (!isNaN(breakAlarmLength))
    alarmSettings.breakAlarmLength = breakAlarmLength;

  console.log("Updated alarmSettings:", alarmSettings);
  document.getElementById("settingsModal").classList.add("hidden");
};

// ── Alarm folder modal ────────────────────────────────────────
document.getElementById("alarmFolderBtn").onclick = () => {
  document.getElementById("alarmFolderModal").classList.remove("hidden");
};

document.getElementById("closeAlarmFolderBtn").onclick = () => {
  document.getElementById("alarmFolderModal").classList.add("hidden");
};

// ── Initialize ────────────────────────────────────────────────
setupTabListeners();
switchTab("interval"); // Default tab — alarmSettings is already declared above
