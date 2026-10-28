"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  net,
  dialog,
  screen,
  session,
} = require("electron");
const { resolveWorkspace } = require("./lib/workspace");
const config = require("./config.json");

const BASE_DOMAIN = (process.env.LIMS_BASE_DOMAIN || config.baseDomain || "").trim().toLowerCase();
const LOGIN_PATH = config.loginPath || "/auth/staff";
const RELEASES_URL = "https://github.com/IRMClinic/irmclinic/releases";
const REACHABILITY_TIMEOUT_MS = 8000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;
let workspaceOrigin = null;

// ── settings ────────────────────────────────────────────────────────────────

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename so a crash can never leave a half-written settings file.
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return next;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const rendererFile = (name) => path.join(__dirname, "renderer", name);

function isTrustedSender(event) {
  const url = event.senderFrame?.url || "";
  return url.startsWith("file://");
}

function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (["https:", "http:", "mailto:", "tel:"].includes(protocol)) {
      void shell.openExternal(url);
    }
  } catch {
    // Ignore malformed URLs.
  }
}

function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" || (workspaceOrigin !== null && parsed.origin === workspaceOrigin);
  } catch {
    return false;
  }
}

async function checkReachable(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    // Any HTTP response (even 404) proves the host exists and is reachable.
    await net.fetch(origin, { method: "HEAD", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── window ──────────────────────────────────────────────────────────────────

function restoredBounds() {
  const saved = readSettings().windowBounds;
  const fallback = { width: 1360, height: 860 };
  if (!saved || !saved.width || !saved.height) return fallback;

  const visible = screen.getAllDisplays().some(({ workArea }) => {
    const { x = 0, y = 0, width, height } = saved;
    return x < workArea.x + workArea.width && x + width > workArea.x &&
      y < workArea.y + workArea.height && y + height > workArea.y;
  });
  return visible ? saved : fallback;
}

function showSetup() {
  if (!mainWindow) return;
  void mainWindow.loadFile(rendererFile("setup.html"));
}

function loadWorkspace() {
  if (!mainWindow) return;
  const { workspace } = readSettings();
  const resolved = resolveWorkspace(workspace, BASE_DOMAIN);
  if (!resolved.ok) {
    workspaceOrigin = null;
    showSetup();
    return;
  }
  workspaceOrigin = resolved.origin;
  void mainWindow.loadURL(`${resolved.origin}${LOGIN_PATH}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 980,
    minHeight: 640,
    title: "LabShope LIMS",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  const { wasMaximized } = readSettings();
  if (wasMaximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const wc = mainWindow.webContents;

  wc.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: "allow" };
    openExternalSafe(url);
    return { action: "deny" };
  });

  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is a cancelled navigation (e.g. a redirect), not a real failure.
    if (!isMainFrame || errorCode === -3 || validatedURL.startsWith("file:")) return;
    void mainWindow.loadFile(rendererFile("offline.html"), {
      query: { host: workspaceOrigin || "", reason: errorDescription || "" },
    });
  });

  wc.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") loadWorkspace();
  });

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    const maximized = mainWindow.isMaximized();
    writeSettings(
      maximized
        ? { wasMaximized: true }
        : { wasMaximized: false, windowBounds: mainWindow.getBounds() },
    );
  };
  mainWindow.on("close", saveBounds);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  loadWorkspace();
}

// ── IPC (local pages only) ──────────────────────────────────────────────────

ipcMain.handle("workspace:state", (event) => {
  if (!isTrustedSender(event)) return null;
  const { workspace } = readSettings();
  return {
    workspace: (workspace || "").replace(/^https?:\/\//, ""),
    baseDomain: BASE_DOMAIN,
    version: app.getVersion(),
  };
});

ipcMain.handle("workspace:save", async (event, value) => {
  if (!isTrustedSender(event)) return { ok: false, error: "Not allowed." };
  const resolved = resolveWorkspace(value, BASE_DOMAIN);
  if (!resolved.ok) return resolved;

  if (!(await checkReachable(resolved.origin))) {
    return {
      ok: false,
      error: `Couldn't reach ${resolved.host}. Check the name and your internet connection.`,
    };
  }

  writeSettings({ workspace: resolved.origin });
  loadWorkspace();
  return { ok: true };
});

ipcMain.handle("workspace:cancel", (event) => {
  if (!isTrustedSender(event)) return;
  loadWorkspace();
});

ipcMain.handle("workspace:change", (event) => {
  if (!isTrustedSender(event)) return;
  showSetup();
});

ipcMain.handle("app:retry", (event) => {
  if (!isTrustedSender(event)) return;
  loadWorkspace();
});

// ── menu ────────────────────────────────────────────────────────────────────

async function clearSavedData() {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Clear data", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Clear saved data",
    message: "Sign out and clear all saved data on this computer?",
    detail: "This removes your login, the saved workspace and cached files. Anything not yet saved to the server is lost.",
  });
  if (response !== 0) return;

  await session.defaultSession.clearStorageData();
  await session.defaultSession.clearCache();
  const file = settingsFile();
  fs.rmSync(file, { force: true });
  loadWorkspace();
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Change Workspace…", click: showSetup },
        { label: "Clear Saved Data…", click: () => void clearSavedData() },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: "Releases", click: () => openExternalSafe(RELEASES_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── updates ─────────────────────────────────────────────────────────────────

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    console.error("Auto-update unavailable:", error);
    return;
  }

  autoUpdater.on("error", (error) => console.error("Update check failed:", error?.message || error));
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Version ${info.version} has been downloaded.`,
      detail: "Restart to finish installing. Your work on the server is not affected.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error("Update check failed:", error?.message || error);
  });
  void check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}

// ── lifecycle ───────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ["notifications", "clipboard-sanitized-write", "fullscreen", "media"];
      callback(allowed.includes(permission) && isInternalUrl(webContents.getURL()));
    });

    buildMenu();
    createWindow();
    setupAutoUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
