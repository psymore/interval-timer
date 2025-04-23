import { Timer } from "./logic/Timer.js";
import { alarmSettings } from "./renderer.js";

let timer = null;

export function setupTimer() {
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("resetBtn").onclick = resetTimer;
}

function startTimer() {
  const duration = getDurationFromInputs();
  if (duration <= 0) return;

  if (timer) timer.reset();

  timer = new Timer({
    duration,
    onTick: updateTimerDisplay,
    onComplete: () => playAlarm(alarmSettings.timerAlarmLength),
  });

  timer.start();
}

function getDurationFromInputs() {
  const mins = parseInt(document.getElementById("minutes").value, 10) || 0;
  const secs = parseInt(document.getElementById("seconds").value, 10) || 0;
  return mins * 60 + secs;
}

function updateTimerDisplay(remainingTime) {
  const mins = String(Math.floor(remainingTime / 60000)).padStart(2, "0");
  const secs = String(Math.floor((remainingTime % 60000) / 1000)).padStart(
    2,
    "0"
  );
  document.getElementById("countdown").textContent = `${mins}:${secs}`;
}

function stopTimer() {
  if (timer) timer.stop();
}

function continueTimer() {
  if (timer) timer.start();
}

function resetTimer() {
  if (timer) {
    timer.reset();
    updateTimerDisplay(0);
  }
}

function playAlarm(duration) {
  const alarm = document.getElementById("alarmSound");
  alarm.currentTime = 0;
  alarm.play();
  setTimeout(() => alarm.pause(), duration * 1000);
}
