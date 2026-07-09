import { ipcMain } from "electron";

import { createLogger } from "./logger.js";
import { getMiniWindow } from "./windows.js";

const log = createLogger("settings");

const SUPPORTED_LANGUAGES = ["en", "tr"];
const DEFAULT_LANGUAGE = "en";

export function registerSettingsIpc(store) {
  ipcMain.handle("settings:get-language", () => {
    try {
      const lang = store.get("language");
      return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
    } catch (e) {
      log.error("settings:get-language error:", e);
      return DEFAULT_LANGUAGE;
    }
  });

  ipcMain.handle("settings:set-language", (_event, lang) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return { error: "Unsupported language." };
    }
    try {
      store.set("language", lang);
      const miniWindow = getMiniWindow();
      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send("language-changed", lang);
      }
      return { language: lang };
    } catch (e) {
      log.error("settings:set-language error:", e);
      return { error: "Failed to save language." };
    }
  });
}
