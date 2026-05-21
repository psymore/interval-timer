import { IntervalTimer } from "./logic/IntervalTimer.js";
import { registerCleanup } from "./renderer.js";

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
  let pausedTime = 0;

  // ── Alarm state ──────────────────────────────────────────────
  let alarmTimeoutId = null;
  let isAlarmPlaying = false;
  let alarmPaused = false;
  let alarmResumeTime = 0;

  // ── Timer status as a proper variable, not DOM text ──────────
  let timerStatus = "ready"; // "ready" | "running" | "paused" | "stopped" | "completed"

  const alarm = document.getElementById("alarmSound");

  function setStatus(status) {
    timerStatus = status;
    const labels = {
      ready: "Status: Ready",
      running: "Status: Running",
      paused: "Status: Paused",
      stopped: "Status: Stopped",
      completed: "Status: Completed",
    };
    document.getElementById("intervalStatus").textContent =
      labels[status] ?? `Status: ${status}`;
  }

  // ── Alarm helpers ─────────────────────────────────────────────
  function stopAlarmSound() {
    if (alarmTimeoutId) {
      clearTimeout(alarmTimeoutId);
      alarmTimeoutId = null;
    }
    if (alarm) {
      try {
        alarm.pause();
        alarm.currentTime = 0;
      } catch (e) {}
    }
    isAlarmPlaying = false;
    alarmPaused = false;
    alarmResumeTime = 0;
  }

  function playAlarm(duration) {
    if (!alarm) return;
    stopAlarmSound(); // Always clear previous alarm before playing a new one
    alarm.currentTime = 0;
    const playPromise = alarm.play();
    if (playPromise?.then) {
      playPromise.catch(err => console.warn("Alarm play() rejected:", err));
    }
    isAlarmPlaying = true;
    alarmTimeoutId = setTimeout(() => {
      if (!alarmPaused) {
        try {
          alarm.pause();
        } catch (e) {}
        isAlarmPlaying = false;
      }
      alarmTimeoutId = null;
    }, duration * 1000);
  }

  function pauseAlarm() {
    if (alarm && isAlarmPlaying && !alarmPaused) {
      try {
        alarm.pause();
      } catch (e) {}
      alarmResumeTime = alarm.currentTime;
      alarmPaused = true;
    }
  }

  function continueAlarm() {
    if (!isAlarmPlaying) return; // Nothing to resume
    if (alarmPaused && alarm) {
      alarm.currentTime = alarmResumeTime;
      alarm.play().catch(err => console.warn("Alarm resume rejected:", err));
      alarmPaused = false;
    }
  }

  // ── Completion handler (extracted to avoid duplication) ───────
  function handleCompletion() {
    if (intervalTimer) intervalTimer.stop();
    stopAlarmSound();
    setStatus("completed");
    document.getElementById("intervalCountdown").textContent = "00:00";
  }

  // ── Buttons ───────────────────────────────────────────────────
  startBtn.onclick = () => {
    if (intervalTimer) intervalTimer.stop();
    stopAlarmSound();

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
    pausedTime = 0;
    document.getElementById("currentLoop").textContent = currentLoop;

    intervalTimer = new IntervalTimer({
      workDuration: totalWorkDuration,
      breakDuration: totalBreakDuration,

      onTick: (remaining, phase) => {
        const mins = String(Math.floor(remaining / 60000)).padStart(2, "0");
        const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(
          2,
          "0",
        );
        document.getElementById("intervalCountdown").textContent =
          `${mins}:${secs}`;
        document.getElementById("intervalPhase").textContent =
          `Phase: ${phase}`; // optional element
      },

      onPhaseChange: phase => {
        if (phase === "break") {
          // Work phase just ended → play break alarm
          playAlarm(5);
        } else if (phase === "work") {
          // Break phase just ended → check if all loops are done
          if (currentLoop >= totalLoops) {
            handleCompletion();
            return;
          }
          // Move to next loop
          currentLoop++;
          document.getElementById("currentLoop").textContent = currentLoop;
          playAlarm(3); // Optional: work-start sound
        }
      },
    });

    intervalTimer.start();
    setStatus("running");
  };

  stopBtn.onclick = () => {
    if (intervalTimer) intervalTimer.stop();
    stopAlarmSound();
    pausedTime = 0;
    setStatus("stopped");
  };

  pauseBtn.onclick = () => {
    if (!intervalTimer || timerStatus !== "running") return;
    pausedTime = intervalTimer.getRemainingTime();
    intervalTimer.stop();
    pauseAlarm();
    setStatus("paused");
  };

  continueBtn.onclick = () => {
    if (!intervalTimer || timerStatus !== "paused") {
      console.warn("Cannot continue: Timer is not paused.");
      return;
    }
    intervalTimer.start(pausedTime);
    pausedTime = 0;
    continueAlarm();
    setStatus("running");
  };

  resetBtn.onclick = () => {
    if (intervalTimer) intervalTimer.reset();
    stopAlarmSound();
    currentLoop = 0;
    pausedTime = 0;
    totalLoops = 0;
    document.getElementById("currentLoop").textContent = 0;
    document.getElementById("intervalCountdown").textContent = "00:00";
    setStatus("ready");
  };

  registerCleanup(() => {
    if (intervalTimer) {
      intervalTimer.reset();
      intervalTimer = null;
    }
    timerStatus = "ready";
    stopAlarmSound();
  });
}
