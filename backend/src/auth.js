const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { db, getUserByName } = require("./db");
const { getRank } = require("./elo");

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  throw new Error("JWT_SECRET wajib diisi di .env (minimal 16 karakter)");
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

const signToken = (user) => jwt.sign({ uid: user.id }, SECRET, { expiresIn: "30d" });

function verifyToken(token) {
  try {
    return jwt.verify(String(token), SECRET);
  } catch {
    return null;
  }
}

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  elo: u.elo,
  rank: getRank(u.elo),
  wins: u.wins,
  losses: u.losses,
  verified: !!u.verified,
});

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false }));

router.post("/register", (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username 3-16 karakter: huruf, angka, underscore" });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "Password 8-72 karakter" });
  }
  if (getUserByName(username)) return res.status(409).json({ error: "Username sudah dipakai" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = typeof username === "string" ? getUserByName(username) : null;
  if (!user || typeof password !== "string" || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Username atau password salah" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

module.exports = { router, verifyToken, publicUser };
