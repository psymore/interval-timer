import { switchTab } from "./renderer.js";

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
