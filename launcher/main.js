const { app, BrowserWindow, ipcMain } = require("electron");
const net = require("net");
const path = require("path");
const game = require("./game");

// Untuk tes 2 akun di 1 komputer: npm run start:b (data tersimpan terpisah)
const profileArg = process.argv.find((a) => a.startsWith("--profile="));
if (profileArg) {
  app.setPath("userData", path.join(app.getPath("userData"), profileArg.split("=")[1]));
}

const BRIDGE_PORT = 47525;
let win = null;
const sockets = new Set(); // koneksi dari mod Minecraft
let lastMatch = null; // { msg, at } supaya mod yang baru nyambung tahu ada match

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#14161a",
    title: "MCS Ranked",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "index.html"));
  // Kirim status mod setelah halaman selesai dimuat (supaya tidak ketinggalan)
  win.webContents.on("did-finish-load", notifyStatus);
}

// ---------- Jembatan ke mod (TCP lokal, 1 JSON per baris) ----------
function sendToMod(msg, socket) {
  const line = JSON.stringify(msg) + "\n";
  if (socket) socket.write(line);
  else for (const s of sockets) s.write(line);
}

function notifyStatus() {
  if (win && !win.isDestroyed()) win.webContents.send("mod-status", sockets.size > 0);
}

function onModMessage(msg, socket) {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "hello") {
    if (lastMatch) {
      const elapsed = Date.now() - lastMatch.at;
      sendToMod({ ...lastMatch.msg, serverTime: lastMatch.msg.serverTime + elapsed }, socket);
    } else {
      sendToMod({ type: "idle" }, socket);
    }
    return;
  }
  if (["split", "finish", "forfeit"].includes(msg.type) && win && !win.isDestroyed()) {
    win.webContents.send("from-mod", { type: msg.type, name: msg.name, igt: msg.igt });
  }
}

function startBridge() {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    sockets.add(socket);
    notifyStatus();
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > 65536) return socket.destroy();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        onModMessage(msg, socket);
      }
    });
    socket.on("close", () => {
      sockets.delete(socket);
      notifyStatus();
    });
    socket.on("error", () => {});
  });
  server.on("error", (e) => console.error("Jembatan mod tidak aktif:", e.message));
  server.listen(BRIDGE_PORT, "127.0.0.1"); // hanya bisa diakses dari komputer ini
}

ipcMain.on("to-mod", (_e, msg) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "match") lastMatch = { msg, at: Date.now() };
  else if (msg.type === "match_end" || msg.type === "idle") lastMatch = null;
  sendToMod(msg);
});

ipcMain.handle("game-play", async (_e, opts) => {
  const emit = (channel, payload) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  try {
    return await game.launchGame(opts, emit);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.whenReady().then(() => {
  startBridge();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
