"use strict";

const $ = (id) => document.getElementById(id);
const RANK_COLORS = {
  Coal: "#8a8f98", Iron: "#cfd3d8", Gold: "#f3c63f",
  Emerald: "#3ddc84", Diamond: "#4fe3ff", Netherite: "#b07cff",
};

const S = {
  api: localStorage.getItem("api") || "http://localhost:8080",
  token: localStorage.getItem("token"),
  user: null, ws: null, match: null, offset: 0,
  tick: null, qTimer: null, retry: 0, retryT: null, forfeitArm: null,
};

// ---------- util ----------
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== name));
  $("top").hidden = name === "login";
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3500);
}
function fmt(ms) {
  ms = Math.max(0, Math.floor(ms));
  const m = String(Math.floor(ms / 60000)).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return m + ":" + s;
}
function badge(el, rank) {
  el.textContent = rank;
  el.style.background = RANK_COLORS[rank] || "#8a8f98";
}
function setUser(u) {
  S.user = u;
  $("meName").textContent = u.username;
  badge($("meRank"), u.rank);
  $("homeElo").textContent = u.rank + " • " + u.elo + " Elo";
}
function logLine(text) {
  const li = document.createElement("li");
  li.textContent = text;
  $("log").prepend(li);
}

// ---------- REST ----------
async function api(path, body) {
  const res = await fetch(S.api + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Gagal (" + res.status + ")");
  return data;
}

async function doAuth(kind) {
  $("loginMsg").textContent = "";
  S.api = $("server").value.trim().replace(/\/+$/, "");
  localStorage.setItem("api", S.api);
  try {
    const d = await api("/auth/" + kind, { username: $("u").value.trim(), password: $("p").value });
    startSession(d.token, d.user);
  } catch (e) {
    $("loginMsg").textContent = e.message === "Failed to fetch" ? "Server tidak bisa dihubungi" : e.message;
  }
}

function startSession(token, user) {
  S.token = token;
  localStorage.setItem("token", token);
  if (user) setUser(user);
  show("home");
  connectWs();
}

function logout(msg) {
  S.token = null;
  localStorage.removeItem("token");
  const ws = S.ws;
  S.ws = null;
  if (ws) ws.close();
  clearTimeout(S.retryT);
  stopQueueUi();
  endMatchUi();
  $("p").value = "";
  show("login");
  if (msg) $("loginMsg").textContent = msg;
}

// ---------- WebSocket ----------
function connectWs() {
  clearTimeout(S.retryT);
  const ws = new WebSocket(S.api.replace(/^http/, "ws") + "/ws");
  S.ws = ws;
  ws.onopen = () => {
    S.retry = 0;
    $("conn").classList.add("on");
    ws.send(JSON.stringify({ type: "auth", token: S.token }));
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onMsg(m);
  };
  ws.onclose = (e) => {
    $("conn").classList.remove("on");
    if (S.ws !== ws || !S.token) return;
    if (e.code === 4003) return logout("Sesi habis, silakan masuk lagi");
    if (e.code === 4004) return logout("Akun ini dipakai di tempat lain");
    stopQueueUi();
    S.retryT = setTimeout(connectWs, Math.min(1000 * 2 ** S.retry++, 10000));
  };
}

function send(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
  else toast("Belum terhubung ke server");
}

function onMsg(m) {
  switch (m.type) {
    case "auth_ok": setUser(m.user); break;
    case "queue_joined": startQueueUi(); break;
    case "queue_left": stopQueueUi(); break;
    case "match_found":
    case "match_resume": startMatchUi(m); break;
    case "opponent_split": logLine("Lawan split: " + m.name + " (" + fmt(m.igt) + ")"); break;
    case "opponent_disconnected": logLine("Lawan terputus. Forfeit otomatis dalam " + Math.round(m.graceMs / 1000) + " detik."); break;
    case "opponent_reconnected": logLine("Lawan tersambung kembali."); break;
    case "match_end": showResult(m); break;
    case "error": toast(m.message || "Terjadi kesalahan"); break;
  }
}

// ---------- queue ----------
function startQueueUi() {
  stopQueueUi();
  const t0 = Date.now();
  $("btnQueue").textContent = "BATAL";
  S.qTimer = setInterval(() => {
    $("queueInfo").textContent = "Mencari lawan... " + fmt(Date.now() - t0);
  }, 500);
  $("queueInfo").textContent = "Mencari lawan... 00:00";
  S.queued = true;
}
function stopQueueUi() {
  clearInterval(S.qTimer);
  S.qTimer = null;
  S.queued = false;
  $("btnQueue").textContent = "MAIN RANKED";
  $("queueInfo").textContent = "";
}

// ---------- match ----------
function startMatchUi(m) {
  stopQueueUi();
  S.match = m;
  S.offset = m.serverTime - Date.now();
  $("oppName").textContent = m.opponent.username;
  badge($("oppRank"), m.opponent.rank);
  $("oppElo").textContent = m.opponent.elo + " Elo";
  $("seedInfo").textContent = m.seedType + " (" + m.seed + ")";
  if (m.type === "match_found") $("log").textContent = "";
  resetForfeit();
  clearInterval(S.tick);
  S.tick = setInterval(updateClock, 200);
  updateClock();
  show("match");
}
function elapsed() { return Date.now() + S.offset - S.match.startsAt; }
function updateClock() {
  if (!S.match) return;
  const e = elapsed();
  $("clock").textContent = e < 0 ? "Mulai dalam " + Math.ceil(-e / 1000) + " detik" : fmt(e);
}
function endMatchUi() {
  clearInterval(S.tick);
  S.tick = null;
  S.match = null;
  resetForfeit();
}
function resetForfeit() {
  clearTimeout(S.forfeitArm);
  S.forfeitArm = null;
  $("btnForfeit").textContent = "Forfeit";
}
function showResult(m) {
  endMatchUi();
  const reasons = { finish: "Naga dikalahkan", forfeit: "Forfeit", disconnect: "Koneksi terputus", timeout: "Waktu match habis" };
  $("resTitle").textContent = { win: "MENANG", loss: "KALAH", draw: "SERI" }[m.result];
  $("resReason").textContent = reasons[m.reason] || m.reason;
  const sign = m.delta > 0 ? "+" : "";
  $("resElo").textContent = m.eloBefore + " → " + m.eloAfter + " (" + sign + m.delta + ")";
  $("resRank").textContent = m.rankBefore === m.rankAfter ? "Rank: " + m.rankAfter : "Rank: " + m.rankBefore + " → " + m.rankAfter;
  if (S.user) setUser({ ...S.user, elo: m.eloAfter, rank: m.rankAfter });
  show("result");
}

// ---------- leaderboard ----------
async function loadLeaderboard() {
  show("leaderboard");
  const body = $("lbBody");
  body.textContent = "";
  try {
    const rows = await api("/leaderboard?limit=50");
    $("lbEmpty").hidden = rows.length > 0;
    for (const r of rows) {
      const tr = document.createElement("tr");
      const cells = [r.position, r.username, r.rank, r.elo, r.wins, r.losses];
      cells.forEach((c, i) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (i === 2) td.style.color = RANK_COLORS[r.rank];
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  } catch (e) {
    toast("Gagal memuat leaderboard");
  }
}

// ---------- events ----------
$("btnLogin").onclick = () => doAuth("login");
$("btnRegister").onclick = () => doAuth("register");
$("p").onkeydown = (e) => { if (e.key === "Enter") doAuth("login"); };
$("logout").onclick = () => logout();
$("btnQueue").onclick = () => send({ type: S.queued ? "queue_leave" : "queue_join" });
$("btnBack").onclick = () => show("home");
$("testSplit").onclick = () => { if (S.match) { send({ type: "split", name: "nether", igt: Math.max(0, elapsed()) }); logLine("Kamu split: nether"); } };
$("testFinish").onclick = () => { if (S.match) send({ type: "finish", igt: Math.max(1, elapsed()) }); };
$("btnForfeit").onclick = () => {
  if (S.forfeitArm) { send({ type: "forfeit" }); resetForfeit(); return; }
  $("btnForfeit").textContent = "Yakin? Klik lagi untuk forfeit";
  S.forfeitArm = setTimeout(resetForfeit, 4000);
};
document.querySelectorAll("[data-go]").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.go === "leaderboard") return loadLeaderboard();
    show(S.match ? "match" : "home");
  };
});

// ---------- start ----------
$("server").value = S.api;
if (S.token) startSession(S.token, null);
else show("login");
