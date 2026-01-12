"use strict";
const electron = require("electron");
const path = require("path");
electron.app.commandLine.appendSwitch("enable-unsafe-webgpu");
electron.app.commandLine.appendSwitch("enable-features", "Vulkan,UseSkiaRenderer");
let mainWindow = null;
function createWindow() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: false,
    frame: true,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
      // Required for MediaPipe WASM
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("gpu-process-crashed", (_event, killed) => {
  console.error("GPU process crashed", killed ? "(killed)" : "");
  electron.app.quit();
});
