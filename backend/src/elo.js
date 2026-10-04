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
// Isi bank seed dengan seed hasil filter kamu sendiri (string angka).
// Selama kosong, server memakai seed acak dan seedType "random".
const SEED_BANK = {
  random: [],
  ruined_portal: [],
  buried_treasure: [],
};

function seedTypesFor(elo) {
  const types = ["random"];
  if (elo >= 600) types.push("ruined_portal"); // Iron+
  if (elo >= 1200) types.push("buried_treasure"); // Emerald+
  return types;
}

const randomSeed = () => crypto.randomBytes(8).readBigInt64BE().toString();

// Pakai Elo pemain yang lebih rendah supaya adil
function pickSeed(elo1, elo2) {
  const types = seedTypesFor(Math.min(elo1, elo2));
  const type = types[crypto.randomInt(types.length)];
  const bank = SEED_BANK[type];
  if (bank.length === 0) return { seed: randomSeed(), seedType: "random" };
  return { seed: String(bank[crypto.randomInt(bank.length)]), seedType: type };
}

module.exports = { START_ELO, RANKS, getRank, getTier, calcElo, pickSeed };
