const crypto = require("crypto");

const START_ELO = 10;

const RANKS = [
  { name: "Coal", min: 0 },
  { name: "Iron", min: 600 },
  { name: "Gold", min: 900 },
  { name: "Emerald", min: 1200 },
  { name: "Diamond", min: 1500 },
  { name: "Netherite", min: 2000 },
];

function getRank(elo) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].min) return RANKS[i].name;
  }
  return RANKS[0].name;
}

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

module.exports = { START_ELO, RANKS, getRank, calcElo, pickSeed };
