import path from "path";
import fs from "fs";
import { BrowserWindow, ipcMain, safeStorage, shell } from "electron";

import { createLogger } from "./logger.js";

const log = createLogger("spotifyAuth");

const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

// Set via initSpotifyAuth() — the electron-store instance (for encrypted
// token persistence) and the icon path for the login BrowserWindow, plus
// the client id/secret loaded from spotify-credentials.json below.
let store = null;
let appIconPath = null;
let SPOTIFY_CLIENT_ID = "";
let SPOTIFY_CLIENT_SECRET = "";

// ── Spotify Credentials ───────────────────────────────────────
// Gitignored local file — copy spotify-credentials.example.json to
// spotify-credentials.json and fill in the values from the Spotify
// Dashboard. Never commit spotify-credentials.json.
function loadSpotifyCredentials(appRoot) {
  const credentialsPath = path.join(appRoot, "spotify-credentials.json");
  try {
    const raw = fs.readFileSync(credentialsPath, "utf-8");
    const { clientId, clientSecret } = JSON.parse(raw);
    return { clientId: clientId ?? "", clientSecret: clientSecret ?? "" };
  } catch {
    log.warn(
      "spotify-credentials.json not found or invalid — Spotify features will be unavailable. " +
        "Copy spotify-credentials.example.json to spotify-credentials.json and fill in your app's credentials.",
    );
    return { clientId: "", clientSecret: "" };
  }
}

export function initSpotifyAuth({ appRoot, store: storeInstance, appIconPath: iconPath }) {
  store = storeInstance;
  appIconPath = iconPath;
  const credentials = loadSpotifyCredentials(appRoot);
  SPOTIFY_CLIENT_ID = credentials.clientId;
  SPOTIFY_CLIENT_SECRET = credentials.clientSecret;
}

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

// ── Spotify token storage (main process only) ─────────────────
// Access/refresh tokens used to live in the renderer's localStorage as
// plaintext — anything with filesystem access to the app's profile
// directory could read a durable Spotify credential from there. Encrypt at
// rest with safeStorage (OS-keychain-backed) instead, same trust boundary
// the client secret already gets.
function saveSpotifyTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return;
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn(
      "safeStorage encryption unavailable — Spotify session will not persist.",
    );
    return;
  }
  const encrypted = safeStorage
    .encryptString(JSON.stringify(tokens))
    .toString("base64");
  store.set("spotifyTokens", encrypted);
}

function getSpotifyTokens() {
  const encrypted = store.get("spotifyTokens");
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(
      safeStorage.decryptString(Buffer.from(encrypted, "base64")),
    );
  } catch (e) {
    log.error("Failed to decrypt stored Spotify tokens:", e);
    return null;
  }
}

function clearSpotifyTokens() {
  store.delete("spotifyTokens");
}

// ── Spotify IPC ───────────────────────────────────────────────
export function registerSpotifyIpc() {
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
        icon: appIconPath,
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

      // ── Yükleme hatalarını yakala ve reddet (aksi halde promise hiç
      // ── settle olmaz ve "Connecting…" sonsuza kadar asılı kalır) ──
      authWindow.webContents.on(
        "did-fail-load",
        (_event, _errorCode, errorDescription, validatedURL) => {
          if (settled) return;
          log.error(
            `Spotify auth window failed to load: ${errorDescription} (${validatedURL})`,
          );
          settled = true;
          authWindow.close();
          reject(new Error(`Spotify login failed to load: ${errorDescription}`));
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

  ipcMain.handle("spotify:get-tokens", () => getSpotifyTokens());
  ipcMain.handle("spotify:save-tokens", (_event, tokens) =>
    saveSpotifyTokens(tokens),
  );
  ipcMain.handle("spotify:clear-tokens", () => clearSpotifyTokens());

  /**
   * spotify:open-track
   * OS URI ile Spotify masaüstü uygulamasını açar, track'i tam olarak çalar.
   * Token gerekmez — shell.openExternal işletim sistemine devrediyor.
   */
  ipcMain.handle("spotify:open-track", async (_event, trackId) => {
    // Re-validate here rather than trusting the renderer's own regex check
    // (SpotifyAlarmProvider._extractTrackId) — this is the trusted boundary.
    if (typeof trackId !== "string" || !/^[a-zA-Z0-9]{22}$/.test(trackId)) {
      throw new Error("spotify:open-track: Invalid track ID.");
    }
    await shell.openExternal(`spotify:track:${trackId}`);
  });
}
