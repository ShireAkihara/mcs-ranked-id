require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const { router: authRouter, verifyToken, publicUser } = require("./auth");
const { router: leaderboardRouter } = require("./leaderboard");
const { getUserById } = require("./db");
const matchmaking = require("./matchmaking");
const match = require("./match");

const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/", leaderboardRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

const sessions = new Map(); // userId -> ws
const send = (ws, payload) => ws.readyState === 1 && ws.send(JSON.stringify(payload));

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.userId = null;
  const authTimer = setTimeout(() => {
    if (!ws.userId) ws.close(4001, "auth timeout");
  }, 10_000);

  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    // Pesan pertama wajib auth
    if (!ws.userId) {
      if (msg.type !== "auth") return;
      const payload = verifyToken(msg.token);
      const user = payload && getUserById(payload.uid);
      if (!user) return ws.close(4003, "invalid token");

      clearTimeout(authTimer);
      ws.userId = user.id;

      const old = sessions.get(user.id);
      sessions.set(user.id, ws);
      if (old && old !== ws) old.close(4004, "logged in elsewhere");

      send(ws, { type: "auth_ok", user: publicUser(user) });
      match.onReconnect(user.id, ws);
      return;
    }

    switch (msg.type) {
      case "queue_join": {
        const user = getUserById(ws.userId);
        if (user) matchmaking.joinQueue(ws, user);
        break;
      }
      case "queue_leave":
        if (matchmaking.leaveQueue(ws.userId, ws)) send(ws, { type: "queue_left" });
        break;
      case "forfeit":
      case "split":
      case "finish":
        match.handleMessage(ws.userId, msg);
        break;
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    if (!ws.userId) return;
    matchmaking.leaveQueue(ws.userId, ws);
    match.onDisconnect(ws.userId, ws);
    if (sessions.get(ws.userId) === ws) sessions.delete(ws.userId);
  });
});

// Heartbeat: putuskan koneksi yang mati
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

server.listen(PORT, () => console.log(`Ranked backend jalan di port ${PORT}`));
