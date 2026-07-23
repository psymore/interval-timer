import { ipcMain } from "electron";

import { createLogger } from "./logger.js";

const log = createLogger("presets");

export const MAX_PRESETS = 20;

const VALID_ALARM_TYPES = ["local", "youtube", "spotify"];
const MAX_LINK_LENGTH = 2000;
const MAX_LINKS_PER_TYPE = 5;

function isValidAlarmSource(alarmSource) {
  if (alarmSource === null || alarmSource === undefined) return true;
  if (typeof alarmSource !== "object") return false;
  if (!VALID_ALARM_TYPES.includes(alarmSource.type)) return false;
  return (
    typeof alarmSource.value === "string" &&
    alarmSource.value.length > 0 &&
    alarmSource.value.length <= MAX_LINK_LENGTH
  );
}

function isValidLinkArray(links) {
  return (
    Array.isArray(links) &&
    links.length <= MAX_LINKS_PER_TYPE &&
    links.every(l => typeof l === "string" && l.length <= MAX_LINK_LENGTH)
  );
}

function isValidAlarmLinks(alarmLinks) {
  if (alarmLinks === null || alarmLinks === undefined) return true;
  if (typeof alarmLinks !== "object") return false;
  return (
    isValidLinkArray(alarmLinks.youtube) && isValidLinkArray(alarmLinks.spotify)
  );
}

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
    isSmallNonNegInt(preset.loops) &&
    isValidAlarmSource(preset.alarmSource) &&
    isValidAlarmLinks(preset.alarmLinks)
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
