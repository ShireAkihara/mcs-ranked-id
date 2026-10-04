const { db } = require("./db");
const { createMatch, isInMatch } = require("./match");

const TICK_MS = 2000;
const BASE_RANGE = 100; // selisih Elo awal yang diizinkan
const RANGE_PER_SEC = 10; // range melebar tiap detik menunggu
const MAX_RANGE = 600;
const MAX_REMATCH_PER_HOUR = 3; // anti farming Elo

const queue = new Map(); // userId -> { ws, user, joinedAt }

const send = (ws, payload) => ws && ws.readyState === 1 && ws.send(JSON.stringify(payload));

function joinQueue(ws, user) {
  if (isInMatch(user.id)) return send(ws, { type: "error", message: "Kamu masih di dalam match" });
  queue.set(user.id, { ws, user, joinedAt: Date.now() });
  send(ws, { type: "queue_joined" });
}

function leaveQueue(userId, ws) {
  const entry = queue.get(userId);
  if (entry && (!ws || entry.ws === ws)) {
    queue.delete(userId);
    return true;
  }
  return false;
}

const rangeFor = (e, now) => Math.min(MAX_RANGE, BASE_RANGE + ((now - e.joinedAt) / 1000) * RANGE_PER_SEC);

const pairCountStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM matches
   WHERE ((p1 = ? AND p2 = ?) OR (p1 = ? AND p2 = ?))
   AND created_at > strftime('%s','now') - 3600`
);
const recentPairCount = (a, b) => pairCountStmt.get(a, b, b, a).c;

function tick() {
  const now = Date.now();
  for (const [id, e] of queue) {
    if (!e.ws || e.ws.readyState !== 1) queue.delete(id);
  }

  const entries = [...queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const used = new Set();

  for (const a of entries) {
    if (used.has(a.user.id)) continue;
    let best = null;
    let bestDiff = Infinity;

    for (const b of entries) {
      if (b === a || used.has(b.user.id)) continue;
      const diff = Math.abs(a.user.elo - b.user.elo);
      if (diff > Math.max(rangeFor(a, now), rangeFor(b, now))) continue;
      if (recentPairCount(a.user.id, b.user.id) >= MAX_REMATCH_PER_HOUR) continue;
      if (diff < bestDiff) {
        best = b;
        bestDiff = diff;
      }
    }

    if (best) {
      used.add(a.user.id);
      used.add(best.user.id);
      queue.delete(a.user.id);
      queue.delete(best.user.id);
      createMatch(a, best);
    }
  }
}

setInterval(tick, TICK_MS);

module.exports = { joinQueue, leaveQueue };
