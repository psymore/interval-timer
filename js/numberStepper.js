// Replaces the native OS-drawn spin buttons on number inputs with
// custom up/down buttons that match the app's dark theme.
export function enhanceNumberInputs(root = document) {
  root.querySelectorAll('input[type="number"]:not([data-stepper])').forEach(input => {
    input.dataset.stepper = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "number-stepper";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const up = document.createElement("button");
    up.type = "button";
    up.className = "number-stepper__btn number-stepper__up";
    up.setAttribute("aria-label", "Increase value");
    up.tabIndex = -1;

    const down = document.createElement("button");
    down.type = "button";
    down.className = "number-stepper__btn number-stepper__down";
    down.setAttribute("aria-label", "Decrease value");
    down.tabIndex = -1;

    const btnCol = document.createElement("div");
    btnCol.className = "number-stepper__btns";
    btnCol.appendChild(up);
    btnCol.appendChild(down);
    wrapper.appendChild(btnCol);

    function step(direction) {
      const before = input.value;
      direction > 0 ? input.stepUp() : input.stepDown();
      if (input.value !== before) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    up.addEventListener("click", () => step(1));
    down.addEventListener("click", () => step(-1));
  });
}
