const countdown = document.getElementById("miniCountdown");
const phase = document.getElementById("miniPhase");
const loopEl = document.getElementById("miniLoop");
const label = document.getElementById("miniLabel");
const pauseBtn = document.getElementById("miniPauseBtn");
const continueBtn = document.getElementById("miniContinueBtn");
const resetBtn = document.getElementById("miniResetBtn");
const closeBtn = document.getElementById("miniCloseBtn");

let lastStatus = "ready";

// ── Timer state sync ──────────────────────────────────────────
window.electronAPI.onTimerState(state => {
  lastStatus = state.status;

  if (countdown) countdown.textContent = state.time ?? "00:00";

  // Phase / status metni
  if (phase) {
    if (state.status === "completed") {
      phase.textContent = "COMPLETED";
      phase.style.color = "var(--accent)";
    } else if (state.status === "paused") {
      phase.textContent = "PAUSED";
      phase.style.color = "var(--ink-muted)";
    } else if (state.status === "ready" || state.status === "stopped") {
      phase.textContent = "READY";
      phase.style.color = "var(--ink-muted)";
    } else if (state.phase) {
      phase.textContent = state.phase.toUpperCase();
      phase.style.color = "var(--accent)";
    } else {
      phase.textContent = "";
    }
  }

  // Tab label
  if (label) {
    label.textContent = state.tab === "interval" ? "INTERVAL" : "TIMER";
  }

  // Loop bilgisi
  if (loopEl) {
    if (state.tab === "interval" && state.total > 0) {
      loopEl.textContent = `LOOP ${state.loop ?? 0} / ${state.total}`;
    } else {
      loopEl.textContent = "";
    }
  }

  const isRunning = state.status === "running";
  const isPaused = state.status === "paused";
  const isCompleted = state.status === "completed";
  const isIdle = state.status === "ready" || state.status === "stopped";

  // Pause: sadece running'de aktif
  if (pauseBtn) pauseBtn.disabled = !isRunning;

  // Continue: paused'da "continue", idle/completed'da "start" görevi
  if (continueBtn) {
    continueBtn.disabled = false; // her zaman tıklanabilir
    if (isPaused) {
      continueBtn.title = "Continue";
      continueBtn.dataset.action = "continue";
    } else if (isIdle || isCompleted) {
      continueBtn.title = "Start";
      continueBtn.dataset.action = "start";
    } else {
      // running — start zaten çalışıyor, butonu pasif yap
      continueBtn.disabled = true;
    }
  }

  // Reset: sadece bir şey başlamışsa aktif
  if (resetBtn) {
    resetBtn.disabled = isIdle && !isCompleted;
  }

  // Completion görsel
  if (countdown) {
    countdown.classList.toggle("complete", isCompleted);
  }
});

// ── Buton aksiyonları ─────────────────────────────────────────
[pauseBtn, continueBtn, resetBtn].forEach(btn => {
  if (!btn) return;
  btn.addEventListener("click", () => {
    window.electronAPI.sendMiniAction(btn.dataset.action);
  });
});

// ── Kapat ─────────────────────────────────────────────────────
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.electronAPI.setAlwaysOnTop(false);
  });
}
