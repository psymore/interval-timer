import { IntervalTimer } from "./logic/IntervalTimer.js";
import { setupPresets } from "./presets.js";
import { alarmManager } from "./alarm/AlarmManager.js";

import {
  registerCleanup,
  alarmSettings,
  broadcastTimerState,
} from "./renderer.js";

export function setupIntervalTimer() {
  const workDurationInput = document.getElementById("workMinutes");
  const breakDurationInput = document.getElementById("breakMinutes");
  const loopCountInput = document.getElementById("loopCount");
  const startBtn = document.getElementById("startLoopBtn");
  const pauseBtn = document.getElementById("pauseLoopBtn");
  const continueBtn = document.getElementById("continueLoopBtn");
  const resetBtn = document.getElementById("resetIntervalBtn");

  // ── Preset yüklendiğinde input'ları doldur ────────────────
  function applyPreset(preset) {
    const wm = document.getElementById("workMinutes");
    const ws = document.getElementById("workSeconds");
    const bm = document.getElementById("breakMinutes");
    const bs = document.getElementById("breakSeconds");
    const lc = document.getElementById("loopCount");

    if (wm) wm.value = preset.workMinutes;
    if (ws) ws.value = preset.workSeconds;
    if (bm) bm.value = preset.breakMinutes;
    if (bs) bs.value = preset.breakSeconds;
    if (lc) lc.value = preset.loops;
  }

  // Preset UI'ını başlat
  setupPresets(applyPreset).then(async () => {
    // Aktif preset'i uygula
    const active = await window.electronAPI.presetsGetActive();
    if (active) applyPreset(active);
  });

  if (
    !workDurationInput ||
    !breakDurationInput ||
    !loopCountInput ||
    !startBtn ||
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
  let isCompleted = false;

  let alarmTimeoutId = null;
  let isAlarmPlaying = false;
  let alarmPaused = false;
  let alarmResumeTime = 0;

  let timerStatus = "ready";

  const alarm = document.getElementById("alarmSound");

  // ── State yayını — her değişimde çağrılır ─────────────────
  function broadcast(overrides = {}) {
    const base = {
      time:
        document.getElementById("intervalCountdown")?.textContent ?? "00:00",
      phase:
        document
          .getElementById("intervalPhase")
          ?.textContent?.replace("Phase: ", "") ?? "",
      status: timerStatus,
      tab: "interval",
      loop: currentLoop,
      total: totalLoops,
    };
    broadcastTimerState({ ...base, ...overrides });
  }

  function setStatus(status) {
    timerStatus = status;
    const labels = {
      ready: "Status: Ready",
      running: "Status: Running",
      paused: "Status: Paused",
      completed: "Status: Completed",
    };
    const el = document.getElementById("intervalStatus");
    if (el) el.textContent = labels[status] ?? `Status: ${status}`;
    broadcast(); // ← her status değişiminde yay
  }

  function updateDisplay(remaining, phase) {
    const mins = String(Math.floor(remaining / 60000)).padStart(2, "0");
    const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(
      2,
      "0",
    );
    const cd = document.getElementById("intervalCountdown");
    const ph = document.getElementById("intervalPhase");
    if (cd) cd.textContent = `${mins}:${secs}`;
    if (ph) ph.textContent = `Phase: ${phase}`;
  }

  // ── Alarm helpers ─────────────────────────────────────────
  function onAlarmEnded() {
    if (alarmTimeoutId) {
      clearTimeout(alarmTimeoutId);
      alarmTimeoutId = null;
    }
    isAlarmPlaying = false;
    if (alarm) alarm.removeEventListener("ended", onAlarmEnded);
  }

  function stopAlarmSound() {
    if (alarmTimeoutId) {
      clearTimeout(alarmTimeoutId);
      alarmTimeoutId = null;
    }
    if (alarm) {
      alarm.removeEventListener("ended", onAlarmEnded);
      try {
        alarm.pause();
        alarm.currentTime = 0;
      } catch (e) {}
    }
    isAlarmPlaying = false;
    alarmPaused = false;
    alarmResumeTime = 0;
  }

  // function playAlarm(duration) {
  //   if (!alarm) return;
  //   if (alarmTimeoutId) {
  //     clearTimeout(alarmTimeoutId);
  //     alarmTimeoutId = null;
  //   }
  //   alarm.removeEventListener("ended", onAlarmEnded);
  //   alarm.currentTime = 0;
  //   const p = alarm.play();
  //   if (p?.then) p.catch(err => console.warn("Alarm play() rejected:", err));
  //   isAlarmPlaying = true;
  //   alarm.addEventListener("ended", onAlarmEnded);
  //   alarmTimeoutId = setTimeout(() => stopAlarmSound(), duration * 1000);
  // }

  // Uygulama başlarken bir kez çağır (setupTimer veya setupIntervalTimer içinde)
  async function initAlarmManager() {
    // Fallback: localStorage'daki dosya veya default
    const savedPath = localStorage.getItem("selectedAlarmPath");
    const fallback = savedPath ? toFileUrl(savedPath) : "assets/alarm.mp3";

    alarmManager.setFallbackSource(fallback);

    alarmManager.setCallbacks({
      onFallback: ({ reason }) => {
        console.warn("Alarm fell back to local:", reason);
      },
      onError: ({ error, type }) => {
        console.error(`Alarm error [${type}]:`, error.message);
      },
    });

    // Aktif kaynağı yükle
    try {
      await alarmManager.load(savedPath ? toFileUrl(savedPath) : fallback);
    } catch (e) {
      console.error("AlarmManager init failed:", e);
    }
  }

  // playAlarm fonksiyonunu değiştir
  async function playAlarm(duration) {
    try {
      await alarmManager.play(duration);
    } catch (e) {
      console.error("playAlarm failed:", e);
    }
  }

  // stopAlarmSound fonksiyonunu değiştir
  async function stopAlarmSound() {
    try {
      await alarmManager.stop();
    } catch (e) {}
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
    if (!isAlarmPlaying) return;
    if (alarmPaused && alarm) {
      alarm.currentTime = alarmResumeTime;
      alarm.play().catch(err => console.warn("Alarm resume rejected:", err));
      alarmPaused = false;
    }
  }

  // ── Completion ────────────────────────────────────────────
  function handleCompletion() {
    if (isCompleted) return;
    isCompleted = true;
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    initAlarmManager(alarmSettings.breakAlarmLength);

    const cd = document.getElementById("intervalCountdown");
    if (cd) {
      cd.classList.remove("countdown-pulse", "countdown-complete");
      void cd.offsetWidth;
      cd.classList.add("countdown-complete");
      cd.textContent = "00:00";
    }
    const ph = document.getElementById("intervalPhase");
    if (ph) ph.textContent = "Phase: -";

    setStatus("completed"); // broadcast içinde çağrılıyor
  }

  // ── Start ─────────────────────────────────────────────────
  startBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    stopAlarmSound();
    isCompleted = false;

    const workMin = parseInt(workDurationInput.value, 10) || 0;
    const workSec =
      parseInt(document.getElementById("workSeconds").value, 10) || 0;
    const breakMin = parseInt(breakDurationInput.value, 10) || 0;
    const breakSec =
      parseInt(document.getElementById("breakSeconds").value, 10) || 0;

    const totalWorkDuration = workMin * 60 + workSec;
    const totalBreakDuration = breakMin * 60 + breakSec;

    if (totalWorkDuration <= 0) {
      console.warn("Work duration must be greater than 0.");
      return;
    }

    totalLoops = parseInt(loopCountInput.value, 10) || 1;
    currentLoop = 1;
    pausedTime = 0;

    const loopEl = document.getElementById("currentLoop");
    if (loopEl) loopEl.textContent = currentLoop;

    const cd = document.getElementById("intervalCountdown");
    if (cd) cd.classList.remove("countdown-pulse", "countdown-complete");

    intervalTimer = new IntervalTimer({
      workDuration: totalWorkDuration,
      breakDuration: totalBreakDuration,

      onTick: (remaining, phase) => {
        if (isCompleted) return;
        updateDisplay(remaining, phase);

        // Tick'te sadece time + phase güncelle, status setStatus'tan geliyor
        const mins = String(Math.floor(remaining / 60000)).padStart(2, "0");
        const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(
          2,
          "0",
        );
        broadcastTimerState({
          time: `${mins}:${secs}`,
          phase,
          status: timerStatus,
          tab: "interval",
          loop: currentLoop,
          total: totalLoops,
        });
      },

      onPhaseChange: phase => {
        if (isCompleted) return;

        const cd = document.getElementById("intervalCountdown");
        if (cd) {
          cd.classList.remove("countdown-pulse");
          void cd.offsetWidth;
          cd.classList.add("countdown-pulse");
        }

        if (phase === "break") {
          initAlarmManager(alarmSettings.workAlarmLength);
        } else if (phase === "work") {
          if (currentLoop >= totalLoops) {
            handleCompletion();
            return;
          }
          currentLoop++;
          const loopEl = document.getElementById("currentLoop");
          if (loopEl) loopEl.textContent = currentLoop;
          initAlarmManager(alarmSettings.breakAlarmLength);
        }

        broadcast(); // faz değişimini yay
      },
    });

    intervalTimer.start();
    setStatus("running"); // broadcast tetiklenir
  };

  // ── Mini açıldığında anlık state gönder ───────────────────────
  window.addEventListener("request-interval-snapshot", () => {
    const cd = document.getElementById("intervalCountdown");
    const ph = document.getElementById("intervalPhase");
    broadcastTimerState({
      time: cd?.textContent ?? "00:00",
      phase: ph?.textContent?.replace("Phase: ", "") ?? "",
      status: timerStatus,
      tab: "interval",
      loop: currentLoop,
      total: totalLoops,
    });
  });

  // ── Pause ─────────────────────────────────────────────────
  pauseBtn.onclick = () => {
    if (!intervalTimer || timerStatus !== "running") return;
    pausedTime = intervalTimer.getRemainingTime();
    intervalTimer.stop();
    pauseAlarm();
    setStatus("paused"); // broadcast tetiklenir
  };

  // ── Continue ──────────────────────────────────────────────
  continueBtn.onclick = () => {
    if (!intervalTimer || timerStatus !== "paused") {
      console.warn("Cannot continue: Timer is not paused.");
      return;
    }
    intervalTimer.start(pausedTime);
    pausedTime = 0;
    continueAlarm();
    setStatus("running"); // broadcast tetiklenir
  };

  // ── Reset ─────────────────────────────────────────────────
  resetBtn.onclick = () => {
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    stopAlarmSound();
    isCompleted = false;
    currentLoop = 0;
    pausedTime = 0;
    totalLoops = 0;

    const loopEl = document.getElementById("currentLoop");
    const cd = document.getElementById("intervalCountdown");
    const ph = document.getElementById("intervalPhase");
    if (loopEl) loopEl.textContent = 0;
    if (cd) {
      cd.textContent = "00:00";
      cd.classList.remove("countdown-pulse", "countdown-complete");
    }
    if (ph) ph.textContent = "Phase: -";

    setStatus("ready"); // broadcast tetiklenir — mini UI güncellenir
  };

  // ── Cleanup ───────────────────────────────────────────────
  registerCleanup(() => {
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    stopAlarmSound();
    isCompleted = false;
    timerStatus = "ready";
  });
}
