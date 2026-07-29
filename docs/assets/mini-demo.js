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
  const DOCK_MARGIN = 24;

  // Single source of truth for the expanded stage's height — applied as an
  // inline style (see setStageMode below) instead of also living in a CSS
  // ".is-expanded" rule, so the two can't drift out of sync.
  const EXPANDED_STAGE_HEIGHT = 1150;

  // mode: "expanded" | "idle". "idle" is the stage's appearance once the
  // demo has docked away from it — a small placeholder, not the old
  // small-widget-centered-in-stage layout (that state no longer exists).
  function setStageMode(mode) {
    stage.classList.toggle("is-idle", mode === "idle");
    stage.style.minHeight = mode === "expanded" ? `${EXPANDED_STAGE_HEIGHT}px` : "";
  }

  // Where the docked widget sits: bottom-right of the *viewport*, not
  // centered inside the stage — it's position:fixed once docked, so its
  // bounds are the window, not the stage element.
  function dockRect() {
    return {
      left: Math.max(0, window.innerWidth - DEFAULT_WIDTH - DOCK_MARGIN),
      top: Math.max(0, window.innerHeight - DEFAULT_HEIGHT - DOCK_MARGIN),
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

  let isRinging = false;

  // ── Resize — clamped to the stage's current bounds, so no edge can be
  // dragged past the container (the opposite edge stays fixed, same as
  // js/mini.js's real anchor math). ──────────────────────────────────
  demo.querySelectorAll(".mini-demo-resize").forEach((zone) => {
    zone.addEventListener("mousedown", (event) => {
      if (isRinging || !demo.classList.contains("is-docked")) return;
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
      const maxRight = window.innerWidth;
      const maxBottom = window.innerHeight;

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
    if (isRinging || !demo.classList.contains("is-docked")) return;
    if (event.target.closest("button, .mini-demo-resize")) return;
    event.preventDefault();

    const start = { left: demo.offsetLeft, top: demo.offsetTop };
    const startX = event.clientX;
    const startY = event.clientY;
    const maxLeft = Math.max(0, window.innerWidth - demo.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - demo.offsetHeight);

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
      if (isRinging || !demo.classList.contains("is-docked")) return;
      applyRect(dockRect());
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

    // Stretch the box to a bigger "alarm" size. Bounded against the
    // viewport while docked (position:fixed, same bounds drag/resize use
    // above) or against the stage in the rare case the alarm fires before
    // the demo has ever been docked (still position:absolute in the stage
    // at that point).
    const docked = demo.classList.contains("is-docked");
    const boundsRect = docked ? { width: window.innerWidth, height: window.innerHeight } : stage.getBoundingClientRect();
    const bigWidth = Math.min(340, boundsRect.width);
    const bigHeight = Math.min(300, boundsRect.height);
    const bigRect = {
      left: Math.max(0, (boundsRect.width - bigWidth) / 2),
      top: Math.max(0, (boundsRect.height - bigHeight) / 2),
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

      applyRect(docked ? dockRect() : expandRect());

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

  // Keep the demo within bounds if the viewport is resized. Expanded is
  // still position:absolute with an explicit pixel rect applied once by
  // expand()/initDefaultExpanded() — it does NOT reflow on its own, so a
  // narrower viewport needs expandRect() recomputed and reapplied or the
  // stale rect gets clipped by .mini-demo-stage's overflow:hidden. Docked
  // doesn't fight a size the visitor deliberately dragged, just clamps
  // position/size so it can't end up hidden or overflowing off the edge.
  window.addEventListener("resize", () => {
    if (isRinging) return;
    if (!demo.classList.contains("is-docked")) {
      applyRect(expandRect());
      return;
    }
    const rect = {
      left: demo.offsetLeft,
      top: demo.offsetTop,
      width: demo.offsetWidth,
      height: demo.offsetHeight,
    };
    rect.width = Math.min(rect.width, Math.max(MIN_WIDTH, window.innerWidth));
    rect.height = Math.min(rect.height, Math.max(MIN_HEIGHT, window.innerHeight));
    rect.left = Math.min(Math.max(0, rect.left), Math.max(0, window.innerWidth - rect.width));
    rect.top = Math.min(Math.max(0, rect.top), Math.max(0, window.innerHeight - rect.height));
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
    // 800x1100 matches the real app's own default window size (lib/windows.js)
    // so the expanded view fits the app's tallest tab (Interval Timer) without
    // an internal scrollbar, and reads as "this is the actual app," not an
    // arbitrarily-sized box.
    const width = Math.min(800, stageRect.width - 32);
    const height = Math.min(1100, EXPANDED_STAGE_HEIGHT - 32);
    return {
      left: Math.max(0, (stageRect.width - width) / 2),
      top: Math.max(0, (EXPANDED_STAGE_HEIGHT - height) / 2),
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
      playBtn?.classList.remove("is-active");
      pauseBtn?.classList.remove("is-active");
    } else if (event.data?.type === "demo-shrink") {
      remainingSeconds = Math.max(0, Math.round(event.data.remainingSeconds));
      renderCountdown();
      collapse();
      if (event.data.isRunning) {
        startTicking();
        playBtn?.classList.add("is-active");
        pauseBtn?.classList.remove("is-active");
      } else {
        pauseBtn?.classList.add("is-active");
        playBtn?.classList.remove("is-active");
      }
    }
  }

  let isExpanded = false; // set true by initDefaultExpanded() below

  // Pin button toggles between docking and expanding, so its accessible
  // name/state must reflect whichever action it will perform *next* — not
  // a fixed label left over from the old one-way "expand" behavior.
  function setPinButtonState(expanded) {
    if (!pinBtn) return;
    const label = expanded ? "Pin to a small window" : "Expand back to full view";
    pinBtn.title = label;
    pinBtn.setAttribute("aria-label", label);
    pinBtn.setAttribute("aria-pressed", expanded ? "false" : "true");
  }

  function expand() {
    if (isRinging) return;
    isExpanded = true;
    setPinButtonState(true);
    window.addEventListener("message", onDemoMessage);
    setStageMode("expanded");
    demo.classList.remove("is-docked");
    demo.classList.add("is-animating");
    applyRect(expandRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";

    // Un-docking after the visitor has scrolled away (e.g. dock, scroll to
    // the page bottom, hit Pin) grows the stage by 1000+px right where it
    // already sits — if that's off-screen, bring it into view instead of
    // leaving the visitor stranded with no visual cue anything happened.
    const stageRect = stage.getBoundingClientRect();
    const inViewport = stageRect.bottom > 0 && stageRect.top < window.innerHeight;
    if (!inViewport) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stage.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    }
  }

  function collapse() {
    isExpanded = false;
    setPinButtonState(false);
    demo.classList.add("is-animating");
    demo.classList.add("is-docked");
    applyRect(dockRect());
    setTimeout(() => {
      demo.classList.remove("is-animating");
    }, 320);
    iframeEl.classList.remove("is-visible");
    iframeEl.classList.add("hidden");
    iframeEl.src = "about:blank";
    setStageMode("idle");
    window.removeEventListener("message", onDemoMessage);
    if (body) body.classList.remove("hidden");
  }

  function togglePin() {
    if (isRinging) return;
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  }

  if (pinBtn) {
    pinBtn.addEventListener("click", togglePin);
  }

  // The page loads directly into the expanded (real-app) view. This
  // mirrors expand()'s important side effects but applies the rect
  // immediately instead of animating from a small starting box — there is
  // nothing to animate *from* on first paint. The bespoke widget (already
  // painted synchronously above via the countdown/body markup) stays
  // visible until the iframe's own "demo-ready" message arrives and
  // onDemoMessage swaps it in — same handshake as a manual Pin click, just
  // triggered by page load instead of a click.
  function initDefaultExpanded() {
    isExpanded = true;
    setPinButtonState(true);
    window.addEventListener("message", onDemoMessage);

    // The stage's min-height transition (340ms) would otherwise animate
    // from its CSS default straight to the expanded height on the very
    // first rendered frame, contributing layout shift before the visitor
    // has seen anything settle. Suppress it for this one, page-load-only
    // jump; later manual expand()/collapse() toggles animate normally.
    stage.style.transition = "none";
    setStageMode("expanded");
    applyRect(expandRect());
    requestAnimationFrame(() => {
      stage.style.transition = "";
    });

    iframeEl.classList.remove("hidden");
    iframeEl.src = "app/?demo=1";
  }

  initDefaultExpanded();
})();
