import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";

const app = document.getElementById("app");

export function switchTab(tab) {
  if (tab === "interval") {
    app.innerHTML = renderIntervalView();
    setupIntervalTimer();
  } else if (tab === "timer") {
    app.innerHTML = renderTimerView();
    setupTimer();
  }

  // Dynamically update modal content based on the active tab
  document
    .getElementById("timerSettings")
    .classList.toggle("hidden", tab !== "timer");
  document
    .getElementById("intervalSettings")
    .classList.toggle("hidden", tab !== "interval");
}

window.switchTab = switchTab;
switchTab("interval"); // or "timer"

let alarmSettings = {
  timerAlarmLength: 5,
  workAlarmLength: 5,
  breakAlarmLength: 5,
};

document.getElementById("settingsIcon").onclick = () => {
  document.getElementById("settingsModal").classList.remove("hidden");
  const currentTab = document
    .querySelector(".tab-buttons button.active")
    .getAttribute("data-tab");
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

  // Debugging: Log the values being saved
  console.log("Saving settings:", {
    timerAlarmLength,
    workAlarmLength,
    breakAlarmLength,
  });

  alarmSettings.timerAlarmLength =
    timerAlarmLength || alarmSettings.timerAlarmLength;
  alarmSettings.workAlarmLength =
    workAlarmLength || alarmSettings.workAlarmLength;
  alarmSettings.breakAlarmLength =
    breakAlarmLength || alarmSettings.breakAlarmLength;

  // Debugging: Log the updated alarmSettings object
  console.log("Updated alarmSettings:", alarmSettings);

  document.getElementById("settingsModal").classList.add("hidden");
};

// Export alarmSettings for use in other modules
export { alarmSettings };
