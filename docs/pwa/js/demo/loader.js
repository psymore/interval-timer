// Classic (non-module) script, loaded as an external file — not inlined —
// because index.html's CSP is `script-src 'self' ...` with no
// 'unsafe-inline', which silently blocks inline <script> blocks. As a
// same-origin external file this is allowed, and it runs before the
// type="module" scripts below it, so window.electronAPI exists by the
// time their init code touches it.
//
// Three cases, checked in order:
//   1. Real preload.cjs already ran (window.electronAPI exists) — real
//      Electron app, do nothing.
//   2. ?demo=1 in the URL — the GitHub Pages demo (docs/app/); loads the
//      in-memory electron-demo-shim.js. See js/demo/electron-demo-shim.js.
//   3. Neither — this is the deployed PWA (docs/pwa/), the only target
//      that reaches this branch at all; loads the real, persistent
//      electronAPI-web.js and registers the service worker.
if (new URLSearchParams(location.search).get("demo") === "1") {
  document.write('<script src="js/demo/electron-demo-shim.js"><\/script>');
} else if (!window.electronAPI) {
  document.write('<script src="platform/electronAPI-web.js"><\/script>');
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
}
