package com.mcsrranked;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Menyambung ke launcher di komputer yang sama (127.0.0.1:47525).
 * Protokol: satu pesan JSON per baris. Tanpa library tambahan.
 */
public final class LauncherBridge {

	private static final int PORT = 47525;
	private static volatile PrintWriter out;
	private static boolean started = false;

	private LauncherBridge() {
	}

	public static synchronized void start() {
		if (started) {
			return;
		}
		started = true;
		Thread thread = new Thread(LauncherBridge::loop, "MCSR-Ranked-Bridge");
		thread.setDaemon(true);
		thread.start();
	}

	private static void loop() {
		while (true) {
			Socket socket = new Socket();
			try {
				socket.connect(new InetSocketAddress("127.0.0.1", PORT), 2000);
				socket.setTcpNoDelay(true);
				out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true);
				RankedState.connected = true;

				JsonObject hello = new JsonObject();
				hello.addProperty("type", "hello");
				hello.addProperty("modVersion", "1.0.0");
				send(hello);

				BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
				String line;
				while ((line = reader.readLine()) != null) {
					try {
						handle(new JsonParser().parse(line).getAsJsonObject());
					} catch (RuntimeException ignored) {
						// pesan rusak diabaikan
					}
				}
			} catch (IOException ignored) {
				// launcher belum jalan / terputus, coba lagi
			} finally {
				out = null;
				RankedState.connected = false;
				RankedState.inMatch = false;
				try {
					socket.close();
				} catch (IOException ignored) {
				}
			}
			try {
				Thread.sleep(3000L);
			} catch (InterruptedException e) {
				return;
			}
		}
	}

	public static void send(JsonObject message) {
		PrintWriter writer = out;
		if (writer != null) {
			synchronized (LauncherBridge.class) {
				writer.println(message.toString());
			}
		}
	}

	public static void sendSimple(String type) {
		JsonObject o = new JsonObject();
		o.addProperty("type", type);
		send(o);
	}

	public static void sendWithIgt(String type, String name, long igt) {
		JsonObject o = new JsonObject();
		o.addProperty("type", type);
		if (name != null) {
			o.addProperty("name", name);
		}
		o.addProperty("igt", igt);
		send(o);
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	private static void handle(JsonObject m) {
		String type = str(m, "type");
		switch (type) {
			case "match": {
				JsonObject opp = m.getAsJsonObject("opponent");
				RankedState.opponentName = str(opp, "username");
				RankedState.opponentRank = str(opp, "rank");
				RankedState.opponentElo = opp.has("elo") ? opp.get("elo").getAsInt() : 0;
				RankedState.seed = str(m, "seed");
				long newStart = m.get("startsAt").getAsLong();
				if (newStart != RankedState.startsAt) {
					RankedState.resetMatchFlags(); // match baru (bukan sambung ulang)
				}
				RankedState.startsAt = newStart;
				RankedState.serverOffsetMs = m.get("serverTime").getAsLong() - System.currentTimeMillis();
				RankedState.inMatch = true;
				RankedState.showNotice("Match ditemukan vs " + RankedState.opponentName, 6000L);
				break;
			}
			case "opponent_split":
				RankedState.showNotice("Lawan split: " + str(m, "name"), 6000L);
				break;
			case "opponent_disconnected":
				RankedState.showNotice("Lawan terputus", 6000L);
				break;
			case "opponent_reconnected":
				RankedState.showNotice("Lawan tersambung lagi", 4000L);
				break;
			case "match_end": {
				RankedState.inMatch = false;
				String result = str(m, "result");
				String label = result.equals("win") ? "MENANG" : result.equals("loss") ? "KALAH" : "SERI";
				int delta = m.has("delta") ? m.get("delta").getAsInt() : 0;
				RankedState.showNotice(label + " " + (delta > 0 ? "+" : "") + delta + " Elo -> "
						+ str(m, "eloAfter") + " (" + str(m, "rankAfter") + ")", 15000L);
				break;
			}
			case "idle":
				RankedState.inMatch = false;
				break;
			default:
				break;
		}
	}
}
