import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";
import { setupTabListeners } from "./tabs.js";

const app = document.getElementById("app");

// ── Alarm settings ────────────────────────────────────────────
export let alarmSettings = {
  timerAlarmLength: 5,
  workAlarmLength: 5,
  breakAlarmLength: 5,
};

// ── Cleanup registry ──────────────────────────────────────────
let activeCleanup = null;

export function registerCleanup(fn) {
  activeCleanup = fn;
}

// ── Render both views once on startup ─────────────────────────
app.innerHTML = `
  <div id="intervalView">${renderIntervalView()}</div>
  <div id="timerView" class="hidden">${renderTimerView()}</div>
`;

// Setup both controllers once — they wire up to already-existing DOM
setupIntervalTimer();
setupTimer();

// ── Tab switching — show/hide only, no re-render ──────────────
export function switchTab(tab) {
  const intervalView = document.getElementById("intervalView");
  const timerView = document.getElementById("timerView");

  if (tab === "interval") {
    intervalView.classList.remove("hidden");
    timerView.classList.add("hidden");
  } else if (tab === "timer") {
    timerView.classList.remove("hidden");
    intervalView.classList.add("hidden");
  }

  // Highlight active tab button
  document.querySelectorAll(".tab-buttons button").forEach(button => {
    button.classList.toggle("active", button.getAttribute("data-tab") === tab);
  });

  // Sync settings modal to active tab
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
      ?.getAttribute("data-tab") || "interval";

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
switchTab("interval");
