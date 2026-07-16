import { initLanguage, t, format, onLanguageChange } from "./i18n/i18n.js";

const countdown = document.getElementById("miniCountdown");
const phase = document.getElementById("miniPhase");
const loopEl = document.getElementById("miniLoop");
const label = document.getElementById("miniLabel");
const pauseBtn = document.getElementById("miniPauseBtn");
const continueBtn = document.getElementById("miniContinueBtn");
const resetBtn = document.getElementById("miniResetBtn");
const closeBtn = document.getElementById("miniCloseBtn");
const quitBtn = document.getElementById("miniQuitBtn");

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

// ── Countdown click glow ────────────────────────────────────────
// Replays the same completion-glow keyframe a finished loop plays, as
// click feedback. Transient (removed once the animation ends) so it
// doesn't get mistaken for the real completed state, which .complete
// (toggled by render() above) already owns.
if (countdown) {
  countdown.addEventListener("click", () => {
    countdown.classList.remove("click-glow");
    void countdown.offsetWidth;
    countdown.classList.add("click-glow");
  });
  countdown.addEventListener("animationend", event => {
    if (event.animationName === "completion-glow") {
      countdown.classList.remove("click-glow");
    }
  });
}

// ── Kapat ─────────────────────────────────────────────────────
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.electronAPI.setAlwaysOnTop(false);
  });
}

// ── Quit — same confirm-if-running behavior as the main window's
// quitAppBtn (js/renderer.js), reusing the state this window already
// tracks instead of re-deriving per-tab status. ────────────────────
if (quitBtn) {
  quitBtn.addEventListener("click", () => {
    const isTimerActive = ["running", "paused"].includes(lastState.status);
    if (isTimerActive && !window.confirm(t("confirm.quitRunning"))) return;
    window.electronAPI.quitApp();
  });
}

// ── Language ───────────────────────────────────────────────────
initLanguage();
onLanguageChange(() => render(lastState));
