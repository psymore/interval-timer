// ── Shared timer state → mini window broadcast helpers ─────────
//
// Extracted out of renderer.js so js/timer.js and js/intervalTimer.js
// don't need to import from renderer.js (which in turn imports them to
// wire up at startup) — that reverse edge was the source of 2 of the 3
// circular-import cycles flagged by madge.
//
// Both tab controllers used to duplicate: a `broadcast(overrides)` that
// spread a base state object into the mini-window IPC call, a
// `setStatus(status)` that updated a status label element and
// re-broadcast, and mm:ss zero-padding formatting computed twice per
// tick (once for the visible countdown, once again for the broadcast
// payload). This module centralizes all three.

// ── mm:ss formatting ───────────────────────────────────────────
export function formatDuration(ms) {
  const mins = String(Math.floor(ms / 60000)).padStart(2, "0");
  const secs = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${mins}:${secs}`;
}

// ── Status label text ──────────────────────────────────────────
const STATUS_LABELS = {
  ready: "Status: Ready",
  running: "Status: Running",
  paused: "Status: Paused",
  stopped: "Status: Stopped",
  completed: "Status: Completed",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? `Status: ${status}`;
}

// ── Raw IPC send to the mini window ─────────────────────────────
export function broadcastTimerState(state) {
  window.electronAPI.sendTimerState(state);
}

// ── Broadcast shape + setStatus pattern, shared by timer.js and
//    intervalTimer.js ────────────────────────────────────────────
//
// `statusElementId` is the DOM id of the tab's status label.
// `getBaseState(status)` must return the tab-specific base state
// object (time/phase/tab/loop/total) for the given status; the
// returned `broadcast(overrides)` spreads `overrides` on top of it
// before sending, matching each controller's original behavior.
export function createTimerStateBroadcaster({ statusElementId, getBaseState }) {
  let status = "ready";

  function broadcast(overrides = {}) {
    broadcastTimerState({ ...getBaseState(status), ...overrides });
  }

  function setStatus(newStatus) {
    status = newStatus;
    const el = document.getElementById(statusElementId);
    if (el) el.textContent = statusLabel(status);
    broadcast();
  }

  function getStatus() {
    return status;
  }

  return { broadcast, setStatus, getStatus };
}
