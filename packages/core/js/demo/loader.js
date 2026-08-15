// Classic (non-module) script, loaded as an external file — not inlined —
// because index.html's CSP is `script-src 'self' ...` with no
// 'unsafe-inline', which silently blocks inline <script> blocks. As a
// same-origin external file this is allowed, and it runs before the
// type="module" scripts below it, so window.electronAPI exists by the time
// their init code touches it. See js/demo/electron-demo-shim.js for the
// actual shim contents (loaded conditionally below via document.write).
if (new URLSearchParams(location.search).get("demo") === "1") {
  document.write('<script src="js/demo/electron-demo-shim.js"><\/script>');
}
