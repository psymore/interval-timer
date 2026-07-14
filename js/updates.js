import { t, format, onLanguageChange } from "./i18n/i18n.js";

let currentUpdate = null;

function renderBanner() {
  const banner = document.getElementById("updateBanner");
  if (!banner) return;

  if (!currentUpdate) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  banner.classList.remove("hidden");
  banner.innerHTML = `
    <span class="update-banner__text">${format(t("updates.banner.message"), { version: currentUpdate.version })}</span>
    <button type="button" class="update-banner__download">${t("updates.banner.download")}</button>
    <button type="button" class="update-banner__dismiss" aria-label="${t("updates.banner.dismiss.ariaLabel")}">&times;</button>
  `;

  banner.querySelector(".update-banner__download").addEventListener("click", () => {
    window.electronAPI.updatesOpenReleases(currentUpdate.url);
  });

  banner.querySelector(".update-banner__dismiss").addEventListener("click", () => {
    window.electronAPI.updatesDismiss(currentUpdate.version);
    currentUpdate = null;
    renderBanner();
  });
}

export function setupUpdateChecker() {
  window.electronAPI.onUpdateAvailable(info => {
    currentUpdate = info;
    renderBanner();
  });
  onLanguageChange(renderBanner);

  const checkBtn = document.getElementById("checkUpdatesBtn");
  const statusEl = document.getElementById("updateCheckStatus");
  if (!checkBtn || !statusEl) return;

  checkBtn.addEventListener("click", async () => {
    checkBtn.disabled = true;
    statusEl.textContent = "";

    const result = await window.electronAPI.updatesCheck();

    checkBtn.disabled = false;

    if (result.error) {
      statusEl.textContent = t("settings.updates.error");
      return;
    }

    if (result.updateAvailable) {
      currentUpdate = { version: result.latestVersion, url: result.releaseUrl };
      renderBanner();
      statusEl.textContent = "";
    } else {
      statusEl.textContent = format(t("settings.updates.upToDate"), {
        version: result.currentVersion,
      });
    }
  });
}
