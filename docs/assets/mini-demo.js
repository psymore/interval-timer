// Static demo of the app's mini window on the landing page — resizable
// and draggable (mirrors js/mini.js's own manual resize/drag, just
// against a DOM element instead of a real BrowserWindow) but not wired
// to a real timer.
(function () {
  const demo = document.getElementById("miniDemo");
  const stage = demo?.parentElement;
  if (!demo || !stage) return;

  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 174;
  const DEFAULT_WIDTH = 240;
  const DEFAULT_HEIGHT = 180;

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

  // ── Resize — clamped to the stage's current bounds, so no edge can be
  // dragged past the container (the opposite edge stays fixed, same as
  // js/mini.js's real anchor math). ──────────────────────────────────
  demo.querySelectorAll(".mini-demo-resize").forEach((zone) => {
    zone.addEventListener("mousedown", (event) => {
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

  const resetBtn = document.getElementById("miniDemoResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => applyRect(centerRect()));
  }

  // Purely cosmetic — swaps which control looks "active", no real timer.
  const pauseBtn = document.getElementById("miniDemoPauseBtn");
  const playBtn = document.getElementById("miniDemoPlayBtn");
  if (pauseBtn && playBtn) {
    playBtn.addEventListener("click", () => {
      playBtn.classList.add("is-active");
      pauseBtn.classList.remove("is-active");
    });
    pauseBtn.addEventListener("click", () => {
      pauseBtn.classList.add("is-active");
      playBtn.classList.remove("is-active");
    });
  }

  // Keep the demo within the stage if the viewport is resized narrower —
  // doesn't fight a size the visitor deliberately dragged, just clamps
  // position/size so it can't end up hidden or overflowing off the edge.
  window.addEventListener("resize", () => {
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
})();
