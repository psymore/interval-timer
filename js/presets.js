import { enhanceNumberInputs } from "./numberStepper.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";

const MAX_PRESETS = 20;

export async function setupPresets(onPresetLoad) {
  const container = document.getElementById("presetsContainer");
  const addBtn = document.getElementById("addPresetBtn");
  const triggerBtn = document.getElementById("presetTriggerBtn");
  const dropdown = document.getElementById("presetDropdown");

  if (!container || !addBtn || !triggerBtn || !dropdown) return;

  // ── Dropdown aç/kapat ─────────────────────────────────────
  function openDropdown() {
    dropdown.hidden = false;
    triggerBtn.setAttribute("aria-expanded", "true");
    triggerBtn.classList.add("preset-trigger--open");
    // İlk item'a focus
    container.querySelector(".preset-item__load")?.focus();
  }

  function closeDropdown() {
    dropdown.hidden = true;
    triggerBtn.setAttribute("aria-expanded", "false");
    triggerBtn.classList.remove("preset-trigger--open");
  }

  function toggleDropdown() {
    dropdown.hidden ? openDropdown() : closeDropdown();
  }

  triggerBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Dışarı tıklayınca kapat
  document.addEventListener("click", e => {
    if (
      !dropdown.hidden &&
      !dropdown.contains(e.target) &&
      e.target !== triggerBtn
    ) {
      closeDropdown();
    }
  });

  // Escape ile kapat
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !dropdown.hidden) {
      closeDropdown();
      triggerBtn.focus();
    }
  });

  // ── Render ────────────────────────────────────────────────
  async function renderPresets() {
    const [presets, active] = await Promise.all([
      window.electronAPI.presetsGetAll(),
      window.electronAPI.presetsGetActive(),
    ]);

    container.innerHTML = "";

    // Trigger label'ı aktif preset adıyla güncelle
    const triggerLabel = document.getElementById("presetTriggerLabel");
    if (triggerLabel) {
      triggerLabel.textContent = active?.name ?? t("interval.presetsDefault");
    }

    // Empty state
    if (!presets || presets.length === 0) {
      const li = document.createElement("li");
      li.className = "preset-empty";
      li.textContent = t("presets.emptyState");
      container.appendChild(li);
      addBtn.disabled = false;
      return;
    }

    presets.forEach(preset => {
      const li = buildPresetItem(
        preset,
        active?.id === preset.id,
        onPresetLoad,
        renderPresets,
        closeDropdown,
      );
      container.appendChild(li);
    });

    // Max limitte + New disabled
    addBtn.disabled = presets.length >= MAX_PRESETS;
    addBtn.title =
      presets.length >= MAX_PRESETS
        ? format(t("presets.maxReachedTitle"), { max: MAX_PRESETS })
        : "";
  }

  // + New preset
  addBtn.addEventListener("click", () => {
    closeDropdown();
    showPresetForm(null, renderPresets);
  });

  await renderPresets();

  onLanguageChange(() => {
    document.getElementById("presetFormOverlay")?.remove();
    renderPresets();
  });
}

