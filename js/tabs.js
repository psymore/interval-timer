import { switchTab } from "./renderer.js";

export function setupTabListeners() {
  const buttons = document.querySelectorAll(".tab-buttons button");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");

      // Handle UI active class
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Call renderer
      switchTab(tabName);
    });
  });
}
