// Static-ish demo of the app's mini window on the landing page — resizable
// and draggable (mirrors js/mini.js's own manual resize/drag, just against
// a DOM element instead of a real BrowserWindow) and now a genuinely
// working countdown: hit play, let it run down, and the alarm actually
// rings (sound + a "big alarm" view the box stretches to fit).
(function () {
  const demo = document.getElementById("miniDemo");
  const stage = demo?.parentElement;
  if (!demo || !stage) return;

  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 174;
  const DEFAULT_WIDTH = 240;
  const DEFAULT_HEIGHT = 180;
  const START_SECONDS = 10; // short on purpose, but a real 1s = 1s countdown
  const ALARM_DURATION_MS = 3000;

  function centerRect() {
    const stageRect = stage.getBoundingClientRect();
    return {
      left: Math.max(0, (stageRect.width - DEFAULT_WIDTH) / 2),
      top: Math.max(0, (stageRect.height - DEFAULT_HEIGHT) / 2),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  }

  function applyRect(rect) {
    demo.style.left = `${rect.left}px`;
    demo.style.top = `${rect.top}px`;
    demo.style.width = `${rect.width}px`;
    demo.style.height = `${rect.height}px`;
  }

  applyRect(centerRect());

  let isRinging = false;

  // ── Resize — clamped to the stage's current bounds, so no edge can be
  // dragged past the container (the opposite edge stays fixed, same as
  // js/mini.js's real anchor math). ──────────────────────────────────
  demo.querySelectorAll(".mini-demo-resize").forEach((zone) => {
    zone.addEventListener("mousedown", (event) => {
      if (isRinging) return;
      event.preventDefault();
      event.stopPropagation();

      const dir = zone.dataset.dir;
      const start = {
        left: demo.offsetLeft,
        top: demo.offsetTop,
        width: demo.offsetWidth,
        height: demo.offsetHeight,
      };
      const startX = event.clientX;
      const startY = event.clientY;
      const stageRect = stage.getBoundingClientRect();
      const maxRight = stageRect.width;
      const maxBottom = stageRect.height;

      const onMove = (moveEvent) => {
        if (moveEvent.buttons === 0) {
          onUp();
          return;
        }

        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        let { left, top, width, height } = start;

        if (dir.includes("e")) {
          width = Math.max(MIN_WIDTH, start.width + dx);
          width = Math.min(width, maxRight - start.left);
        }
        if (dir.includes("w")) {
          width = Math.max(MIN_WIDTH, start.width - dx);
          width = Math.min(width, start.left + start.width);
          left = start.left + start.width - width;
        }
        if (dir.includes("s")) {
          height = Math.max(MIN_HEIGHT, start.height + dy);
          height = Math.min(height, maxBottom - start.top);
        }
        if (dir.includes("n")) {
          height = Math.max(MIN_HEIGHT, start.height - dy);
          height = Math.min(height, start.top + start.height);
          top = start.top + start.height - height;
        }

        applyRect({ left, top, width, height });
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });

  // ── Drag to move — clicking anywhere on the demo except a button or a
  // resize handle repositions it, clamped so it can't be dragged outside
  // the stage. Mirrors the real mini window's whole-window drag region. ─
  demo.addEventListener("mousedown", (event) => {
    if (isRinging) return;
    if (event.target.closest("button, .mini-demo-resize")) return;
    event.preventDefault();

    const start = { left: demo.offsetLeft, top: demo.offsetTop };
    const startX = event.clientX;
    const startY = event.clientY;
    const stageRect = stage.getBoundingClientRect();
    const maxLeft = Math.max(0, stageRect.width - demo.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - demo.offsetHeight);

    demo.classList.add("is-dragging");

    const onMove = (moveEvent) => {
      if (moveEvent.buttons === 0) {
        onUp();
        return;
      }

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      demo.style.left = `${Math.min(Math.max(0, start.left + dx), maxLeft)}px`;
      demo.style.top = `${Math.min(Math.max(0, start.top + dy), maxTop)}px`;
    };

    const onUp = () => {
      demo.classList.remove("is-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  const resetSizeBtn = document.getElementById("miniDemoResetBtn");
  if (resetSizeBtn) {
    resetSizeBtn.addEventListener("click", () => {
      if (isRinging) return;
      applyRect(centerRect());
    });
  }

  // ── Real countdown ──────────────────────────────────────────────
  const countdownEl = document.getElementById("miniDemoCountdown");
  const pauseBtn = document.getElementById("miniDemoPauseBtn");
  const playBtn = document.getElementById("miniDemoPlayBtn");
  const resetTimerBtn = document.getElementById("miniDemoResetTimerBtn");
  const body = document.getElementById("miniDemoBody");
  const alarmView = document.getElementById("miniDemoAlarm");
  const alarmAudio = document.getElementById("miniDemoAlarmAudio");

  let remainingSeconds = START_SECONDS;
  let tickHandle = null;

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function renderCountdown() {
    if (countdownEl) countdownEl.textContent = formatTime(remainingSeconds);
  }

  renderCountdown();

  function stopTicking() {
    if (tickHandle !== null) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function startTicking() {
    if (isRinging || tickHandle !== null) return;
    if (remainingSeconds <= 0) remainingSeconds = START_SECONDS;
    tickHandle = setInterval(() => {
      remainingSeconds -= 1;
      renderCountdown();
      if (remainingSeconds <= 0) {
        stopTicking();
        ringAlarm();
      }
    }, 1000);
  }

  function resetCountdown() {
    stopTicking();
    remainingSeconds = START_SECONDS;
    renderCountdown();
  }

  function ringAlarm() {
    isRinging = true;

    if (alarmAudio) {
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(() => {
        // Autoplay can be blocked before any user gesture has landed on
        // this specific <audio> element yet — the visual alarm still
        // plays out either way, so this is a silent, harmless no-op.
      });
    }

    if (body) body.classList.add("hidden");
    if (alarmView) alarmView.classList.remove("hidden");

    // Stretch the box to a bigger "alarm" size, clamped to the stage —
    // same clamp math the manual resize uses.
    const stageRect = stage.getBoundingClientRect();
    const bigWidth = Math.min(340, stageRect.width);
    const bigHeight = Math.min(300, stageRect.height);
    const bigRect = {
      left: Math.max(0, (stageRect.width - bigWidth) / 2),
      top: Math.max(0, (stageRect.height - bigHeight) / 2),
      width: bigWidth,
      height: bigHeight,
    };

    demo.classList.add("is-animating");
    applyRect(bigRect);

    setTimeout(() => {
      if (alarmAudio) {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
      }

      applyRect(centerRect());

      setTimeout(() => {
        demo.classList.remove("is-animating");
      }, 340);

      if (body) body.classList.remove("hidden");
      if (alarmView) alarmView.classList.add("hidden");

      playBtn?.classList.remove("is-active");
      pauseBtn?.classList.remove("is-active");
      resetCountdown();
      isRinging = false;
    }, ALARM_DURATION_MS);
  }

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isRinging) return;
      playBtn.classList.add("is-active");
      pauseBtn?.classList.remove("is-active");
      startTicking();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (isRinging) return;
      pauseBtn.classList.add("is-active");
      playBtn?.classList.remove("is-active");
      stopTicking();
    });
  }

  if (resetTimerBtn) {
    resetTimerBtn.addEventListener("click", () => {
      if (isRinging) return;
      playBtn?.classList.remove("is-active");
      pauseBtn?.classList.remove("is-active");
      resetCountdown();
    });
  }

  // Keep the demo within the stage if the viewport is resized narrower —
  // doesn't fight a size the visitor deliberately dragged, just clamps
  // position/size so it can't end up hidden or overflowing off the edge.
  window.addEventListener("resize", () => {
    if (isRinging) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = {
      left: demo.offsetLeft,
      top: demo.offsetTop,
      width: demo.offsetWidth,
      height: demo.offsetHeight,
    };
    rect.width = Math.min(rect.width, Math.max(MIN_WIDTH, stageRect.width));
    rect.height = Math.min(rect.height, Math.max(MIN_HEIGHT, stageRect.height));
    rect.left = Math.min(Math.max(0, rect.left), Math.max(0, stageRect.width - rect.width));
    rect.top = Math.min(Math.max(0, rect.top), Math.max(0, stageRect.height - rect.height));
    applyRect(rect);
  });

  // ── Pin → expand into the real running app ──────────────────────
  // The expanded view is a sandboxed iframe loading the actual app
  // (docs/app/, synced from the app's own source by
  // scripts/sync-demo-app.mjs) in ?demo=1 mode — not a recreation. State
  // hands off both ways over postMessage: on expand, this box sends its
  // current countdown to the iframe once it signals readiness; on
  // shrink, the iframe sends its current countdown back.
  const pinBtn = document.getElementById("miniDemoPinBtn");
  const iframeEl = document.getElementById("miniDemoIframe");

  function expandRect() {
    const stageRect = stage.getBoundingClientRect();
    const width = Math.min(760, stageRect.width - 32);
    const height = Math.min(560, stageRect.height - 32);
    return {
      left: Math.max(0, (stageRect.width - width) / 2),
      top: Math.max(0, (stageRect.height - height) / 2),
      width,
      height,
    };
  }

  function onDemoMessage(event) {
    if (!iframeEl.contentWindow || event.source !== iframeEl.contentWindow) return;

    if (event.data?.type === "demo-ready") {
      iframeEl.contentWindow.postMessage(
        {
          type: "demo-seed-timer",
          remainingSeconds,
          isRunning: tickHandle !== null,
        },
        "*",
      );
      iframeEl.classList.add("is-visible");
      if (body) body.classList.add("hidden");
      stopTicking();
    } else if (event.data?.type === "demo-shrink") {
      remainingSeconds = Math.max(0, Math.round(event.data.remainingSeconds));
      renderCountdown();
      collapse();
      if (event.data.isRunning) startTicking();
    }
  }

  function expand() {
    if (isRinging) return;
    window.addEventListener("message", onDemoMessage);
    stage.classList.add("is-expanded");
    demo.classList.add("is-animating");
    applyRect(expandRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
  }

  function collapse() {
    demo.classList.add("is-animating");
    applyRect(centerRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("is-visible");
    iframeEl.classList.add("hidden");
    iframeEl.src = "about:blank";
    stage.classList.remove("is-expanded");
    window.removeEventListener("message", onDemoMessage);
    if (body) body.classList.remove("hidden");
  }

  if (pinBtn) {
    pinBtn.addEventListener("click", expand);
  }
})();
