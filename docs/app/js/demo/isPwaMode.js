export function isPwaMode() {
  return window.electronAPI?.__platform === "pwa";
}
