import { alarmSettings } from "./renderer.js";

let remainingTime = 0;
let isRunning = false;

export function setupTimer() {
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("resetBtn").onclick = resetTimer;

  // Define tick handler to be called from IPC
  window.timerTick = () => {
    if (!isRunning) return;

    if (remainingTime <= 0) {
      isRunning = false;
      playAlarm(alarmSettings.timerAlarmLength);
      return;
    }

    const mins = String(Math.floor(remainingTime / 60)).padStart(2, "0");
    const secs = String(remainingTime % 60).padStart(2, "0");
    document.getElementById("countdown").textContent = `${mins}:${secs}`;
    remainingTime--;
  };
}

function startTimer() {
  const mins = parseInt(document.getElementById("minutes").value, 10);
  const secs = parseInt(document.getElementById("seconds").value, 10);
  remainingTime = mins * 60 + secs;

  if (remainingTime > 0) {
    isRunning = true;
  }
}

function stopTimer() {
  isRunning = false;
}

function continueTimer() {
  if (remainingTime > 0) {
    isRunning = true;
  }
}

function resetTimer() {
  isRunning = false;
  remainingTime = 0;
  document.getElementById("countdown").textContent = "00:00";
}

function playAlarm(duration) {
  const alarm = document.getElementById("alarmSound");
  alarm.currentTime = 0;
  alarm.play();
  setTimeout(() => alarm.pause(), duration * 1000);
}
