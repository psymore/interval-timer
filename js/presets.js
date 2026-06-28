// Preset yönetimi — intervalTimerView ile entegre çalışır

export async function setupPresets(onPresetLoad) {
  const container = document.getElementById("presetsContainer");
  const addBtn = document.getElementById("addPresetBtn");
  if (!container || !addBtn) return;

  // ── Tüm preset'leri yükle ve render et ───────────────────
  async function renderPresets() {
    const [presets, active] = await Promise.all([
      window.electronAPI.presetsGetAll(),
      window.electronAPI.presetsGetActive(),
    ]);

    container.innerHTML = "";

    presets.forEach(preset => {
      const card = buildPresetCard(
        preset,
        active?.id === preset.id,
        onPresetLoad,
        renderPresets,
      );
      container.appendChild(card);
    });
  }

  // ── Yeni preset ekle ──────────────────────────────────────
  addBtn.addEventListener("click", () => {
    showPresetForm(null, renderPresets);
  });

  await renderPresets();
}

// ── Preset kartı ──────────────────────────────────────────────
function buildPresetCard(preset, isActive, onLoad, onRefresh) {
  const card = document.createElement("div");
  card.className = `preset-card${isActive ? " preset-card--active" : ""}`;
  card.dataset.id = preset.id;

  const workLabel = formatDuration(preset.workMinutes, preset.workSeconds);
  const breakLabel = formatDuration(preset.breakMinutes, preset.breakSeconds);

  card.innerHTML = `
    <div class="preset-card__body">
      <div class="preset-card__name">${escapeHtml(preset.name)}</div>
      <div class="preset-card__meta">
        <span title="Work">⏱ ${workLabel}</span>
        <span class="preset-meta-sep">·</span>
        <span title="Break">☕ ${breakLabel}</span>
        <span class="preset-meta-sep">·</span>
        <span title="Loops">↻ ${preset.loops}×</span>
      </div>
    </div>
    <div class="preset-card__actions">
      <button class="preset-btn preset-btn--load"
        aria-label="Load ${escapeHtml(preset.name)}">Load</button>
      <button class="preset-btn preset-btn--edit"
        aria-label="Edit ${escapeHtml(preset.name)}">✎</button>
      <button class="preset-btn preset-btn--delete"
        aria-label="Delete ${escapeHtml(preset.name)}">✕</button>
    </div>
  `;

  // Load
  card
    .querySelector(".preset-btn--load")
    .addEventListener("click", async () => {
      await window.electronAPI.presetsSetActive(preset.id);
      onLoad(preset);
      await onRefresh();
    });

  // Edit
  card.querySelector(".preset-btn--edit").addEventListener("click", () => {
    showPresetForm(preset, onRefresh);
  });

  // Delete — default preset'leri silme
  const deleteBtn = card.querySelector(".preset-btn--delete");
  if (preset.id.startsWith("default-")) {
    deleteBtn.disabled = true;
    deleteBtn.title = "Default presets cannot be deleted";
  } else {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete "${preset.name}"?`)) return;
      await window.electronAPI.presetsDelete(preset.id);
      await onRefresh();
    });
  }

  return card;
}

// ── Preset form (add / edit) ──────────────────────────────────
function showPresetForm(existingPreset, onRefresh) {
  // Varsa önceki formu kaldır
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
  overlay.innerHTML = `
    <div class="preset-form" role="dialog" aria-modal="true"
      aria-label="${isEdit ? "Edit" : "New"} Preset">
      <h3 class="preset-form__title">${isEdit ? "Edit Preset" : "New Preset"}</h3>

      <div class="preset-form__field">
        <label for="pf-name">Name</label>
        <input id="pf-name" type="text" maxlength="32"
          value="${escapeHtml(p.name)}" placeholder="e.g. Morning Focus" />
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-wm">Work min</label>
          <input id="pf-wm" type="number" min="0" max="99" value="${p.workMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-ws">Work sec</label>
          <input id="pf-ws" type="number" min="0" max="59" value="${p.workSeconds}" />
        </div>
      </div>

      <div class="preset-form__row">
        <div class="preset-form__field">
          <label for="pf-bm">Break min</label>
          <input id="pf-bm" type="number" min="0" max="99" value="${p.breakMinutes}" />
        </div>
        <div class="preset-form__field">
          <label for="pf-bs">Break sec</label>
          <input id="pf-bs" type="number" min="0" max="59" value="${p.breakSeconds}" />
        </div>
      </div>

      <div class="preset-form__field">
        <label for="pf-loops">Loops</label>
        <input id="pf-loops" type="number" min="1" max="99" value="${p.loops}" />
      </div>

      <p class="preset-form__error hidden" id="pfError"></p>

      <div class="preset-form__btns">
        <button id="pfSaveBtn" class="btn-primary">
          ${isEdit ? "Save changes" : "Create preset"}
        </button>
        <button id="pfCancelBtn">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus ilk input
  setTimeout(() => overlay.querySelector("#pf-name")?.focus(), 50);

  // Escape kapat
  overlay.addEventListener("keydown", e => {
    if (e.key === "Escape") overlay.remove();
  });

  // Cancel
  overlay.querySelector("#pfCancelBtn").addEventListener("click", () => {
    overlay.remove();
  });

  // Overlay dışı tıklama
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });

  // Save
  overlay.querySelector("#pfSaveBtn").addEventListener("click", async () => {
    const name = overlay.querySelector("#pf-name").value.trim();
    const workMinutes =
      parseInt(overlay.querySelector("#pf-wm").value, 10) || 0;
    const workSeconds =
      parseInt(overlay.querySelector("#pf-ws").value, 10) || 0;
    const breakMinutes =
      parseInt(overlay.querySelector("#pf-bm").value, 10) || 0;
    const breakSeconds =
      parseInt(overlay.querySelector("#pf-bs").value, 10) || 0;
    const loops = parseInt(overlay.querySelector("#pf-loops").value, 10) || 1;
    const errEl = overlay.querySelector("#pfError");

    // Validasyon
    if (!name) {
      errEl.textContent = "Please enter a name.";
      errEl.classList.remove("hidden");
      overlay.querySelector("#pf-name").focus();
      return;
    }
    if (workMinutes === 0 && workSeconds === 0) {
      errEl.textContent = "Work duration must be greater than 0.";
      errEl.classList.remove("hidden");
      return;
    }

    errEl.classList.add("hidden");

    const updated = {
      ...p,
      name,
      workMinutes,
      workSeconds,
      breakMinutes,
      breakSeconds,
      loops,
    };

    await window.electronAPI.presetsSave(updated);
    overlay.remove();
    await onRefresh();
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
