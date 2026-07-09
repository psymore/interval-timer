import { IntervalTimer } from "./logic/IntervalTimer.js";
import { setupPresets } from "./presets.js";
import { alarmManager } from "./alarm/AlarmManager.js";

import {
  createTimerStateBroadcaster,
  formatDuration,
} from "./timerStateBroadcast.js";
import { toFileUrl } from "./alarmModal.js";
import { t, onLanguageChange } from "./i18n/i18n.js";

let stateBroadcaster = null;

export function getIntervalStatus() {
  return stateBroadcaster?.getStatus() ?? "ready";
}

// `alarmSettings` is passed in by renderer.js rather than imported from it —
// importing it back from renderer.js would recreate the renderer.js <->
// intervalTimer.js cycle that this module's other imports were fixed to avoid.
export function setupIntervalTimer(alarmSettings) {
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
  let currentPhase = "";

  let isAlarmPlaying = false;
  let alarmPaused = false;

  function phaseDisplay(phase) {
    return phase ? `${t("phase.label")}: ${t(`phase.${phase}`)}` : t("phase.empty");
  }

  function renderPhaseLabel() {
    const ph = document.getElementById("intervalPhase");
    if (ph) ph.textContent = phaseDisplay(currentPhase);
  }

  // ── State yayını — her değişimde çağrılır ─────────────────
  stateBroadcaster = createTimerStateBroadcaster({
    statusElementId: "intervalStatus",
    getBaseState: status => ({
      time:
        document.getElementById("intervalCountdown")?.textContent ?? "00:00",
      phase: currentPhase,
      status,
      tab: "interval",
      loop: currentLoop,
      total: totalLoops,
    }),
  });

  function updateDisplay(remaining, phase) {
    currentPhase = phase;
    const cd = document.getElementById("intervalCountdown");
    if (cd) cd.textContent = formatDuration(remaining);
    renderPhaseLabel();
  }

  // ── Alarm helpers ─────────────────────────────────────────
  async function playAlarm(duration) {
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

  // Timer'ın kendi Pause/Continue butonlarıyla eşleşir — local, YouTube ve
  // Spotify provider'larının hepsi artık gerçek pause/resume destekliyor.
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
    currentPhase = "";
    renderPhaseLabel();

    stateBroadcaster.setStatus("completed"); // broadcast içinde çağrılıyor
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
        stateBroadcaster.broadcast();
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

        stateBroadcaster.broadcast(); // faz değişimini yay
      },
    });

    intervalTimer.start();
    stateBroadcaster.setStatus("running"); // broadcast tetiklenir
  };

  // ── Mini açıldığında anlık state gönder ───────────────────────
  window.addEventListener("request-interval-snapshot", () => {
    stateBroadcaster.broadcast();
  });

  // ── Pause ─────────────────────────────────────────────────
  pauseBtn.onclick = () => {
    if (!intervalTimer || stateBroadcaster.getStatus() !== "running") return;
    pausedTime = intervalTimer.getRemainingTime();
    intervalTimer.stop();
    pauseAlarm();
    stateBroadcaster.setStatus("paused"); // broadcast tetiklenir
  };

  // ── Continue ──────────────────────────────────────────────
  continueBtn.onclick = () => {
    if (!intervalTimer || stateBroadcaster.getStatus() !== "paused") {
      console.warn("Cannot continue: Timer is not paused.");
      return;
    }
    intervalTimer.start(pausedTime);
    pausedTime = 0;
    continueAlarm();
    stateBroadcaster.setStatus("running"); // broadcast tetiklenir
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
    currentPhase = "";

    const loopEl = document.getElementById("currentLoop");
    const cd = document.getElementById("intervalCountdown");
    if (loopEl) loopEl.textContent = 0;
    if (cd) {
      cd.textContent = "00:00";
      cd.classList.remove("countdown-pulse", "countdown-complete");
    }
    renderPhaseLabel();

    stateBroadcaster.setStatus("ready"); // broadcast tetiklenir — mini UI güncellenir
  };

  onLanguageChange(() => renderPhaseLabel());
}
