// ── Tab switching — show/hide only, no re-render ──────────────
export function switchTab(tab) {
  const intervalView = document.getElementById("intervalView");
  const timerView = document.getElementById("timerView");

  if (tab === "interval") {
    intervalView.classList.remove("hidden");
    timerView.classList.add("hidden");
  } else if (tab === "timer") {
    timerView.classList.remove("hidden");
    intervalView.classList.add("hidden");
  }

  // Highlight active tab button
  document.querySelectorAll(".tab-buttons button").forEach(button => {
    button.classList.toggle("active", button.getAttribute("data-tab") === tab);
  });

  // Sync settings modal to active tab
  const timerSettings = document.getElementById("timerSettings");
  const intervalSettings = document.getElementById("intervalSettings");
  if (timerSettings) timerSettings.classList.toggle("hidden", tab !== "timer");
  if (intervalSettings)
    intervalSettings.classList.toggle("hidden", tab !== "interval");
}

export function setupTabListeners() {
  const buttons = document.querySelectorAll(".tab-buttons button");

  if (!buttons.length) {
    console.error("setupTabListeners: no .tab-buttons button elements found.");
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");

      if (!tabName) {
        console.warn("Tab button is missing a data-tab attribute:", btn);
        return;
      }

      // switchTab() handles active class — no need to do it here too
      switchTab(tabName);
    });
  });
}
