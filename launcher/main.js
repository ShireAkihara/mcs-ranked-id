const { app, BrowserWindow } = require("electron");
const path = require("path");

// Untuk tes 2 akun di 1 komputer: npm run start:b (data tersimpan terpisah)
const profileArg = process.argv.find((a) => a.startsWith("--profile="));
if (profileArg) {
  app.setPath("userData", path.join(app.getPath("userData"), profileArg.split("=")[1]));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#14161a",
    title: "MCSR Ranked",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
