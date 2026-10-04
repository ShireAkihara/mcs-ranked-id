const crypto = require("crypto");
const { db } = require("./db");
const { calcElo, getRank, pickSeed } = require("./elo");

const COUNTDOWN_MS = 10_000;
const DISCONNECT_GRACE_MS = 60_000; // lewat ini = forfeit otomatis
const MAX_MATCH_MS = 90 * 60_000; // lewat ini = draw (Elo tidak berubah)

const userMatch = new Map(); // userId -> match

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

const playerOf = (match, userId) => match.players.find((p) => p.user.id === userId);
const opponentOf = (match, userId) => match.players.find((p) => p.user.id !== userId);

const describe = (u) => ({ username: u.username, elo: u.elo, rank: getRank(u.elo), verified: !!u.verified });

function matchPayload(type, match, player) {
  return {
    type,
    matchId: match.id,
    seed: match.seed,
    seedType: match.seedType,
    startsAt: match.startsAt,
    serverTime: Date.now(),
    opponent: describe(opponentOf(match, player.user.id).user),
  };
}

const isInMatch = (userId) => userMatch.has(userId);

function createMatch(a, b) {
  const { seed, seedType } = pickSeed(a.user.elo, b.user.elo);
  const match = {
    id: crypto.randomUUID(),
    seed,
    seedType,
    startsAt: Date.now() + COUNTDOWN_MS,
    ended: false,
    timeout: null,
    players: [a, b].map((p) => ({ user: p.user, ws: p.ws, disconnectTimer: null })),
  };
  match.timeout = setTimeout(() => finishMatch(match, null, "timeout"), COUNTDOWN_MS + MAX_MATCH_MS);
  for (const p of match.players) {
    userMatch.set(p.user.id, match);
    send(p.ws, matchPayload("match_found", match, p));
  }
  return match;
}

function finishMatch(match, winnerId, reason, igt = null) {
  if (match.ended) return;
  match.ended = true;
  clearTimeout(match.timeout);
  match.players.forEach((p) => clearTimeout(p.disconnectTimer));

  const [p1, p2] = match.players;
  const duration = Math.max(0, Date.now() - match.startsAt);
  const getUser = db.prepare("SELECT * FROM users WHERE id = ?");

  const result = db.transaction(() => {
    const u1 = getUser.get(p1.user.id);
    const u2 = getUser.get(p2.user.id);
    const out = {
      [u1.id]: { before: u1.elo, delta: 0 },
      [u2.id]: { before: u2.elo, delta: 0 },
    };

    if (winnerId) {
      const winner = u1.id === winnerId ? u1 : u2;
      const loser = winner === u1 ? u2 : u1;
      const { winnerDelta, loserDelta } = calcElo(winner.elo, loser.elo);
      const quit = reason === "forfeit" || reason === "disconnect";

      db.prepare(
        `UPDATE users SET elo = elo + ?, wins = wins + 1,
         best_time_ms = CASE WHEN ? IS NOT NULL AND (best_time_ms IS NULL OR ? < best_time_ms) THEN ? ELSE best_time_ms END
         WHERE id = ?`
      ).run(winnerDelta, igt, igt, igt, winner.id);
      db.prepare("UPDATE users SET elo = elo + ?, losses = losses + 1, forfeits = forfeits + ? WHERE id = ?").run(
        loserDelta,
        quit ? 1 : 0,
        loser.id
      );
      out[winner.id].delta = winnerDelta;
      out[loser.id].delta = loserDelta;
    }

    db.prepare(
      `INSERT INTO matches (id, p1, p2, winner, reason, seed, seed_type, duration_ms, p1_delta, p2_delta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(match.id, u1.id, u2.id, winnerId, reason, match.seed, match.seedType, duration, out[u1.id].delta, out[u2.id].delta);

    return out;
  })();

  for (const p of match.players) {
    const r = result[p.user.id];
    const after = r.before + r.delta;
    send(p.ws, {
      type: "match_end",
      matchId: match.id,
      result: winnerId ? (winnerId === p.user.id ? "win" : "loss") : "draw",
      reason, // finish | forfeit | disconnect | timeout
      eloBefore: r.before,
      eloAfter: after,
      delta: r.delta,
      rankBefore: getRank(r.before),
      rankAfter: getRank(after),
    });
    userMatch.delete(p.user.id);
  }
}

function handleMessage(userId, msg) {
  const match = userMatch.get(userId);
  if (!match || match.ended) return;
  const opp = opponentOf(match, userId);

  switch (msg.type) {
    case "forfeit":
      finishMatch(match, opp.user.id, "forfeit");
      break;

    case "split": {
      if (Date.now() < match.startsAt - 2000) return;
      if (typeof msg.name !== "string" || !Number.isFinite(msg.igt)) return;
      send(opp.ws, { type: "opponent_split", name: msg.name.slice(0, 32), igt: Math.round(msg.igt) });
      break;
    }

    case "finish": {
      if (Date.now() < match.startsAt) return;
      const igt = Number.isFinite(msg.igt) && msg.igt > 0 && msg.igt < 1e8 ? Math.round(msg.igt) : null;
      finishMatch(match, userId, "finish", igt);
      break;
    }
  }
}

function onDisconnect(userId, ws) {
  const match = userMatch.get(userId);
  if (!match || match.ended) return;
  const player = playerOf(match, userId);
  if (!player || player.ws !== ws) return; // sesi lama, sudah diganti sesi baru
  const opp = opponentOf(match, userId);

  player.ws = null;
  send(opp.ws, { type: "opponent_disconnected", graceMs: DISCONNECT_GRACE_MS });
  player.disconnectTimer = setTimeout(() => finishMatch(match, opp.user.id, "disconnect"), DISCONNECT_GRACE_MS);
}

function onReconnect(userId, ws) {
  const match = userMatch.get(userId);
  if (!match || match.ended) return;
  const player = playerOf(match, userId);
  clearTimeout(player.disconnectTimer);
  player.ws = ws;
  send(ws, matchPayload("match_resume", match, player));
  send(opponentOf(match, userId).ws, { type: "opponent_reconnected" });
}

module.exports = { createMatch, handleMessage, onDisconnect, onReconnect, isInMatch };
