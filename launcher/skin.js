// Impor skin kustom: disimpan ke <folder game>\mcsr-skin\skin.png (dibaca oleh mod)
const { app, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const SIZES = [64, 128, 256, 512];
const dir = () => path.join(app.getPath("appData"), ".mcsr-ranked", "mcsr-skin");
const pngFile = () => path.join(dir(), "skin.png");
const metaFile = () => path.join(dir(), "skin.json");

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG) || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function readModel() {
  try {
    return JSON.parse(fs.readFileSync(metaFile(), "utf8")).model === "slim" ? "slim" : "default";
  } catch {
    return "default";
  }
}

function writeModel(model) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(metaFile(), JSON.stringify({ model: model === "slim" ? "slim" : "default" }));
}

function getSkin() {
  if (!fs.existsSync(pngFile())) return { exists: false, model: readModel() };
  const buf = fs.readFileSync(pngFile());
  const s = pngSize(buf);
  return {
    exists: true,
    width: s ? s.w : 0,
    height: s ? s.h : 0,
    model: readModel(),
    dataUrl: "data:image/png;base64," + buf.toString("base64"),
  };
}

function register(getWin) {
  ipcMain.handle("skin-get", () => getSkin());

  ipcMain.handle("skin-import", async () => {
    const r = await dialog.showOpenDialog(getWin(), {
      title: "Pilih file skin (PNG)",
      properties: ["openFile"],
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };

    const file = r.filePaths[0];
    if (fs.statSync(file).size > 4 * 1024 * 1024) return { ok: false, error: "File terlalu besar (maks. 4 MB)" };
    const buf = fs.readFileSync(file);
    const s = pngSize(buf);
    if (!s) return { ok: false, error: "Bukan file PNG yang valid" };
    if (s.w !== s.h || !SIZES.includes(s.w)) {
      return {
        ok: false,
        error: "Ukuran " + s.w + "x" + s.h + " tidak didukung. Pakai 64x64, 128x128, 256x256, atau 512x512 (persegi).",
      };
    }
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(pngFile(), buf);
    return { ok: true, ...getSkin() };
  });

  ipcMain.handle("skin-model", (_e, model) => {
    writeModel(model);
    return { ok: true };
  });

  ipcMain.handle("skin-remove", () => {
    try { fs.unlinkSync(pngFile()); } catch {}
    return { ok: true };
  });
}

module.exports = { register };
