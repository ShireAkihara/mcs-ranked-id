// Meluncurkan Minecraft 1.16.1 + Fabric + mod dari launcher.
// Semua file game disimpan di folder sendiri: %APPDATA%\.mcsr-ranked
const { Client, Authenticator } = require("minecraft-launcher-core");
const { app } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MC_VERSION = "1.16.1";
// Mod dari Modrinth yang dipasang otomatis (tambah slug lain di sini nanti)
const MODRINTH_MODS = ["fabric-api"];
const UA = "mcsr-ranked-launcher/0.1";

let busy = false;

const gameRoot = () => path.join(app.getPath("appData"), ".mcsr-ranked");

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status + " dari " + new URL(url).host);
  return res.json();
}

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

// ---------- Java 8 ----------
function findJava8() {
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  const vendors = ["Eclipse Adoptium", "Java", "AdoptOpenJDK", "Zulu", "Amazon Corretto", "BellSoft"];
  for (const r of roots) {
    for (const v of vendors) {
      const dir = path.join(r, v);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!/(jdk|jre)-?(1\.)?8([._-]|$)/i.test(name)) continue;
        const exe = path.join(dir, name, "bin", "java.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

function resolveJava(custom) {
  if (custom) {
    const base = path.basename(custom).toLowerCase();
    if (!["java.exe", "javaw.exe", "java"].includes(base) || !fs.existsSync(custom)) {
      throw new Error("Lokasi Java tidak valid. Harus mengarah ke java.exe");
    }
    return custom;
  }
  const found = findJava8();
  if (!found) {
    throw new Error("Java 8 tidak ditemukan. Isi lokasi java.exe di Pengaturan.");
  }
  return found;
}

// ---------- Fabric ----------
async function ensureFabric(rootDir) {
  const versionsDir = path.join(rootDir, "versions");
  try {
    const loaders = await getJson("https://meta.fabricmc.net/v2/versions/loader/" + MC_VERSION);
    const pick = loaders.find((l) => l.loader.stable) || loaders[0];
    if (!pick) throw new Error("Fabric belum mendukung " + MC_VERSION);
    const lv = pick.loader.version;
    const id = "fabric-loader-" + lv + "-" + MC_VERSION;
    const file = path.join(versionsDir, id, id + ".json");
    if (!fs.existsSync(file)) {
      const profile = await getJson(
        "https://meta.fabricmc.net/v2/versions/loader/" + MC_VERSION + "/" + lv + "/profile/json"
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(profile));
    }
    return id;
  } catch (e) {
    // Tanpa internet: pakai Fabric yang sudah pernah terpasang
    if (fs.existsSync(versionsDir)) {
      const old = fs.readdirSync(versionsDir).filter((n) => n.startsWith("fabric-loader-") && n.endsWith("-" + MC_VERSION));
      if (old.length) return old.sort().pop();
    }
    throw e;
  }
}

// ---------- Mod ----------
function findOurJar() {
  const dir = path.join(__dirname, "..", "mod", "build", "libs");
  if (!fs.existsSync(dir)) return null;
  const jars = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jar") && !f.endsWith("-sources.jar") && !f.endsWith("-dev.jar"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return jars.length ? path.join(dir, jars[0].f) : null;
}

async function ensureModrinth(slug, modsDir) {
  try {
    const q =
      "loaders=" + encodeURIComponent('["fabric"]') +
      "&game_versions=" + encodeURIComponent('["' + MC_VERSION + '"]');
    const versions = await getJson("https://api.modrinth.com/v2/project/" + slug + "/version?" + q);
    if (!versions.length) throw new Error(slug + " tidak punya versi untuk " + MC_VERSION);
    const f = versions[0].files.find((x) => x.primary) || versions[0].files[0];
    const name = path.basename(f.filename);
    const dest = path.join(modsDir, name);
    if (fs.existsSync(dest) && sha1(fs.readFileSync(dest)) === f.hashes.sha1) return [name];

    const res = await fetch(f.url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error("Gagal mengunduh " + name + " (HTTP " + res.status + ")");
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha1(buf) !== f.hashes.sha1) throw new Error("Hash " + name + " tidak cocok");
    fs.writeFileSync(dest, buf);
    return [name];
  } catch (e) {
    // Tanpa internet: pakai versi yang sudah ada di folder mods
    const have = fs.readdirSync(modsDir).filter((n) => n.toLowerCase().startsWith(slug) && n.endsWith(".jar"));
    if (have.length) return have;
    throw e;
  }
}

// Folder mods dikunci: hanya mod yang diizinkan yang boleh ada
function cleanMods(modsDir, allowed) {
  for (const f of fs.readdirSync(modsDir)) {
    if (f.toLowerCase().endsWith(".jar") && !allowed.has(f)) fs.unlinkSync(path.join(modsDir, f));
  }
}

// ---------- Luncurkan ----------
async function launchGame(opts, emit) {
  if (busy) return { ok: false, error: "Minecraft sedang disiapkan atau berjalan" };
  busy = true;
  try {
    if (!opts || typeof opts.username !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(opts.username)) {
      throw new Error("Nama pemain tidak valid");
    }
    const ramGb = Math.min(16, Math.max(2, Math.round(Number(opts.ramGb) || 4)));
    const progress = (text, pct) => emit("game-progress", { text, pct: pct || 0 });

    progress("Mencari Java 8...", 3);
    const javaPath = resolveJava(typeof opts.javaPath === "string" ? opts.javaPath.trim() : "");

    const rootDir = gameRoot();
    const modsDir = path.join(rootDir, "mods");
    fs.mkdirSync(modsDir, { recursive: true });

    progress("Menyiapkan Fabric...", 8);
    const fabricId = await ensureFabric(rootDir);

    progress("Menyiapkan mod...", 14);
    const ourJar = findOurJar();
    if (!ourJar) throw new Error("Jar mod belum ada. Jalankan gradlew.bat build di folder mod dulu.");
    const allowed = new Set();
    const ourName = path.basename(ourJar);
    fs.copyFileSync(ourJar, path.join(modsDir, ourName));
    allowed.add(ourName);
    for (const slug of MODRINTH_MODS) {
      progress("Memeriksa mod: " + slug + "...", 18);
      (await ensureModrinth(slug, modsDir)).forEach((n) => allowed.add(n));
    }
    cleanMods(modsDir, allowed);

    const logFile = path.join(rootDir, "launcher-log.txt");
    fs.writeFileSync(logFile, "");
    const log = (l) => fs.appendFile(logFile, String(l).trimEnd() + "\n", () => {});

    const launcher = new Client();
    launcher.on("debug", log);
    launcher.on("data", log);
    launcher.on("progress", (p) =>
      progress("Mengunduh " + p.type + ": " + p.task + "/" + p.total, p.total ? 20 + Math.round((p.task / p.total) * 75) : 20)
    );
    launcher.on("close", (code) => {
      busy = false;
      log("Minecraft keluar dengan kode " + code);
      emit("game-state", false);
    });

    progress("Menyiapkan Minecraft (pertama kali bisa lama)...", 20);
    const proc = await launcher.launch({
      authorization: Authenticator.getAuth(opts.username), // akun offline, cukup untuk world lokal
      root: rootDir,
      javaPath,
      version: { number: MC_VERSION, type: "release", custom: fabricId },
      memory: { max: ramGb + "G", min: "1G" },
      overrides: { detached: false },
    });
    if (!proc) throw new Error("Gagal meluncurkan Minecraft. Lihat " + logFile);

    emit("game-state", true);
    progress("Minecraft berjalan", 100);
    return { ok: true };
  } catch (e) {
    busy = false;
    return { ok: false, error: e.message };
  }
}

module.exports = { launchGame, findJava8 };
