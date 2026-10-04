const express = require("express");
const { db, getUserByName } = require("./db");
const { getRank } = require("./elo");

const router = express.Router();

router.get("/leaderboard", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const rows = db
    .prepare(
      `SELECT username, elo, wins, losses, verified, best_time_ms FROM users
       WHERE wins + losses > 0
       ORDER BY elo DESC, wins DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  res.json(
    rows.map((r, i) => ({
      position: offset + i + 1,
      username: r.username,
      elo: r.elo,
      rank: getRank(r.elo),
      wins: r.wins,
      losses: r.losses,
      verified: !!r.verified,
      bestTimeMs: r.best_time_ms,
    }))
  );
});

router.get("/profile/:username", (req, res) => {
  const u = getUserByName(req.params.username);
  if (!u) return res.status(404).json({ error: "Pemain tidak ditemukan" });
  res.json({
    username: u.username,
    elo: u.elo,
    rank: getRank(u.elo),
    wins: u.wins,
    losses: u.losses,
    forfeits: u.forfeits,
    verified: !!u.verified,
    bestTimeMs: u.best_time_ms,
  });
});

module.exports = { router };