// ── Preset item ───────────────────────────────────────────────
function buildPresetItem(preset, isActive, onLoad, onRefresh, onClose) {
  const isDefault = preset.id.startsWith("default-");

  const li = document.createElement("li");
  li.className = `preset-item${isActive ? " preset-item--active" : ""}`;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", isActive ? "true" : "false");

  const workLabel = formatDuration(preset.workMinutes, preset.workSeconds);
  const breakLabel = formatDuration(preset.breakMinutes, preset.breakSeconds);
  const loopLabel = `${preset.loops} loop${preset.loops !== 1 ? "s" : ""}`;

  li.innerHTML = `
    <button class="preset-item__load" aria-label="${format(t("presets.loadAriaLabel"), { name: escapeHtml(preset.name) })}">
      <span class="preset-item__name">${escapeHtml(preset.name)}</span>
      <span class="preset-item__meta">
        ⏱ ${workLabel}
        <span aria-hidden="true">·</span>
        ☕ ${breakLabel}
        <span aria-hidden="true">·</span>
        ↻ ${loopLabel}
      </span>
    </button>
    <div class="preset-item__actions">
      <button class="preset-item__btn preset-item__btn--edit"
        aria-label="${format(t("presets.editAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${t("presets.editTitle")}"
        ${isDefault ? "disabled" : ""}>✎</button>
      <button class="preset-item__btn preset-item__btn--delete"
        aria-label="${format(t("presets.deleteAriaLabel"), { name: escapeHtml(preset.name) })}"
        title="${isDefault ? t("presets.cannotDeleteDefaultTitle") : t("presets.deleteTitle")}"
        ${isDefault ? "disabled" : ""}>✕</button>
    </div>
    <div class="preset-item__confirm hidden">
      <span>${t("presets.deleteConfirm")}</span>
      <button class="preset-item__btn preset-item__btn--yes">${t("presets.confirmYes")}</button>
      <button class="preset-item__btn preset-item__btn--no">${t("presets.confirmNo")}</button>
    </div>
  `;

  // ── Load ──────────────────────────────────────────────────
  li.querySelector(".preset-item__load").addEventListener("click", async () => {
    await window.electronAPI.presetsSetActive(preset.id);
    onLoad(preset);

    // Trigger label güncelle
    const label = document.getElementById("presetTriggerLabel");
    if (label) label.textContent = preset.name;

    // Flash
    li.classList.add("preset-item--loaded");
    setTimeout(() => li.classList.remove("preset-item--loaded"), 500);

    onClose();
    await onRefresh();
  });

  // ── Edit ──────────────────────────────────────────────────
  const editBtn = li.querySelector(".preset-item__btn--edit");
  if (editBtn && !isDefault) {
    editBtn.addEventListener("click", e => {
      e.stopPropagation();
      onClose();
      showPresetForm(preset, onRefresh);
    });
  }

  // ── Delete inline confirm ──────────────────────────────────
  const deleteBtn = li.querySelector(".preset-item__btn--delete");
  const confirmPanel = li.querySelector(".preset-item__confirm");
  const confirmYes = li.querySelector(".preset-item__btn--yes");
  const confirmNo = li.querySelector(".preset-item__btn--no");

  if (deleteBtn && !isDefault) {
    deleteBtn.addEventListener("click", e => {
      e.stopPropagation();
      confirmPanel.classList.remove("hidden");
      li.querySelector(".preset-item__actions").classList.add("hidden");
      confirmYes.focus();
    });

    confirmNo.addEventListener("click", e => {
      e.stopPropagation();
      confirmPanel.classList.add("hidden");
      li.querySelector(".preset-item__actions").classList.remove("hidden");
      deleteBtn.focus();
    });

    confirmYes.addEventListener("click", async e => {
      e.stopPropagation();
      const result = await window.electronAPI.presetsDelete(preset.id);
      if (result?.error) {
        showToast(result.error, "error");
        return;
      }
      await onRefresh();
    });
  }

  return li;
}

