const STORAGE_KEY = "recentAlarmPaths";
const MAX_RECENT = 5;

export function addRecentPath(recentPaths, newPath) {
  const withoutDup = recentPaths.filter(p => p !== newPath);
  return [newPath, ...withoutDup].slice(0, MAX_RECENT);
}

export function loadRecentPaths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentPaths(paths) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}
