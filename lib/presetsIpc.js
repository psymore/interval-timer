import { ipcMain } from "electron";

import { createLogger } from "./logger.js";

const log = createLogger("presets");

export const MAX_PRESETS = 20;

export function isValidPreset(preset) {
  if (!preset || typeof preset !== "object") return false;
  if (typeof preset.id !== "string" || !preset.id) return false;
  if (typeof preset.name !== "string" || preset.name.length > 100)
    return false;
  const isSmallNonNegInt = n => Number.isInteger(n) && n >= 0 && n <= 999;
  return (
    isSmallNonNegInt(preset.workMinutes) &&
    isSmallNonNegInt(preset.workSeconds) &&
    isSmallNonNegInt(preset.breakMinutes) &&
    isSmallNonNegInt(preset.breakSeconds) &&
    isSmallNonNegInt(preset.loops)
  );
}

// ── Preset IPC ────────────────────────────────────────────────
export function registerPresetsIpc(store) {
  ipcMain.handle("presets:get-all", () => {
    try {
      return store.get("presets");
    } catch (e) {
      log.error("presets:get-all error:", e);
      return [];
    }
  });

  ipcMain.handle("presets:get-active", () => {
    try {
      const presets = store.get("presets");
      const activeId = store.get("activePresetId");
      return presets.find(p => p.id === activeId) ?? presets[0];
    } catch (e) {
      log.error("presets:get-active error:", e);
      return null;
    }
  });

  ipcMain.handle("presets:save", (_event, preset) => {
    if (!isValidPreset(preset)) {
      return { error: "Invalid preset data." };
    }
    try {
      const presets = store.get("presets");
      const index = presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
        presets[index] = preset;
      } else {
        if (presets.length >= MAX_PRESETS) {
          return { error: `Maximum ${MAX_PRESETS} presets allowed.` };
        }
        presets.push(preset);
      }
      store.set("presets", presets);
      return { presets };
    } catch (e) {
      log.error("presets:save error:", e);
      return { error: "Failed to save preset." };
    }
  });

  ipcMain.handle("presets:delete", (_event, id) => {
    try {
      const presets = store.get("presets");
      const filtered = presets.filter(p => p.id !== id);
      store.set("presets", filtered);
      if (store.get("activePresetId") === id) {
        store.set("activePresetId", filtered[0]?.id ?? null);
      }
      return { presets: filtered };
    } catch (e) {
      log.error("presets:delete error:", e);
      return { error: "Failed to delete preset." };
    }
  });

  ipcMain.handle("presets:set-active", (_event, id) => {
    try {
      store.set("activePresetId", id);
      return { id };
    } catch (e) {
      log.error("presets:set-active error:", e);
      return { error: "Failed to set active preset." };
    }
  });
}
