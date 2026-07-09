import { translations } from "./translations.js";

const DEFAULT_LANGUAGE = "en";
let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();

export function getLanguage() {
  return currentLanguage;
}

export function t(key) {
  return (
    translations[currentLanguage]?.[key] ??
    translations[DEFAULT_LANGUAGE]?.[key] ??
    key
  );
}

export function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
    str,
  );
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
}

export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function setLanguage(lang, { persist = true } = {}) {
  if (!translations[lang] || lang === currentLanguage) return;
  currentLanguage = lang;
  applyTranslations(document);
  listeners.forEach(cb => cb(lang));
  if (persist) {
    try {
      await window.electronAPI.languageSet(lang);
    } catch (e) {
      console.warn("Failed to persist language:", e);
    }
  }
}

export async function initLanguage() {
  try {
    const stored = await window.electronAPI.languageGet();
    currentLanguage = translations[stored] ? stored : DEFAULT_LANGUAGE;
  } catch (e) {
    console.warn("Failed to read stored language:", e);
    currentLanguage = DEFAULT_LANGUAGE;
  }
  applyTranslations(document);
  window.electronAPI.onLanguageChanged(lang => {
    if (!translations[lang] || lang === currentLanguage) return;
    currentLanguage = lang;
    applyTranslations(document);
    listeners.forEach(cb => cb(lang));
  });
}
