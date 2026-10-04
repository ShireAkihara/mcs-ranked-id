const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  toMod: (msg) => ipcRenderer.send("to-mod", msg),
  onModMessage: (cb) => ipcRenderer.on("from-mod", (_e, msg) => cb(msg)),
  play: (opts) => ipcRenderer.invoke("game-play", opts),
  onGameProgress: (cb) => ipcRenderer.on("game-progress", (_e, p) => cb(p)),
  onGameState: (cb) => ipcRenderer.on("game-state", (_e, running) => cb(running)),
  onModStatus: (cb) => ipcRenderer.on("mod-status", (_e, connected) => cb(connected)),
});
