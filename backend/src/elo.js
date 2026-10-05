const crypto = require("crypto");

const START_ELO = 800;

// Tingkatan rank: angka divisi 1 (terendah) sampai 3 (tertinggi). Netherite tanpa divisi.
// Ubah angka "min" di sini kalau mau mengatur batas Elo.
const DIVISIONS = [
  { tier: "Coal", div: 1, min: 0 },
  { tier: "Coal", div: 2, min: 400 },
  { tier: "Coal", div: 3, min: 500 },
  { tier: "Iron", div: 1, min: 600 },
  { tier: "Iron", div: 2, min: 700 },
  { tier: "Iron", div: 3, min: 800 },
  { tier: "Gold", div: 1, min: 900 },
  { tier: "Gold", div: 2, min: 1000 },
  { tier: "Gold", div: 3, min: 1100 },
  { tier: "Emerald", div: 1, min: 1200 },
  { tier: "Emerald", div: 2, min: 1300 },
  { tier: "Emerald", div: 3, min: 1400 },
  { tier: "Diamond", div: 1, min: 1500 },
  { tier: "Diamond", div: 2, min: 1650 },
  { tier: "Diamond", div: 3, min: 1800 },
  { tier: "Netherite", div: 0, min: 2000 },
];
const RANKS = DIVISIONS;

function findDivision(elo) {
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (elo >= DIVISIONS[i].min) return DIVISIONS[i];
  }
  return DIVISIONS[0];
}

// Contoh: "Gold 2", "Netherite"
function getRank(elo) {
  const d = findDivision(elo);
  return d.div ? d.tier + " " + d.div : d.tier;
}

// Contoh: "Gold"
const getTier = (elo) => findDivision(elo).tier;

function kFactor(elo) {
  if (elo < 1200) return 40;
  if (elo < 2000) return 32;
  return 24;
}

function calcElo(winnerElo, loserElo) {
  const expected = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const gain = Math.max(1, Math.round(kFactor(winnerElo) * (1 - expected)));
  const loss = Math.max(1, Math.round(kFactor(loserElo) * (1 - expected)));
  return { winnerDelta: gain, loserDelta: -Math.min(loss, loserElo) };
}

// ---- Seed ----
// Daftar seed dibaca dari backend/seeds.json (isi dengan seed yang sudah kamu uji sendiri).
// Selama daftar kosong, server memakai seed acak.
const fs = require("fs");
const path = require("path");

const MIN_SEED = -(2n ** 63n);
const MAX_SEED = 2n ** 63n - 1n;

function validSeed(value) {
  const text = String(value).trim();
  if (!/^-?\d{1,19}$/.test(text)) return false;
  const n = BigInt(text);
  return n >= MIN_SEED && n <= MAX_SEED;
}

function loadSeedBank() {
  const bank = { random: [], ruined_portal: [], buried_treasure: [] };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "seeds.json"), "utf8"));
    for (const type of Object.keys(bank)) {
      if (Array.isArray(data[type])) bank[type] = data[type].filter(validSeed).map((v) => String(v).trim());
    }
  } catch {
    // tidak ada seeds.json: pakai seed acak
  }
  return bank;
}

const SEED_BANK = loadSeedBank();

function seedTypesFor(elo) {
  const types = ["random"];
  if (elo >= 600) types.push("ruined_portal"); // Iron+
  if (elo >= 1200) types.push("buried_treasure"); // Emerald+
  return types;
}

const randomSeed = () => crypto.randomBytes(8).readBigInt64BE().toString();

// Pakai Elo pemain yang lebih rendah supaya adil.
// Hanya tipe yang daftarnya terisi yang dipilih; kalau semua kosong, seed acak.
function pickSeed(elo1, elo2) {
  const available = seedTypesFor(Math.min(elo1, elo2)).filter((t) => SEED_BANK[t].length > 0);
  if (available.length === 0) return { seed: randomSeed(), seedType: "random" };
  const type = available[crypto.randomInt(available.length)];
  const bank = SEED_BANK[type];
  return { seed: bank[crypto.randomInt(bank.length)], seedType: type };
}

module.exports = { START_ELO, RANKS, getRank, getTier, calcElo, pickSeed };
