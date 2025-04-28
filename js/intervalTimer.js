import { IntervalTimer } from "./logic/IntervalTimer.js";

export function setupIntervalTimer() {
  const workDurationInput = document.getElementById("workMinutes");
  const breakDurationInput = document.getElementById("breakMinutes");
  const loopCountInput = document.getElementById("loopCount");
  const startBtn = document.getElementById("startLoopBtn");
  const stopBtn = document.getElementById("stopLoopBtn");
  const pauseBtn = document.getElementById("pauseLoopBtn");
  const continueBtn = document.getElementById("continueLoopBtn");
  const resetBtn = document.getElementById("resetIntervalBtn");

  if (
    !workDurationInput ||
    !breakDurationInput ||
    !loopCountInput ||
    !startBtn ||
    !stopBtn ||
    !pauseBtn ||
    !continueBtn ||
    !resetBtn
  ) {
    console.error("One or more required DOM elements are missing.");
    return;
  }

  let intervalTimer = null;
  let currentLoop = 0;
  let totalLoops = 0;
  let alarmPaused = false;
  let alarmResumeTime = 0;
  let isAlarmPlaying = false; // Flag to track if the alarm is playing
  let pausedTime = 0; // Variable to track the paused time

  const alarm = document.getElementById("alarmSound");

  function playAlarm(duration) {
    if (alarm) {
      alarm.currentTime = 0;
      alarm.play();
      isAlarmPlaying = true;
      setTimeout(() => {
        if (!alarmPaused) {
          alarm.pause();
          isAlarmPlaying = false;
        }
      }, duration * 1000);
    }
  }

  function pauseAlarm() {
    if (alarm && !alarmPaused && isAlarmPlaying) {
      alarm.pause();
      alarmResumeTime = alarm.currentTime;
      alarmPaused = true;
    }
  }

  function continueAlarm() {
    if (alarm && alarmPaused && isAlarmPlaying) {
      if (alarm.paused) {
        // Check if the alarm is not already playing
        alarm.currentTime = alarmResumeTime;
        alarm.play();
      }
      alarmPaused = false;
    } else if (!alarmPaused) {
      console.warn("Cannot continue alarm: Alarm is not paused.");
    }
  }

  startBtn.onclick = () => {
    if (intervalTimer) intervalTimer.stop();

    const workMin = parseInt(workDurationInput.value, 10) || 0;
    const workSec =
      parseInt(document.getElementById("workSeconds").value, 10) || 0;
    const breakMin = parseInt(breakDurationInput.value, 10) || 0;
    const breakSec =
      parseInt(document.getElementById("breakSeconds").value, 10) || 0;

    const totalWorkDuration = workMin * 60 + workSec;
    const totalBreakDuration = breakMin * 60 + breakSec;

    totalLoops = parseInt(loopCountInput.value, 10) || 1;
    currentLoop = 1;
    document.getElementById("currentLoop").textContent = currentLoop;

    intervalTimer = new IntervalTimer({
      workDuration: totalWorkDuration,
      breakDuration: totalBreakDuration,
      onTick: (remaining, phase) => {
        const mins = String(Math.floor(remaining / 60000)).padStart(2, "0");
        const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(
          2,
          "0"
        );
        document.getElementById(
          "intervalCountdown"
        ).textContent = `${mins}:${secs}`;
        document.getElementById(
          "intervalStatus"
        ).textContent = `Status: ${phase}`;
      },
      onPhaseChange: phase => {
        playAlarm(phase === "break" ? 5 : 3);

        if (phase === "break") {
          if (currentLoop >= totalLoops) {
            intervalTimer.stop();
            document.getElementById("intervalStatus").textContent =
              "Status: Completed";
            return;
          }
          currentLoop++;
          document.getElementById("currentLoop").textContent = currentLoop;
        }
      },
    });

    intervalTimer.start();
  };

  stopBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.stop();
      document.getElementById("intervalStatus").textContent = "Status: Stopped";
    }
    if (alarm) alarm.pause();
  };

  pauseBtn.onclick = () => {
    if (intervalTimer) {
      pausedTime = intervalTimer.getRemainingTime(); // Record the remaining time when paused
      intervalTimer.stop();
      document.getElementById("intervalStatus").textContent = "Status: Paused";
    }
    pauseAlarm();
  };

  continueBtn.onclick = () => {
    if (intervalTimer) {
      if (document.getElementById("intervalStatus").textContent === "Status: Paused") {
        intervalTimer.start(pausedTime); // Resume the timer from the paused time
        document.getElementById("intervalStatus").textContent = "Status: Running";
      } else {
        console.warn("Cannot continue: Timer is not paused.");
      }
    }
    continueAlarm();
  };

  resetBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.reset();
    }
    currentLoop = 0;
    document.getElementById("currentLoop").textContent = currentLoop;
    document.getElementById("intervalCountdown").textContent = "00:00";
    document.getElementById("intervalStatus").textContent = "Status: Ready";
    if (alarm) alarm.pause();
  };
}
