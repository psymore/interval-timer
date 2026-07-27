export function isDemoMode() {
  return new URLSearchParams(location.search).get("demo") === "1";
}
