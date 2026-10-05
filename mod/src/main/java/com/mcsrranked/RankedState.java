package com.mcsrranked;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Status global mod (dibaca oleh HUD, ditulis oleh jembatan launcher).
 */
public final class RankedState {

	// Pemblokir resource pack (ubah ke false untuk mematikan)
	public static volatile boolean BLOCK_RESOURCE_PACKS = true;

	// Koneksi ke launcher
	public static volatile boolean connected = false;

	// Match
	public static volatile boolean inMatch = false;
	public static volatile String opponentName = "";
	public static volatile String opponentRank = "";
	public static volatile int opponentElo = 0;
	public static volatile String seed = "";
	public static volatile long startsAt = 0L;      // waktu mulai (jam server)
	public static volatile long serverOffsetMs = 0L; // jam server - jam komputer
	public static volatile long worldCreatedFor = 0L; // startsAt match yang worldnya sudah dibuat
	public static volatile boolean finishSent = false;
	public static volatile long finishMs = 0L;

	// Pesan singkat di layar
	public static volatile String notice = "";
	public static volatile long noticeUntil = 0L;

	private static final Set<String> SENT_SPLITS = Collections.synchronizedSet(new HashSet<String>());

	private RankedState() {
	}

	/** Waktu sejak match dimulai (negatif = masih hitung mundur). */
	public static long matchElapsedMs() {
		return System.currentTimeMillis() + serverOffsetMs - startsAt;
	}

	public static void showNotice(String text, long durationMs) {
		notice = text;
		noticeUntil = System.currentTimeMillis() + durationMs;
	}

	/** true kalau split ini belum pernah dikirim di match ini. */
	public static boolean markSplit(String name) {
		return SENT_SPLITS.add(name);
	}

	public static void resetMatchFlags() {
		SENT_SPLITS.clear();
		finishSent = false;
		finishMs = 0L;
	}
}
