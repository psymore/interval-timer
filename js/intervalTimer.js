let intervalLoopActive = false;
let intervalTimer = null;
let alarmTimeout = null;
let isWorkPhase = true;
let currentLoop = 1;
let totalLoops = 3;
let alarmAudio = null;

document.addEventListener("DOMContentLoaded", () => {
  const initialTab =
    document
      .querySelector(".tab-buttons button.active")
      ?.getAttribute("data-tab") || "timer";

  switchTab(initialTab);
});

// Setup tab listeners
import { setupTabListeners } from "./tabs.js";
setupTabListeners();

function resetIntervalTimer() {
  clearInterval(intervalTimer);
  clearTimeout(alarmTimeout);

  intervalLoopActive = false;
  isWorkPhase = true;
  currentLoop = 1;

  document.getElementById("intervalCountdown").textContent = "00:00";
  document.getElementById("intervalStatus").textContent = "Status: Ready";
  document.getElementById("currentLoop").textContent = "1";
}

function startIntervalLoop() {
  // User action starts here — ideal time to play silently to unlock audio
  if (!alarmAudio) {
    alarmAudio = new Audio("assets/alarm.mp3");
    alarmAudio.load();
  }

  // 👇 Try playing a muted version to satisfy autoplay policy
  alarmAudio.muted = true;
  alarmAudio
    .play()
    .then(() => {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio.muted = false;
    })
    .catch(err => {
      console.warn("Initial audio unlock failed:", err);
    });

  // Parse input values
  const workMin =
    parseInt(document.getElementById("workMinutes").value, 10) || 0;
  const workSec =
    parseInt(document.getElementById("workSeconds").value, 10) || 0;
  const breakMin =
    parseInt(document.getElementById("breakMinutes").value, 10) || 0;
  const breakSec =
    parseInt(document.getElementById("breakSeconds").value, 10) || 0;
  totalLoops = parseInt(document.getElementById("loopCount").value, 10) || 1;

  const workTime = workMin * 60 + workSec;
  const breakTime = breakMin * 60 + breakSec;

  if (!workTime || !breakTime || isNaN(totalLoops)) return;

  intervalLoopActive = true;
  currentLoop = 1;
  document.getElementById("currentLoop").textContent = currentLoop;
  startPhase(workTime, "Work", workTime, breakTime);
}

function stopIntervalLoop() {
  intervalLoopActive = false;
}

function startPhase(durationInSeconds, phase, workTime, breakTime) {
  isWorkPhase = phase === "Work";
  document.getElementById("intervalStatus").textContent = `Status: ${phase}`;
  let remaining = durationInSeconds;

  console.log(`Starting ${phase} phase for ${durationInSeconds} seconds`);

  intervalTimer = setInterval(() => {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");
    document.getElementById(
      "intervalCountdown"
    ).textContent = `${minutes}:${seconds}`;
    remaining--;

    if (remaining < 0) {
      clearInterval(intervalTimer);
      playAlarm(() => {
        if (!intervalLoopActive) return;

        if (isWorkPhase) {
          startPhase(breakTime, "Break", workTime, breakTime);
        } else {
          currentLoop++;
          document.getElementById("currentLoop").textContent = currentLoop;
          if (currentLoop > totalLoops) {
            intervalLoopActive = false;
            document.getElementById("intervalStatus").textContent =
              "Status: Completed";
            return;
          }
          startPhase(workTime, "Work", workTime, breakTime);
        }
      });
    }
  }, 1000);
}

function playAlarm(callback) {
  const alarmDuration = 5000;

  if (!alarmAudio) {
    alarmAudio = new Audio("assets/alarm.mp3"); // ✅ no leading slash
    alarmAudio.load();
  }

  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(err => {
    console.warn("Audio playback failed:", err);
  });

  alarmTimeout = setTimeout(() => {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    callback();
  }, alarmDuration);

  alarmAudio.onerror = () => {
    console.error("❌ Failed to load alarm audio");
  };
  console.log("Alarm audio loaded successfully");

  alarmAudio.oncanplaythrough = () => {
    console.log("Alarm audio can play through");
  };
}

export function setupIntervalTimer() {
  document.getElementById("startLoopBtn").onclick = startIntervalLoop;
  document.getElementById("stopLoopBtn").onclick = stopIntervalLoop;

  const resetBtn = document.getElementById("resetIntervalBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (confirm("Are you sure you want to reset the timer?")) {
        resetIntervalTimer();
      }
    };
  }
}
