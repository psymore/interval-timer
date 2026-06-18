import { Timer } from "./logic/Timer.js";
import { alarmSettings, registerCleanup } from "./renderer.js";

let timer = null;
let timerStatus = "ready"; // "ready" | "running" | "paused" | "stopped" | "completed"
let alarmTimeoutId = null;

const getAlarm = () => document.getElementById("alarmSound");

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

  // Clear previous timeout but don't stop audio abruptly
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  alarm.removeEventListener("ended", onAlarmEnded);

  alarm.currentTime = 0;
  const playPromise = alarm.play();
  if (playPromise?.then) {
    playPromise.catch(err => console.warn("Alarm play() rejected:", err));
  }

  // Case 1: Audio shorter than duration — let it finish naturally
  alarm.addEventListener("ended", onAlarmEnded);

  // Case 2: Audio longer than duration — cut it off at duration
  alarmTimeoutId = setTimeout(() => {
    stopAlarmSound();
  }, duration * 1000);
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
  document.getElementById("countdown").textContent = `${mins}:${secs}`;
}

// ── Button handlers ───────────────────────────────────────────
function startTimer() {
  const duration = getDurationFromInputs();
  if (duration <= 0) return;

  stopAlarmSound();
  if (timer) timer.reset();

  timer = new Timer({
    duration,
    onTick: updateTimerDisplay,
    onComplete: () => {
      setStatus("completed");
      playAlarm(alarmSettings.timerAlarmLength);
    },
  });

  timer.start();
  setStatus("running");
}

function pauseTimer() {
  if (!timer || timerStatus !== "running") return;
  timer.stop();
  stopAlarmSound();
  setStatus("paused");
}

function continueTimer() {
  if (!timer || timerStatus !== "paused") {
    console.warn("Cannot continue: Timer is not paused.");
    return;
  }
  timer.start();
  setStatus("running");
}

function stopTimer() {
  if (!timer) return;
  timer.reset();
  stopAlarmSound();
  updateTimerDisplay(0);
  setStatus("stopped");
}

function resetTimer() {
  if (timer) timer.reset();
  stopAlarmSound();
  updateTimerDisplay(0);
  setStatus("ready");
}
