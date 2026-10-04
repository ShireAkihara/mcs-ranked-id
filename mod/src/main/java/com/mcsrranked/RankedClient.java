package com.mcsrranked;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.CreditsScreen;
import net.minecraft.client.util.math.MatrixStack;

/**
 * Timer RTA sederhana (versi 1):
 * - mulai saat kamu masuk ke world
 * - berhenti saat layar credits muncul (setelah mengalahkan Ender Dragon)
 * - reset saat keluar dari world
 */
public class RankedClient implements ClientModInitializer {

	private static boolean running = false;
	private static boolean finished = false;
	private static long startNano = 0L;
	private static long frozenMs = 0L;

	@Override
	public void onInitializeClient() {
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			boolean inWorld = client.world != null;

			if (!inWorld) {
				// keluar dari world: reset semuanya
				running = false;
				finished = false;
				frozenMs = 0L;
				return;
			}

			if (!running && !finished) {
				running = true;
				startNano = System.nanoTime();
			}

			if (running && client.currentScreen instanceof CreditsScreen) {
				frozenMs = (System.nanoTime() - startNano) / 1_000_000L;
				running = false;
				finished = true;
			}
		});

		HudRenderCallback.EVENT.register(RankedClient::renderTimer);
	}

	private static void renderTimer(MatrixStack matrices, float tickDelta) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.world == null || client.options.hudHidden) {
			return;
		}

		long ms;
		if (running) {
			ms = (System.nanoTime() - startNano) / 1_000_000L;
		} else {
			ms = frozenMs;
		}

		String text = formatTime(ms);
		int color = finished ? 0x55FF55 : 0xFFFFFF; // hijau kalau sudah selesai
		client.textRenderer.drawWithShadow(matrices, text, 4.0F, 4.0F, color);
	}

	private static String formatTime(long ms) {
		long minutes = ms / 60_000L;
		long seconds = (ms / 1000L) % 60L;
		long millis = ms % 1000L;
		return String.format("%02d:%02d.%03d", minutes, seconds, millis);
	}
}
