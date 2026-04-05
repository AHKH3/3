"use strict";
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("pdfStudioDesktop", {
  platform: process.platform
});
