# MCSR Ranked Backend

## Jalankan
```bash
cp .env.example .env     # isi JWT_SECRET dengan string acak panjang (butuh Node.js 22.13+)
npm install
npm start                # atau: npm run dev
```

## REST
- `POST /auth/register` `{username, password}` -> `{token, user}`
- `POST /auth/login` `{username, password}` -> `{token, user}`
- `GET /leaderboard?limit=50&offset=0`
- `GET /profile/:username`
- `GET /health`

## WebSocket `ws://HOST:PORT/ws`
Pesan pertama wajib: `{"type":"auth","token":"<jwt>"}`

Client -> Server:
- `queue_join`, `queue_leave`
- `split` `{name, igt}`  (contoh: nether, bastion, fortress, blind, stronghold, end)
- `finish` `{igt}`       (dragon mati)
- `forfeit`

Server -> Client:
- `auth_ok`, `queue_joined`, `queue_left`
- `match_found` / `match_resume` `{matchId, seed, seedType, startsAt, serverTime, opponent}`
- `opponent_split`, `opponent_disconnected`, `opponent_reconnected`
- `match_end` `{result: win|loss|draw, reason, eloBefore, eloAfter, delta, rankBefore, rankAfter}`
- `error`

## Aturan
- Rank: Coal 0-599, Iron 600-899, Gold 900-1199, Emerald 1200-1499, Diamond 1500-1999, Netherite 2000+
- Elo awal 800 (ubah `START_ELO` di `src/elo.js`)
- Forfeit / disconnect lebih dari 60 detik = kalah (Elo berkurang)
- Match lebih dari 90 menit = draw
- Maksimal 3 match dengan lawan yang sama per jam (anti farming)
- Seed: isi `SEED_BANK` di `src/elo.js` dengan seed hasil filter. Kosong = seed acak.

## Belum ada (tahap anti-cheat)
Server saat ini mempercayai event `finish` dari client. Validasi hasil (hash mod, bukti dari mod) dikerjakan di milestone anti-cheat.
