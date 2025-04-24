import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";
import { setupTabListeners } from "./tabs.js";

const app = document.getElementById("app");

export function switchTab(tab) {
  // Render the appropriate view and setup logic
  if (tab === "interval") {
    app.innerHTML = renderIntervalView();
    setupIntervalTimer();
  } else if (tab === "timer") {
    app.innerHTML = renderTimerView();
    setupTimer();
  }

  // Dynamically update modal content based on the active tab
  const timerSettings = document.getElementById("timerSettings");
  const intervalSettings = document.getElementById("intervalSettings");

  if (timerSettings) {
    timerSettings.classList.toggle("hidden", tab !== "timer");
  }
  if (intervalSettings) {
    intervalSettings.classList.toggle("hidden", tab !== "interval");
  }

  // Ensure the active tab button is highlighted
  document.querySelectorAll(".tab-buttons button").forEach(button => {
    button.classList.toggle("active", button.getAttribute("data-tab") === tab);
  });

  // Ensure visibility of tab contents
  const intervalContainer = document.getElementById("intervalTimerContainer");
  const timerContainer = document.getElementById("timerContainer");

  if (intervalContainer && timerContainer) {
    intervalContainer.classList.remove("hidden");
    timerContainer.classList.remove("hidden");

    if (tab === "interval") {
      timerContainer.classList.add("hidden");
    } else if (tab === "timer") {
      intervalContainer.classList.add("hidden");
    }
  }
}

// Initialize tab listeners
setupTabListeners();

// Default to the "interval" tab on load
switchTab("interval");

let alarmSettings = {
  timerAlarmLength: 5,
  workAlarmLength: 5,
  breakAlarmLength: 5,
};

// Settings modal controls
document.getElementById("settingsIcon").onclick = () => {
  document.getElementById("settingsModal").classList.remove("hidden");
  const currentTab =
    document
      .querySelector(".tab-buttons button.active")
      ?.getAttribute("data-tab") || "timer";
  document
    .getElementById("timerSettings")
    .classList.toggle("hidden", currentTab !== "timer");
  document
    .getElementById("intervalSettings")
    .classList.toggle("hidden", currentTab !== "interval");
};

document.getElementById("closeSettingsBtn").onclick = () => {
  document.getElementById("settingsModal").classList.add("hidden");
};

document.getElementById("saveSettingsBtn").onclick = () => {
  const timerAlarmLength = parseInt(
    document.getElementById("timerAlarmLength").value,
    10
  );
  const workAlarmLength = parseInt(
    document.getElementById("workAlarmLength").value,
    10
  );
  const breakAlarmLength = parseInt(
    document.getElementById("breakAlarmLength").value,
    10
  );

  alarmSettings.timerAlarmLength =
    timerAlarmLength || alarmSettings.timerAlarmLength;
  alarmSettings.workAlarmLength =
    workAlarmLength || alarmSettings.workAlarmLength;
  alarmSettings.breakAlarmLength =
    breakAlarmLength || alarmSettings.breakAlarmLength;

  console.log("Updated alarmSettings:", alarmSettings);
  document.getElementById("settingsModal").classList.add("hidden");
};

export { alarmSettings };

// Listen for Electron-powered timer ticks (replace local timer loops)
window.electronAPI.onTick(() => {
  const activeTab = document
    .querySelector(".tab-buttons button.active")
    ?.getAttribute("data-tab");

  if (activeTab === "interval" && window.intervalTick) {
    window.intervalTick(); // Should be defined in setupIntervalTimer
  } else if (activeTab === "timer" && window.timerTick) {
    window.timerTick(); // Should be defined in setupTimer
  }
});

document.getElementById("alarmFolderBtn").onclick = () => {
  document.getElementById("alarmFolderModal").classList.remove("hidden");
};

document.getElementById("closeAlarmFolderBtn").onclick = () => {
  document.getElementById("alarmFolderModal").classList.add("hidden");
};
