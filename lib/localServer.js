import path from "path";
import fs from "fs";
import http from "http";
import { ipcMain, dialog } from "electron";

import { createLogger } from "./logger.js";

const log = createLogger("localServer");

// ── Local server için MIME type haritası ──────────────────────
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

// Kullanıcının seçtiği local alarm dosyaları için izin verilen uzantılar —
// LocalAlarmProvider'ın desteklediği formatlarla eşleşir.
const LOCAL_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg"];

// Sabit port: localStorage bir origin'e (scheme+host+port) bağlıdır — port
// her başlangıçta rastgele seçilseydi (0), her açılış farklı bir origin'e
// denk gelir ve localStorage (seçili alarm, Spotify token'ları) hiç
// kalıcı olmazdı. Zaten kullanımda ise (nadir), OS'in seçtiği rastgele
// bir porta düşülür — bu durumda sadece o oturumda kalıcılık bozulur.
const LOCAL_SERVER_PORT = 47821;

let localServer = null;
let serverPort = 0;

// Set via initLocalServer() — the app root directory (containment boundary
// for static file serving) and the electron-store instance (for the
// allowed-local-audio-path allowlist). Passed in rather than imported so
// this module doesn't duplicate main.js's Store construction.
let appRoot = null;
let store = null;

export function initLocalServer({ appRoot: root, store: storeInstance }) {
  appRoot = root;
  store = storeInstance;
}

// Renderer http://127.0.0.1 origin'inden yükleniyor (YouTube IFrame API
// postMessage gerektirdiği için), bu yüzden <audio src="file://..."> artık
// çalışmıyor — Chromium, http origin'li bir sayfanın file:// kaynak
// yüklemesini engelliyor. Kullanıcının seçtiği local dosyaları da aynı
// origin üzerinden servis ederek bu engeli aşıyoruz.
function handleLocalAudioRequest(req, res) {
  const encodedPath = req.url.slice("/local-audio/".length);
  const filePath = decodeURIComponent(encodedPath);
  const ext = path.extname(filePath).toLowerCase();

  if (!LOCAL_AUDIO_EXTENSIONS.includes(ext)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Serve only the file the user actually picked via the native file-picker
  // dialog (recorded in `get-file-path`'s handler), never an arbitrary
  // absolute path — otherwise any local process or web page hitting this
  // fixed port could read any .mp3/.wav/.ogg file on disk. Case-insensitive
  // compare since this ships Windows-only (NTFS is case-insensitive).
  const resolved = path.resolve(filePath);
  const allowed = store.get("allowedLocalAudioPath");
  if (
    !allowed ||
    resolved.toLowerCase() !== path.resolve(allowed).toLowerCase()
  ) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] });
    res.end(data);
  });
}

function handleLocalServerRequest(req, res) {
  if (req.url.startsWith("/local-audio/")) {
    handleLocalAudioRequest(req, res);
    return;
  }

  const requestedPath =
    req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]);
  const resolved = path.resolve(path.join(appRoot, requestedPath));
  const root = path.resolve(appRoot);

  // path.join alone does not stop ".." from walking above appRoot — verify
  // the resolved path is still contained in the app directory before ever
  // reading it, otherwise a request like "/../../../Windows/win.ini" reads
  // arbitrary files off disk (this server is reachable by anything on the
  // local machine — see CLAUDE.md's port-binding rationale).
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      // Without a validator (ETag/Last-Modified) Chromium's disk HTTP cache
      // can still serve a stale copy of app source across restarts (the
      // cache lives in the Electron profile in userData, not tied to
      // process lifetime) — force a real read every time instead of
      // silently serving yesterday's JS/CSS.
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

// Idempotent — if the server is already running (e.g. this is called again
// from a second createWindow() after the main window was recreated via
// "activate"), resolves immediately with the existing port instead of
// starting a second listener.
export function startLocalServer() {
  if (localServer) return Promise.resolve(serverPort);

  return new Promise((resolve, reject) => {
    const tryListen = port => {
      localServer = http.createServer(handleLocalServerRequest);

      localServer.once("error", err => {
        if (err.code === "EADDRINUSE" && port !== 0) {
          log.warn(
            `Local server: port ${port} already in use, falling back to a ` +
              `random port (alarm selection/Spotify login won't persist across restarts this session).`,
          );
          tryListen(0);
        } else {
          reject(err);
        }
      });

      localServer.listen(port, "127.0.0.1", () => {
        serverPort = localServer.address().port;
        log.info(`Local server running on http://127.0.0.1:${serverPort}`);
        resolve(serverPort);
      });
    };

    tryListen(LOCAL_SERVER_PORT);
  });
}

export function stopLocalServer() {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
}

export function getServerPort() {
  return serverPort;
}

// ── File picker IPC ───────────────────────────────────────────
// Lives here (rather than main.js) because it writes the one piece of state
// (`allowedLocalAudioPath`) that handleLocalAudioRequest's allowlist check
// above reads — keeping the writer and the security check in the same file.
export function registerLocalServerIpc() {
  ipcMain.handle("get-file-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    // Record this as the one path `/local-audio/` is allowed to serve — see
    // handleLocalAudioRequest. Persisted (not just in-memory) so the
    // previously-selected alarm still plays after an app restart.
    store.set("allowedLocalAudioPath", path.resolve(filePath));
    return filePath;
  });
}
