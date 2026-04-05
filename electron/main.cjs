"use strict";
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".pdf": "application/pdf",
    ".webp": "image/webp"
  };
  return map[ext] || "application/octet-stream";
}

function safeFilePath(requestPath) {
  const raw = (requestPath || "/").split("?")[0];
  const decoded = decodeURIComponent(raw);
  let rel = decoded.replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  const candidate = path.resolve(path.join(ROOT, rel));
  const rootResolved = path.resolve(ROOT);
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (candidate !== rootResolved && !candidate.startsWith(prefix)) return null;
  return candidate;
}

function createStaticServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const urlPath = new URL(req.url || "/", "http://127.0.0.1").pathname;
        const filePath = safeFilePath(urlPath);
        if (!filePath) {
          res.writeHead(403);
          return res.end("Forbidden");
        }
        fs.stat(filePath, (err, st) => {
          if (err || !st.isFile()) {
            res.writeHead(404);
            return res.end("Not found");
          }
          res.setHeader("Content-Type", guessMime(filePath));
          fs.createReadStream(filePath).pipe(res);
        });
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
    srv.on("error", reject);
  });
}

let mainWindow = null;
let staticServer = null;

async function ensureServerPort() {
  if (!staticServer) {
    staticServer = await createStaticServer();
  }
  return staticServer.address().port;
}

async function createWindow() {
  const port = await ensureServerPort();
  const startUrl = `http://127.0.0.1:${port}/index.html`;

  const iconPath = path.join(ROOT, "assets", "branding", "app-icon-1024.png");
  const winOpts = {
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
  if (fs.existsSync(iconPath)) winOpts.icon = iconPath;

  mainWindow = new BrowserWindow(winOpts);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  await mainWindow.loadURL(startUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function shutdownServer() {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await createWindow();
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", shutdownServer);
}
