import { Timer } from "./logic/Timer.js";
import {
  createTimerStateBroadcaster,
  formatDuration,
} from "./timerStateBroadcast.js";

let timer = null;
let alarmTimeoutId = null;
// Set by setupTimer() — avoids importing alarmSettings back from
// renderer.js, which would recreate the renderer.js <-> timer.js cycle.
let alarmSettings = null;

const getAlarm = () => document.getElementById("alarmSound");

// ── State yayını ──────────────────────────────────────────────
const stateBroadcaster = createTimerStateBroadcaster({
  statusElementId: "timerStatus",
  getBaseState: status => {
    const cd = document.getElementById("countdown");
    return {
      time: cd?.textContent ?? "00:00",
      phase: "",
      status,
      tab: "timer",
      loop: null,
      total: null,
    };
  },
});

// ── Mini açıldığında anlık state gönder ───────────────────────
window.addEventListener("request-timer-snapshot", () => {
  stateBroadcaster.broadcast();
});

export function getTimerStatus() {
  return stateBroadcaster.getStatus();
}

export function setupTimer(settings) {
  alarmSettings = settings;
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("pauseBtn").onclick = pauseTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("resetBtn").onclick = resetTimer;
}

// ── Alarm helpers ─────────────────────────────────────────────
function onAlarmEnded() {
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  const alarm = getAlarm();
  if (alarm) alarm.removeEventListener("ended", onAlarmEnded);
}

function stopAlarmSound() {
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  const alarm = getAlarm();
  if (alarm) {
    alarm.removeEventListener("ended", onAlarmEnded);
    try {
      alarm.pause();
      alarm.currentTime = 0;
    } catch (e) {}
  }
}

function playAlarm(duration) {
  const alarm = getAlarm();
  if (!alarm) {
    console.warn("playAlarm: no #alarmSound element found");
    return;
  }
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  alarm.removeEventListener("ended", onAlarmEnded);
  alarm.currentTime = 0;
  const p = alarm.play();
  if (p?.then) p.catch(err => console.warn("Alarm play() rejected:", err));
  alarm.addEventListener("ended", onAlarmEnded);
  alarmTimeoutId = setTimeout(() => stopAlarmSound(), duration * 1000);
}

// ── Input helper ──────────────────────────────────────────────
function getDurationFromInputs() {
  const mins = parseInt(document.getElementById("minutes").value, 10) || 0;
  const secs = parseInt(document.getElementById("seconds").value, 10) || 0;
  return mins * 60 + secs;
}

// ── Display helper ────────────────────────────────────────────
function updateTimerDisplay(remainingMs) {
  const el = document.getElementById("countdown");
  if (el) el.textContent = formatDuration(remainingMs);
}

// ── Button handlers ───────────────────────────────────────────
function startTimer() {
  const duration = getDurationFromInputs();
  if (duration <= 0) return;

  stopAlarmSound();
  if (timer) timer.reset();

  const cd = document.getElementById("countdown");
  if (cd) cd.classList.remove("countdown-pulse", "countdown-complete");

  timer = new Timer({
    duration,
    onTick: remainingMs => {
      updateTimerDisplay(remainingMs);
      stateBroadcaster.broadcast();
    },
    onComplete: () => {
      const cd = document.getElementById("countdown");
      if (cd) {
        cd.classList.remove("countdown-pulse", "countdown-complete");
        void cd.offsetWidth;
        cd.classList.add("countdown-complete");
      }
      stateBroadcaster.setStatus("completed"); // broadcast tetiklenir
      playAlarm(alarmSettings.timerAlarmLength);
    },
  });

  timer.start();
  stateBroadcaster.setStatus("running"); // broadcast tetiklenir
}

function pauseTimer() {
  if (!timer || stateBroadcaster.getStatus() !== "running") return;
  timer.stop();
  stopAlarmSound();
  stateBroadcaster.setStatus("paused"); // broadcast tetiklenir
}

function continueTimer() {
  if (!timer || stateBroadcaster.getStatus() !== "paused") {
    console.warn("Cannot continue: Timer is not paused.");
    return;
  }
  timer.start();
  stateBroadcaster.setStatus("running"); // broadcast tetiklenir
}

function stopTimer() {
  if (!timer) return;
  timer.reset();
  stopAlarmSound();
  updateTimerDisplay(getDurationFromInputs() * 1000);
  stateBroadcaster.setStatus("stopped"); // broadcast tetiklenir
}

function resetTimer() {
  if (timer) timer.reset();
  stopAlarmSound();
  const cd = document.getElementById("countdown");
  if (cd) cd.classList.remove("countdown-pulse", "countdown-complete");
  updateTimerDisplay(getDurationFromInputs() * 1000);
  stateBroadcaster.setStatus("ready"); // broadcast tetiklenir
}
