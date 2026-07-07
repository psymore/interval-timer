import path from "path";
import { fileURLToPath } from "url";
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  dialog,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell,
} from "electron";
import fs from "fs";
import Store from "electron-store";

import http from "http";

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

let localServer = null;
let serverPort = 0;

// Sabit port: localStorage bir origin'e (scheme+host+port) bağlıdır — port
// her başlangıçta rastgele seçilseydi (0), her açılış farklı bir origin'e
// denk gelir ve localStorage (seçili alarm, Spotify token'ları) hiç
// kalıcı olmazdı. Zaten kullanımda ise (nadir), OS'in seçtiği rastgele
// bir porta düşülür — bu durumda sadece o oturumda kalıcılık bozulur.
const LOCAL_SERVER_PORT = 47821;

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

  fs.readFile(filePath, (err, data) => {
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

  let filePath = path.join(
    __dirname,
    decodeURIComponent(req.url.split("?")[0]),
  );
  if (req.url === "/") filePath = path.join(__dirname, "index.html");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const tryListen = port => {
      localServer = http.createServer(handleLocalServerRequest);

      localServer.once("error", err => {
        if (err.code === "EADDRINUSE" && port !== 0) {
          console.warn(
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
        console.log(`Local server running on http://127.0.0.1:${serverPort}`);
        resolve(serverPort);
      });
    };

    tryListen(LOCAL_SERVER_PORT);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Framed/taskbar-visible windows only — frameless windows (mini) have no
// titlebar to show it in, and skip the taskbar entirely.
const APP_ICON_PATH = path.join(__dirname, "build", "icon.ico");

// ── Spotify Credentials ───────────────────────────────────────
// Gitignored local file — copy spotify-credentials.example.json to
// spotify-credentials.json and fill in the values from the Spotify
// Dashboard. Never commit spotify-credentials.json.
function loadSpotifyCredentials() {
  const credentialsPath = path.join(__dirname, "spotify-credentials.json");
  try {
    const raw = fs.readFileSync(credentialsPath, "utf-8");
    const { clientId, clientSecret } = JSON.parse(raw);
    return { clientId: clientId ?? "", clientSecret: clientSecret ?? "" };
  } catch {
    console.warn(
      "spotify-credentials.json not found or invalid — Spotify features will be unavailable. " +
        "Copy spotify-credentials.example.json to spotify-credentials.json and fill in your app's credentials.",
    );
    return { clientId: "", clientSecret: "" };
  }
}

const { clientId: SPOTIFY_CLIENT_ID, clientSecret: SPOTIFY_CLIENT_SECRET } =
  loadSpotifyCredentials();
const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

// ── Store ─────────────────────────────────────────────────────
const MAX_PRESETS = 20;

const store = new Store({
  name: "timer-config",
  defaults: {
    presets: [
      {
        id: "default-pomodoro",
        name: "Pomodoro",
        workMinutes: 25,
        workSeconds: 0,
        breakMinutes: 5,
        breakSeconds: 0,
        loops: 4,
        isDefault: true,
      },
      {
        id: "default-short",
        name: "Short Focus",
        workMinutes: 15,
        workSeconds: 0,
        breakMinutes: 3,
        breakSeconds: 0,
        loops: 6,
        isDefault: false,
      },
      {
        id: "default-long",
        name: "Deep Work",
        workMinutes: 50,
        workSeconds: 0,
        breakMinutes: 10,
        breakSeconds: 0,
        loops: 2,
        isDefault: false,
      },
    ],
    activePresetId: "default-pomodoro",
  },
});

let mainWindow = null;
let miniWindow = null;
let tray = null;
let blockerId = null;
let isQuitting = false;
let miniTopmostInterval = null;

// ── Throttling prevention ─────────────────────────────────────
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// ── Main window ───────────────────────────────────────────────
async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const indexPath = path.join(__dirname, "index.html");

  if (!fs.existsSync(preloadPath)) {
    console.error(`Preload not found: ${preloadPath}`);
    return;
  }
  if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found: ${indexPath}`);
    return;
  }

  // Local server'ı başlat (henüz başlamadıysa)
  if (!localServer) {
    await startLocalServer();
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: APP_ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // file:// yerine http:// kullan
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

  mainWindow.on("close", e => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Mini window ───────────────────────────────────────────────
function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }

  const preloadPath = path.join(__dirname, "preload.cjs");
  const miniPath = path.join(__dirname, "mini.html");
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;

  miniWindow = new BrowserWindow({
    width: 280,
    height: 180,
    x: sw - 300,
    y: 20,
    minWidth: 240,
    minHeight: 160,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      backgroundThrottling: false,
    },
  });

  // Plain `alwaysOnTop: true` puts the window at Windows' default topmost
  // z-band, which other apps' own topmost windows can still cover — and
  // which Windows' fullscreen-optimization behavior hides outright when
  // another app goes fullscreen. "screen-saver" is the highest z-band
  // Electron exposes and is what reliably stays above fullscreen apps.
  miniWindow.setAlwaysOnTop(true, "screen-saver");

  // Belt-and-suspenders: some apps re-assert their own topmost status
  // (fullscreen video, games, presentation mode) which can still bump the
  // mini window down in the topmost stack even at "screen-saver" level.
  // Periodically re-assert ours so it recovers within a couple seconds
  // instead of staying hidden until manually refocused.
  miniTopmostInterval = setInterval(() => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.setAlwaysOnTop(true, "screen-saver");
    }
  }, 2000);

  miniWindow.on("show", () => {
    miniWindow.setAlwaysOnTop(true, "screen-saver");
  });

  miniWindow.loadFile(miniPath);

  miniWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-ready");
    }
  });

  miniWindow.on("closed", () => {
    miniWindow = null;
    if (miniTopmostInterval) {
      clearInterval(miniTopmostInterval);
      miniTopmostInterval = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-closed");
    }
  });
}

function closeMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
}

// ── Tray ──────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "assets", "stopwatch-main.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Timer App");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────
app
  .whenReady()
  .then(async () => {
    await createWindow(); // ← await eklendi
    createTray();
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  })
  .catch(err => console.error("App init error:", err));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});

// ── File picker IPC ───────────────────────────────────────────
ipcMain.handle("get-file-path", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Always on Top / Mini IPC ──────────────────────────────────
ipcMain.handle("set-always-on-top", (_event, value) => {
  if (value) {
    createMiniWindow();
    if (mainWindow) mainWindow.hide();
  } else {
    closeMiniWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
});

ipcMain.on("mini-action", (_event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("mini-action", action);
  }
});

ipcMain.on("timer-state", (_event, state) => {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send("timer-state", state);
  }
});

// ── Preset IPC ────────────────────────────────────────────────
ipcMain.handle("presets:get-all", () => {
  try {
    return store.get("presets");
  } catch (e) {
    console.error("presets:get-all error:", e);
    return [];
  }
});

ipcMain.handle("presets:get-active", () => {
  try {
    const presets = store.get("presets");
    const activeId = store.get("activePresetId");
    return presets.find(p => p.id === activeId) ?? presets[0];
  } catch (e) {
    console.error("presets:get-active error:", e);
    return null;
  }
});

ipcMain.handle("presets:save", (_event, preset) => {
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
    console.error("presets:save error:", e);
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
    console.error("presets:delete error:", e);
    return { error: "Failed to delete preset." };
  }
});

ipcMain.handle("presets:set-active", (_event, id) => {
  try {
    store.set("activePresetId", id);
    return { id };
  } catch (e) {
    console.error("presets:set-active error:", e);
    return { error: "Failed to set active preset." };
  }
});

// ── Spotify IPC ───────────────────────────────────────────────

/**
 * spotify:login
 * Authorization Code Flow ile kullanıcı login penceresi açar.
 * Code'u yakalar, token exchange yapar, token'ları döner.
 */
ipcMain.handle("spotify:login", async () => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error(
      "Spotify Client ID or Secret is missing — see spotify-credentials.example.json.",
    );
  }

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  authUrl.searchParams.set("scope", SPOTIFY_SCOPES);
  authUrl.searchParams.set("show_dialog", "true");

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 480,
      height: 680,
      icon: APP_ICON_PATH,
      alwaysOnTop: true,
      resizable: false,
      title: "Login with Spotify",
      show: false, // ← başta gizli aç
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    authWindow.once("ready-to-show", () => {
      authWindow.show();
      authWindow.focus(); // ← öne getir
    });

    let settled = false;

    authWindow.loadURL(authUrl.toString());

    // ── Hem will-redirect HEM will-navigate'i dinle ───────────
    // Spotify bazen navigate, bazen redirect kullanıyor
    const handleUrlChange = async (event, url) => {
      if (settled) return;
      if (!url.startsWith(SPOTIFY_REDIRECT_URI)) return;

      event.preventDefault();
      settled = true;
      authWindow.hide();

      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        const error = parsed.searchParams.get("error");

        if (error || !code) {
          authWindow.close();
          reject(
            new Error(`Spotify auth error: ${error ?? "No code returned"}`),
          );
          return;
        }

        const tokens = await exchangeCodeForTokens(code);
        authWindow.close();
        resolve(tokens);
      } catch (err) {
        authWindow.close();
        reject(err);
      }
    };

    authWindow.webContents.on("will-redirect", handleUrlChange);
    authWindow.webContents.on("will-navigate", handleUrlChange);

    // ── Beyaz ekran debug: yükleme hatalarını yakala ──────────
    authWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription, validatedURL) => {
        console.error(
          `Spotify auth window failed to load: ${errorDescription} (${validatedURL})`,
        );
      },
    );

    authWindow.on("closed", () => {
      if (!settled) {
        settled = true;
        reject(new Error("Spotify login cancelled by user."));
      }
    });
  });
});

/**
 * spotify:refresh
 * Refresh token ile yeni access token alır.
 * client_secret main process'te kalır.
 */
ipcMain.handle("spotify:refresh", async (_event, refreshToken) => {
  if (!refreshToken) {
    throw new Error("spotify:refresh: No refresh token provided.");
  }
  return refreshAccessToken(refreshToken);
});

/**
 * spotify:open-track
 * OS URI ile Spotify masaüstü uygulamasını açar, track'i tam olarak çalar.
 * Token gerekmez — shell.openExternal işletim sistemine devrediyor.
 */
ipcMain.handle("spotify:open-track", async (_event, trackId) => {
  if (!trackId) {
    throw new Error("spotify:open-track: No track ID provided.");
  }
  await shell.openExternal(`spotify:track:${trackId}`);
});

// ── Spotify helpers (main process only) ──────────────────────

async function exchangeCodeForTokens(code) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    // Spotify bazen yeni refresh token verir, bazen vermez
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});
