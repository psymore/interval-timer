let intervalLoopActive = false;
let intervalTimer = null;
let alarmTimeout = null;
let isWorkPhase = true;
let currentLoop = 1;
let totalLoops = 3;
let alarmAudio = null;
let paused = false; // Add paused state
let remainingAlarmTime = 0; // Track remaining alarm time
let workTime = 0;
let breakTime = 0;
let remainingCountdownTime = 0;
let savedWorkTime = 0;
let savedBreakTime = 0;

import { alarmSettings } from "./renderer.js";

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

  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }

  intervalLoopActive = false;
  isWorkPhase = true;
  currentLoop = 1;
  paused = false; // Reset paused state

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

  workTime = workMin * 60 + workSec;
  breakTime = breakMin * 60 + breakSec;

  // Save times for reuse
  savedWorkTime = workTime;
  savedBreakTime = breakTime;

  if (!workTime || !breakTime || isNaN(totalLoops)) return;

  intervalLoopActive = true;
  currentLoop = 1;
  paused = false; // Reset paused state
  document.getElementById("currentLoop").textContent = currentLoop;
  startPhase(workTime, "Work", savedWorkTime, savedBreakTime);
}

function stopIntervalLoop() {
  intervalLoopActive = false;
  paused = false; // Reset paused state
  clearInterval(intervalTimer);
  clearTimeout(alarmTimeout);
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }
  document.getElementById("intervalStatus").textContent = "Status: Stopped";
}

function pauseIntervalLoop() {
  if (intervalLoopActive) {
    paused = true;
    clearInterval(intervalTimer);
    clearTimeout(alarmTimeout);

    const [min, sec] = document
      .getElementById("intervalCountdown")
      .textContent.split(":")
      .map(Number);
    remainingCountdownTime = min * 60 + sec; // 👈 Save countdown time

    if (alarmAudio && !alarmAudio.paused) {
      remainingAlarmTime = alarmAudio.duration - alarmAudio.currentTime;
      alarmAudio.pause();
    }

    document.getElementById("intervalStatus").textContent = "Status: Paused";
  }
}

function continueIntervalLoop() {
  console.log("Continuing...", {
    remainingAlarmTime,
    remainingCountdownTime,
    isWorkPhase,
  });

  if (!intervalLoopActive || !paused) return;

  paused = false;

  // 💥 FIX: If alarm was in progress
  if (remainingAlarmTime > 0) {
    clearTimeout(alarmTimeout); // 💥 Clear any pending alarm timeout
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    }
    remainingAlarmTime = 0;

    // 💥 Instead of resuming alarm, just move to next phase
    startNextPhase();

    return;
  }

  // If timer countdown was paused
  if (remainingCountdownTime > 0) {
    startPhase(
      remainingCountdownTime,
      isWorkPhase ? "Work" : "Break",
      savedWorkTime,
      savedBreakTime
    );

    remainingCountdownTime = 0;
  }
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
          document.getElementById(
            "intervalStatus"
          ).textContent = `Status: ${phase}`;
          document.getElementById("currentLoop").textContent = currentLoop;
          startPhase(workTime, "Work", workTime, breakTime);
        }
      });
    }
  }, 1000);
}

function playAlarm(callback) {
  const alarmDuration = isWorkPhase
    ? alarmSettings.workAlarmLength
    : alarmSettings.breakAlarmLength;

  if (!alarmAudio) {
    alarmAudio = new Audio("assets/alarm.mp3");
    alarmAudio.load();
  }

  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(err => console.warn("Audio playback failed:", err));

  remainingAlarmTime = alarmDuration; // 👈 Save this here for pause/resume

  alarmTimeout = setTimeout(() => {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    remainingAlarmTime = 0; // Reset
    callback();
  }, alarmDuration * 1000);
}

function startNextPhase() {
  if (!intervalLoopActive) return;

  if (isWorkPhase) {
    startPhase(savedBreakTime, "Break", savedWorkTime, savedBreakTime);
  } else {
    currentLoop++;
    document.getElementById("currentLoop").textContent = currentLoop;
    if (currentLoop > totalLoops) {
      intervalLoopActive = false;
      document.getElementById("intervalStatus").textContent =
        "Status: Completed";
      return;
    }
    startPhase(savedWorkTime, "Work", savedWorkTime, savedBreakTime);
  }
}

export function setupIntervalTimer() {
  document.getElementById("startLoopBtn").onclick = startIntervalLoop;
  document.getElementById("stopLoopBtn").onclick = stopIntervalLoop;
  document.getElementById("pauseLoopBtn").onclick = pauseIntervalLoop; // Wire up pause button
  document.getElementById("continueLoopBtn").onclick = continueIntervalLoop;

  const resetBtn = document.getElementById("resetIntervalBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (confirm("Are you sure you want to reset the timer?")) {
        stopIntervalLoop(); // Ensure the timer and alarm are stopped
        resetIntervalTimer();
      }
    };
  }
}
