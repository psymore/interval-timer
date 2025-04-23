import { IntervalTimer } from "./logic/IntervalTimer.js";

export function setupIntervalTimer() {
  const workDurationInput = document.getElementById("workMinutes");
  const breakDurationInput = document.getElementById("breakMinutes");
  const loopCountInput = document.getElementById("loopCount");
  const startBtn = document.getElementById("startLoopBtn");
  const stopBtn = document.getElementById("stopLoopBtn");
  const resetBtn = document.getElementById("resetIntervalBtn");

  if (
    !workDurationInput ||
    !breakDurationInput ||
    !loopCountInput ||
    !startBtn ||
    !stopBtn ||
    !resetBtn
  ) {
    console.error("One or more required DOM elements are missing.");
    return;
  }

  let intervalTimer = null;
  let currentLoop = 0;
  let totalLoops = 0;

  function playAlarm(duration) {
    const alarm = document.getElementById("alarmSound");
    if (alarm) {
      alarm.currentTime = 0;
      alarm.play();
      setTimeout(() => alarm.pause(), duration * 1000);
    }
  }

  startBtn.onclick = () => {
    if (intervalTimer) intervalTimer.stop();

    // Parse inputs for work duration and break duration
    const workMin = parseInt(workDurationInput.value, 10) || 0;
    const workSec =
      parseInt(document.getElementById("workSeconds").value, 10) || 0;
    const breakMin = parseInt(breakDurationInput.value, 10) || 0;
    const breakSec =
      parseInt(document.getElementById("breakSeconds").value, 10) || 0;

    // Convert minutes and seconds to total seconds
    const totalWorkDuration = workMin * 60 + workSec;
    const totalBreakDuration = breakMin * 60 + breakSec;

    totalLoops = parseInt(loopCountInput.value, 10) || 1;
    currentLoop = 1;
    document.getElementById("currentLoop").textContent = currentLoop;

    intervalTimer = new IntervalTimer({
      workDuration: totalWorkDuration,
      breakDuration: totalBreakDuration,
      onTick: (remaining, phase) => {
        // Update countdown display
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
        // Trigger the alarm based on the phase
        playAlarm(phase === "break" ? 5 : 3); // 5 seconds for break, 3 seconds for work

        // Handle loop and completion logic
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
  };

  resetBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.reset();
    }
    currentLoop = 0;
    document.getElementById("currentLoop").textContent = currentLoop;
    document.getElementById("intervalCountdown").textContent = "00:00";
    document.getElementById("intervalStatus").textContent = "Status: Ready";
  };
}
