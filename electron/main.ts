import { app, BrowserWindow, screen } from "electron";
import { join } from "path";

// Enable WebGPU
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-features", "Vulkan,UseSkiaRenderer");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: false,
    frame: true,
    backgroundColor: "#000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for MediaPipe WASM
    },
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    // Open DevTools in development (comment out for clean fullscreen)
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle GPU process crashes gracefully
app.on("gpu-process-crashed", (_event, killed) => {
  console.error("GPU process crashed", killed ? "(killed)" : "");
  app.quit();
});
