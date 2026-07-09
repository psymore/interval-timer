import { initLanguage, t, format, onLanguageChange } from "./i18n/i18n.js";

const countdown = document.getElementById("miniCountdown");
const phase = document.getElementById("miniPhase");
const loopEl = document.getElementById("miniLoop");
const label = document.getElementById("miniLabel");
const pauseBtn = document.getElementById("miniPauseBtn");
const continueBtn = document.getElementById("miniContinueBtn");
const resetBtn = document.getElementById("miniResetBtn");
const closeBtn = document.getElementById("miniCloseBtn");

let lastState = { status: "ready", tab: "timer", time: "00:00" };

function render(state) {
  lastState = state;

  if (countdown) countdown.textContent = state.time ?? "00:00";

  // Phase / status metni
  if (phase) {
    if (state.status === "completed") {
      phase.textContent = t("mini.completed");
      phase.style.color = "var(--accent)";
    } else if (state.status === "paused") {
      phase.textContent = t("mini.paused");
      phase.style.color = "var(--ink-muted)";
    } else if (state.status === "ready" || state.status === "stopped") {
      phase.textContent = t("mini.ready");
      phase.style.color = "var(--ink-muted)";
    } else if (state.phase) {
      phase.textContent = t(`phase.${state.phase}`).toUpperCase();
      phase.style.color = "var(--accent)";
    } else {
      phase.textContent = "";
    }
  }

  // Tab label
  if (label) {
    label.textContent = state.tab === "interval" ? t("mini.interval") : t("mini.timer");
  }

  // Loop bilgisi
  if (loopEl) {
    if (state.tab === "interval" && state.total > 0) {
      loopEl.textContent = format(t("mini.loop"), {
        current: state.loop ?? 0,
        total: state.total,
      });
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
      continueBtn.title = t("mini.continueTitle");
      continueBtn.setAttribute("aria-label", t("mini.continueAriaLabel"));
      continueBtn.dataset.action = "continue";
    } else if (isIdle || isCompleted) {
      continueBtn.title = t("mini.startTitle");
      continueBtn.setAttribute("aria-label", t("mini.startTitle"));
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
}

// ── Timer state sync ──────────────────────────────────────────
window.electronAPI.onTimerState(render);

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

// ── Language ───────────────────────────────────────────────────
initLanguage();
onLanguageChange(() => render(lastState));
