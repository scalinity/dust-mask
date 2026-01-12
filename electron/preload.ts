import { contextBridge } from "electron";

// Expose minimal API to renderer
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isDev: process.env.NODE_ENV === "development",
});
