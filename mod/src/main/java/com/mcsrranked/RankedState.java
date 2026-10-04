package com.mcsrranked;

/**
 * Status global mod.
 * Nanti nilai ini diatur oleh match ranked dari server.
 * Untuk sekarang, pemblokir resource pack selalu aktif (ubah ke false untuk mematikan).
 */
public final class RankedState {

	public static volatile boolean BLOCK_RESOURCE_PACKS = true;

	private RankedState() {
	}
}