// ── Preset form ───────────────────────────────────────────────
function showPresetForm(existingPreset, onRefresh) {
  document.getElementById("presetFormOverlay")?.remove();

  const isEdit = !!existingPreset;
  const p = existingPreset ?? {
    id: `preset-${Date.now()}`,
    name: "",
    workMinutes: 25,
    workSeconds: 0,
    breakMinutes: 5,
    breakSeconds: 0,
    loops: 4,
    isDefault: false,
  };

  const overlay = document.createElement("div");
  overlay.id = "presetFormOverlay";
  overlay.className = "preset-overlay";
  overlay.setAttribute("role", "presentation");

  overlay.innerHTML = `
    <div class="preset-form" role="dialog" aria-modal="true"
      aria-labelledby="pfTitle">
      <h3 class="preset-form__title" id="pfTitle">
        ${isEdit ? t("presets.editFormTitle") : t("presets.newFormTitle")}
      </h3>

      <div class="preset-form__field">
        <label for="pf-name">${t("presets.nameLabel")}</label>
        <input id="pf-name" type="text" maxlength="32"
          value="${escapeHtml(p.name)}"
          placeholder="${t("presets.namePlaceholder")}"
          autocomplete="off" />
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-wm">${t("presets.workMinLabel")}</label>
          <input id="pf-wm" type="number" min="0" max="99"
            value="${p.workMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-ws">${t("presets.workSecLabel")}</label>
          <input id="pf-ws" type="number" min="0" max="59"
            value="${p.workSeconds}" />
        </div>
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-bm">${t("presets.breakMinLabel")}</label>
          <input id="pf-bm" type="number" min="0" max="99"
            value="${p.breakMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-bs">${t("presets.breakSecLabel")}</label>
          <input id="pf-bs" type="number" min="0" max="59"
            value="${p.breakSeconds}" />
        </div>
      </div>

      <div class="preset-form__field">
        <label for="pf-loops">${t("presets.loopsLabel")}</label>
        <input id="pf-loops" type="number" min="1" max="99"
          value="${p.loops}" />
      </div>

      <p class="preset-form__error hidden" id="pfError"
        role="alert" aria-live="assertive"></p>

      <div class="preset-form__btns">
        <button id="pfSaveBtn" class="btn-primary">
          ${isEdit ? t("presets.saveChanges") : t("presets.createPreset")}
        </button>
        <button id="pfCancelBtn">${t("presets.cancel")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  enhanceNumberInputs(overlay);

  const nameInput = overlay.querySelector("#pf-name");
  const errEl = overlay.querySelector("#pfError");

  setTimeout(() => nameInput?.focus(), 50);

  function closeForm() {
    overlay.remove();
  }

  overlay.addEventListener("keydown", e => {
    if (e.key === "Escape") closeForm();
  });

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeForm();
  });

  overlay.querySelector("#pfCancelBtn").addEventListener("click", closeForm);

  async function validate() {
    const name = nameInput.value.trim();
    const workMinutes =
      parseInt(overlay.querySelector("#pf-wm").value, 10) || 0;
    const workSeconds =
      parseInt(overlay.querySelector("#pf-ws").value, 10) || 0;
    const breakMinutes =
      parseInt(overlay.querySelector("#pf-bm").value, 10) || 0;
    const breakSeconds =
      parseInt(overlay.querySelector("#pf-bs").value, 10) || 0;
    const loops = parseInt(overlay.querySelector("#pf-loops").value, 10) || 1;

    if (!name) {
      showError(t("presets.errorNameRequired"));
      nameInput.focus();
      return;
    }
    if (workMinutes === 0 && workSeconds === 0) {
      showError(t("presets.errorWorkDuration"));
      return;
    }

    const allPresets = await window.electronAPI.presetsGetAll();
    const duplicate = allPresets.find(
      pr => pr.name.toLowerCase() === name.toLowerCase() && pr.id !== p.id,
    );
    if (duplicate) {
      showError(format(t("presets.errorDuplicateName"), { name }));
      nameInput.focus();
      return;
    }

    errEl.classList.add("hidden");

    const result = await window.electronAPI.presetsSave({
      ...p,
      name,
      workMinutes,
      workSeconds,
      breakMinutes,
      breakSeconds,
      loops,
    });

    if (result?.error) {
      showError(result.error);
      return;
    }

    closeForm();
    await onRefresh();
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
  }

  overlay.querySelector("#pfSaveBtn").addEventListener("click", validate);

  overlay.querySelector(".preset-form").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      validate();
    }
  });
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = "success") {
  document.getElementById("presetToast")?.remove();

  const toast = document.createElement("div");
  toast.id = "presetToast";
  toast.className = `preset-toast preset-toast--${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("preset-toast--visible");
    setTimeout(() => {
      toast.classList.remove("preset-toast--visible");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function formatDuration(min, sec) {
  if (min > 0 && sec > 0) return `${min}m ${sec}s`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
