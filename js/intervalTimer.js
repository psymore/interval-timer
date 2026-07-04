import { IntervalTimer } from "./logic/IntervalTimer.js";
import { setupPresets } from "./presets.js";
import { alarmManager } from "./alarm/AlarmManager.js";

import {
  registerCleanup,
  alarmSettings,
  broadcastTimerState,
} from "./renderer.js";
import { toFileUrl } from "./alarmModal.js";

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

  let isAlarmPlaying = false;
  let alarmPaused = false;

  let timerStatus = "ready";

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
  async function playAlarm(duration) {
    console.log("[DIAG] playAlarm requested duration:", duration, "full alarmSettings:", JSON.stringify(alarmSettings));
    try {
      await alarmManager.play(duration);
      isAlarmPlaying = true;
      alarmPaused = false;
    } catch (e) {
      console.error("playAlarm failed:", e);
    }
  }

  async function stopAlarmSound() {
    try {
      await alarmManager.stop();
    } catch (e) {}
    isAlarmPlaying = false;
    alarmPaused = false;
  }

  // Timer'ın kendi Pause/Continue butonlarıyla eşleşir — şu an sadece
  // Spotify gerçek duraklat/devam ettir destekliyor (AlarmManager provider
  // capability'sine göre no-op yapar), local/YouTube için etkisiz.
  async function pauseAlarm() {
    if (!isAlarmPlaying || alarmPaused) return;
    alarmPaused = true;
    try {
      await alarmManager.pauseCurrent();
    } catch (e) {}
  }

  async function continueAlarm() {
    if (!isAlarmPlaying || !alarmPaused) return;
    alarmPaused = false;
    try {
      await alarmManager.resumeCurrent();
    } catch (e) {}
  }

  // ── Completion ────────────────────────────────────────────
  function handleCompletion() {
    if (isCompleted) return;
    isCompleted = true;
    if (intervalTimer) {
      intervalTimer.stop();
      intervalTimer = null;
    }
    playAlarm(alarmSettings.breakAlarmLength); // ← initAlarmManager yerine playAlarm

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
          playAlarm(alarmSettings.workAlarmLength); // ← initAlarmManager yerine playAlarm
        } else if (phase === "work") {
          if (currentLoop >= totalLoops) {
            handleCompletion();
            return;
          }
          currentLoop++;
          const loopEl = document.getElementById("currentLoop");
          if (loopEl) loopEl.textContent = currentLoop;
          playAlarm(alarmSettings.breakAlarmLength); // ← initAlarmManager yerine playAlarm
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
