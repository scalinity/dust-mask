"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isDev: process.env.NODE_ENV === "development"
});
