// Memakai SQLite bawaan Node.js (node:sqlite), jadi TIDAK perlu Python / Visual Studio.
// Butuh Node.js 22.13 ke atas.
const { DatabaseSync } = require("node:sqlite");
const { START_ELO } = require("./elo");

const db = new DatabaseSync(process.env.DB_PATH || "ranked.db");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Pembungkus transaksi: semua perubahan berhasil bersama, atau batal bersama
db.transaction = (fn) => (...args) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(...args);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    mc_uuid TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    elo INTEGER NOT NULL DEFAULT ${START_ELO},
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    forfeits INTEGER NOT NULL DEFAULT 0,
    best_time_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    p1 INTEGER NOT NULL REFERENCES users(id),
    p2 INTEGER NOT NULL REFERENCES users(id),
    winner INTEGER REFERENCES users(id),
    reason TEXT NOT NULL,
    seed TEXT NOT NULL,
    seed_type TEXT NOT NULL,
    duration_ms INTEGER,
    p1_delta INTEGER NOT NULL DEFAULT 0,
    p2_delta INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);
  CREATE INDEX IF NOT EXISTS idx_matches_pair ON matches(p1, p2, created_at);
`);

const getUserById = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
const getUserByName = (name) => db.prepare("SELECT * FROM users WHERE username = ?").get(name);

module.exports = { db, getUserById, getUserByName };
