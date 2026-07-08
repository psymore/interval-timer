import { renderTimerView } from "./views/timerView.js";
import { renderIntervalView } from "./views/intervalTimerView.js";
import { setupTimer } from "./timer.js";
import { setupIntervalTimer } from "./intervalTimer.js";
import { setupTabListeners, switchTab } from "./tabs.js";
import { enhanceNumberInputs } from "./numberStepper.js";

const app = document.getElementById("app");

// ── Alarm settings ────────────────────────────────────────────
export let alarmSettings = {
  timerAlarmLength: 5,
  workAlarmLength: 5,
  breakAlarmLength: 5,
};

// ── Render both views once on startup ─────────────────────────
app.innerHTML = `
  <div id="intervalView">${renderIntervalView()}</div>
  <div id="timerView" class="hidden">${renderTimerView()}</div>
`;

// Setup both controllers once — they wire up to already-existing DOM
setupIntervalTimer(alarmSettings);
setupTimer(alarmSettings);

// Replace native number-input spin buttons with themed ones
// (covers the timer/interval views above plus the static settings modal)
enhanceNumberInputs(document);

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

// ── Modal keyboard handling ───────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const settingsModal = document.getElementById("settingsModal");
  const alarmModal = document.getElementById("alarmFolderModal");
  if (!settingsModal.classList.contains("hidden")) {
    settingsModal.classList.add("hidden");
  } else if (!alarmModal.classList.contains("hidden")) {
    alarmModal.classList.add("hidden");
  }
});

// ── Always on Top toggle ──────────────────────────────────────
let alwaysOnTop = false;

const aotBtn = document.getElementById("alwaysOnTopBtn");
if (aotBtn) {
  aotBtn.addEventListener("click", () => {
    alwaysOnTop = !alwaysOnTop;
    window.electronAPI.setAlwaysOnTop(alwaysOnTop);
    aotBtn.classList.toggle("active", alwaysOnTop);
    aotBtn.setAttribute("aria-pressed", alwaysOnTop);
    aotBtn.setAttribute(
      "aria-label",
      alwaysOnTop ? "Unpin window" : "Pin window on top",
    );
  });
}

// ── Quit ───────────────────────────────────────────────────────
document.getElementById("quitAppBtn").onclick = () => {
  const intervalStatus =
    document.getElementById("intervalStatus")?.textContent ?? "";
  const timerStatus =
    document.getElementById("timerStatus")?.textContent ?? "";
  const isTimerActive = [intervalStatus, timerStatus].some(
    text => text.includes("Running") || text.includes("Paused"),
  );

  if (isTimerActive) {
    const confirmed = window.confirm(
      "A timer is currently running. Quit anyway?",
    );
    if (!confirmed) return;
  }

  window.electronAPI.quitApp();
};

// ── Mini'den gelen aksiyonları ilgili tab'a yönlendir ─────────
window.electronAPI.onMiniAction(action => {
  const activeTab = document
    .querySelector(".tab-buttons button.active")
    ?.getAttribute("data-tab");

  const buttonMap = {
    pause: activeTab === "interval" ? "pauseLoopBtn" : "pauseBtn",
    continue: activeTab === "interval" ? "continueLoopBtn" : "continueBtn",
    reset: activeTab === "interval" ? "resetIntervalBtn" : "resetBtn",
    start: activeTab === "interval" ? "startLoopBtn" : "startBtn", // ← eklendi
  };

  const btnId = buttonMap[action];
  if (btnId) document.getElementById(btnId)?.click();
});

// ── Anlık state snapshot — mini açıldığında gönderilir ────────
export function snapshotTimerState() {
  const activeTab = document
    .querySelector(".tab-buttons button.active")
    ?.getAttribute("data-tab");

  if (activeTab === "interval") {
    // intervalTimer.js kendi snapshot'ını gönderir
    window.dispatchEvent(new CustomEvent("request-interval-snapshot"));
  } else if (activeTab === "timer") {
    window.dispatchEvent(new CustomEvent("request-timer-snapshot"));
  }
}

// Mini hazır olduğunda snapshot gönder
window.electronAPI.onMiniReady(() => {
  snapshotTimerState();
});

// ── Mini kapandığında always on top toggle'ı sıfırla ─────────
window.electronAPI.onMiniClosed(() => {
  alwaysOnTop = false;
  const aotBtn = document.getElementById("alwaysOnTopBtn");
  if (aotBtn) {
    aotBtn.classList.remove("active");
    aotBtn.setAttribute("aria-pressed", "false");
    aotBtn.setAttribute("aria-label", "Pin window on top");
  }
});

// Focus trap for modals
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button, input, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  modal.addEventListener("keydown", function handler(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// Apply focus trap and auto-focus when modals open
const settingsModal = document.getElementById("settingsModal");
const alarmModal = document.getElementById("alarmFolderModal");
trapFocus(settingsModal);
trapFocus(alarmModal);

// Close modals when clicking the backdrop (outside modal-content)
settingsModal.addEventListener("click", e => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});
alarmModal.addEventListener("click", e => {
  if (e.target === alarmModal) alarmModal.classList.add("hidden");
});

// Auto-focus first button when modal opens
const settingsObserver = new MutationObserver(() => {
  if (!settingsModal.classList.contains("hidden")) {
    settingsModal.querySelector("button")?.focus();
  }
});
settingsObserver.observe(settingsModal, {
  attributes: true,
  attributeFilter: ["class"],
});

const alarmObserver = new MutationObserver(() => {
  if (!alarmModal.classList.contains("hidden")) {
    alarmModal.querySelector("button")?.focus();
  }
});
alarmObserver.observe(alarmModal, {
  attributes: true,
  attributeFilter: ["class"],
});

// ── Initialize ────────────────────────────────────────────────
setupTabListeners();
switchTab("interval");
