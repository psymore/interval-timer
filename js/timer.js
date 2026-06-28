import { Timer } from "./logic/Timer.js";
import {
  alarmSettings,
  registerCleanup,
  broadcastTimerState,
} from "./renderer.js";

let timer = null;
let timerStatus = "ready";
let alarmTimeoutId = null;

const getAlarm = () => document.getElementById("alarmSound");

// ── State yayını ──────────────────────────────────────────────
function broadcast(overrides = {}) {
  const cd = document.getElementById("countdown");
  const base = {
    time: cd?.textContent ?? "00:00",
    phase: "",
    status: timerStatus,
    tab: "timer",
    loop: null,
    total: null,
  };
  broadcastTimerState({ ...base, ...overrides });
}

// ── Mini açıldığında anlık state gönder ───────────────────────
window.addEventListener("request-timer-snapshot", () => {
  const cd = document.getElementById("countdown");
  broadcastTimerState({
    time: cd?.textContent ?? "00:00",
    phase: "",
    status: timerStatus,
    tab: "timer",
    loop: null,
    total: null,
  });
});

export function setupTimer() {
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("pauseBtn").onclick = pauseTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("resetBtn").onclick = resetTimer;

  registerCleanup(() => {
    if (timer) {
      timer.reset();
      timer = null;
    }
    stopAlarmSound();
    timerStatus = "ready";
  });
}

// ── Status helper ─────────────────────────────────────────────
function setStatus(status) {
  timerStatus = status;
  const labels = {
    ready: "Status: Ready",
    running: "Status: Running",
    paused: "Status: Paused",
    stopped: "Status: Stopped",
    completed: "Status: Completed",
  };
  const el = document.getElementById("timerStatus");
  if (el) el.textContent = labels[status] ?? `Status: ${status}`;
  broadcast(); // ← her status değişiminde yay
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
  const mins = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
  const secs = String(Math.floor((remainingMs % 60000) / 1000)).padStart(
    2,
    "0",
  );
  const el = document.getElementById("countdown");
  if (el) el.textContent = `${mins}:${secs}`;
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

      const mins = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
      const secs = String(Math.floor((remainingMs % 60000) / 1000)).padStart(
        2,
        "0",
      );
      broadcastTimerState({
        time: `${mins}:${secs}`,
        phase: "",
        status: timerStatus,
        tab: "timer",
        loop: null,
        total: null,
      });
    },
    onComplete: () => {
      const cd = document.getElementById("countdown");
      if (cd) {
        cd.classList.remove("countdown-pulse", "countdown-complete");
        void cd.offsetWidth;
        cd.classList.add("countdown-complete");
      }
      setStatus("completed"); // broadcast tetiklenir
      playAlarm(alarmSettings.timerAlarmLength);
    },
  });

  timer.start();
  setStatus("running"); // broadcast tetiklenir
}

function pauseTimer() {
  if (!timer || timerStatus !== "running") return;
  timer.stop();
  stopAlarmSound();
  setStatus("paused"); // broadcast tetiklenir
}

function continueTimer() {
  if (!timer || timerStatus !== "paused") {
    console.warn("Cannot continue: Timer is not paused.");
    return;
  }
  timer.start();
  setStatus("running"); // broadcast tetiklenir
}

function stopTimer() {
  if (!timer) return;
  timer.reset();
  stopAlarmSound();
  updateTimerDisplay(getDurationFromInputs() * 1000);
  setStatus("stopped"); // broadcast tetiklenir
}

function resetTimer() {
  if (timer) timer.reset();
  stopAlarmSound();
  const cd = document.getElementById("countdown");
  if (cd) cd.classList.remove("countdown-pulse", "countdown-complete");
  updateTimerDisplay(getDurationFromInputs() * 1000);
  setStatus("ready"); // broadcast tetiklenir
}
