import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";

const app = document.getElementById("app");

export function switchTab(tab) {
  if (tab === "interval") {
    app.innerHTML = renderIntervalView();
    setupTimer();
  } else if (tab === "timer") {
    app.innerHTML = renderTimerView();
    setupIntervalTimer();
  }
}

window.switchTab = switchTab;
switchTab("interval"); // or "timer"
