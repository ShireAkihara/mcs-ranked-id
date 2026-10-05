package com.mcsrranked;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.CreditsScreen;
import net.minecraft.client.gui.screen.DownloadingTerrainScreen;
import net.minecraft.client.options.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.registry.RegistryKey;
import net.minecraft.world.World;
import org.lwjgl.glfw.GLFW;

/**
 * MCS Ranked - timer RTA + IGT.
 *
 * RTA = waktu nyata. IGT = waktu dalam game (tidak jalan saat pause / loading).
 * - Di dalam match ranked: RTA mengikuti jam server, tombol timer dikunci.
 * - Di luar match (latihan): mulai otomatis saat masuk world, bisa Start/Stop (F6) dan Reset (F9).
 * - Split otomatis: masuk Nether dan End. Finish: layar credits.
 * - Forfeit (F7): tekan dua kali dalam 4 detik.
 */
public class RankedClient implements ClientModInitializer {

	// Timer latihan
	private static boolean practiceRunning = false;
	private static boolean practiceFinished = false;
	private static long practiceAccumMs = 0L;
	private static long practiceStartNano = 0L;

	// IGT (dihitung per tick, 1 tick = 50 ms)
	private static long igtTicks = 0L;

	// Hasil akhir match
	private static long finalRtaMs = 0L;
	private static long finalIgtMs = 0L;

	private static KeyBinding forfeitKey;
	private static KeyBinding toggleKey;
	private static KeyBinding resetKey;
	private static long forfeitArmedUntil = 0L;
	private static RegistryKey<World> lastDim = null;
	private static boolean wasInWorld = false;
	private static long lastStartsAt = 0L;

	@Override
	public void onInitializeClient() {
		forfeitKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
				"key.mcsrranked.forfeit", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F7, "key.categories.mcsrranked"));
		toggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
				"key.mcsrranked.timer_toggle", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F6, "key.categories.mcsrranked"));
		resetKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
				"key.mcsrranked.timer_reset", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F9, "key.categories.mcsrranked"));

		LauncherBridge.start();
		ClientTickEvents.END_CLIENT_TICK.register(RankedClient::onTick);
		HudRenderCallback.EVENT.register(RankedClient::renderHud);
	}

	// ---------- timer latihan ----------

	private static long practiceRtaMs() {
		long ms = practiceAccumMs;
		if (practiceRunning) {
			ms += (System.nanoTime() - practiceStartNano) / 1_000_000L;
		}
		return ms;
	}

	private static void startPractice() {
		if (!practiceRunning) {
			practiceRunning = true;
			practiceStartNano = System.nanoTime();
		}
	}

	private static void stopPractice() {
		if (practiceRunning) {
			practiceAccumMs = practiceRtaMs();
			practiceRunning = false;
		}
	}

	private static void resetPractice() {
		practiceRunning = false;
		practiceFinished = false;
		practiceAccumMs = 0L;
		if (!RankedState.inMatch) {
			igtTicks = 0L;
		}
	}

	private static void onToggleKey() {
		if (RankedState.inMatch) {
			RankedState.showNotice("Timer dikunci saat match ranked", 3000L);
			return;
		}
		if (practiceRunning) {
			stopPractice();
		} else {
			startPractice();
		}
	}

	private static void onResetKey() {
		if (RankedState.inMatch) {
			RankedState.showNotice("Timer dikunci saat match ranked", 3000L);
			return;
		}
		resetPractice();
		igtTicks = 0L;
		RankedState.showNotice("Timer di-reset (tekan Start untuk mulai)", 3000L);
	}

	// ---------- tick ----------

	private static void onTick(MinecraftClient client) {
		while (forfeitKey.wasPressed()) {
			onForfeitKey();
		}
		while (toggleKey.wasPressed()) {
			onToggleKey();
		}
		while (resetKey.wasPressed()) {
			onResetKey();
		}

		// Match baru: IGT mulai dari nol
		if (RankedState.startsAt != lastStartsAt) {
			lastStartsAt = RankedState.startsAt;
			if (RankedState.inMatch) {
				igtTicks = 0L;
				finalRtaMs = 0L;
				finalIgtMs = 0L;
				resetPractice();
			}
		}

		// Waktu mulai tiba: buat world dari seed match (sekali per match)
		if (RankedState.inMatch && RankedState.matchElapsedMs() >= 0L
				&& RankedState.worldCreatedFor != RankedState.startsAt) {
			RankedState.worldCreatedFor = RankedState.startsAt;
			WorldCreator.createFromSeed(RankedState.seed);
			return;
		}

		if (client.world == null) {
			if (wasInWorld) {
				resetPractice();
			}
			wasInWorld = false;
			lastDim = null;
			return;
		}

		// Baru masuk world: timer latihan mulai otomatis
		if (!wasInWorld) {
			wasInWorld = true;
			SkinManager.reload(); // baca ulang skin kustom
			if (!RankedState.inMatch) {
				resetPractice();
				igtTicks = 0L;
				startPractice();
			}
		}

		// Split otomatis saat pindah dimensi
		RegistryKey<World> dim = client.world.getRegistryKey();
		if (lastDim != null && dim != lastDim && RankedState.inMatch) {
			if (dim == World.NETHER) {
				sendSplit("nether");
			} else if (dim == World.END) {
				sendSplit("end");
			}
		}
		lastDim = dim;

		// IGT: hanya jalan saat timer aktif, game tidak di-pause, dan bukan layar loading
		boolean counting;
		if (RankedState.inMatch) {
			counting = RankedState.matchElapsedMs() >= 0L && !RankedState.finishSent;
		} else {
			counting = practiceRunning;
		}
		if (counting && !client.isPaused() && !(client.currentScreen instanceof DownloadingTerrainScreen)) {
			igtTicks++;
		}

		// Credits = naga sudah dikalahkan
		if (client.currentScreen instanceof CreditsScreen) {
			if (RankedState.inMatch) {
				if (!RankedState.finishSent) {
					RankedState.finishSent = true;
					finalRtaMs = Math.max(1L, RankedState.matchElapsedMs());
					finalIgtMs = Math.max(1L, igtTicks * 50L);
					RankedState.finishMs = finalIgtMs;
					LauncherBridge.sendWithIgt("finish", null, finalIgtMs);
				}
			} else if (practiceRunning) {
				stopPractice();
				practiceFinished = true;
			}
		}
	}

	private static void sendSplit(String name) {
		if (RankedState.markSplit(name)) {
			LauncherBridge.sendWithIgt("split", name, Math.max(0L, igtTicks * 50L));
		}
	}

	private static void onForfeitKey() {
		long now = System.currentTimeMillis();
		if (!RankedState.inMatch) {
			RankedState.showNotice("Kamu tidak sedang dalam match", 3000L);
			return;
		}
		if (now < forfeitArmedUntil) {
			forfeitArmedUntil = 0L;
			LauncherBridge.sendSimple("forfeit");
			RankedState.showNotice("Forfeit dikirim...", 4000L);
		} else {
			forfeitArmedUntil = now + 4000L;
		}
	}

	// ---------- HUD ----------

	private static void renderHud(MatrixStack matrices, float tickDelta) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.world == null || client.options.hudHidden) {
			return;
		}

		float y = 4.0F;
		long now = System.currentTimeMillis();

		if (RankedState.inMatch && RankedState.matchElapsedMs() < 0L) {
			long left = (-RankedState.matchElapsedMs() + 999L) / 1000L;
			draw(client, matrices, "Mulai dalam " + left + " detik", y, 0xFFD54F);
			y += 12.0F;
		} else {
			long rta;
			long igt = igtTicks * 50L;
			int color;
			if (RankedState.inMatch) {
				if (RankedState.finishSent) {
					rta = finalRtaMs;
					igt = finalIgtMs;
					color = 0x55FF55;
				} else {
					rta = RankedState.matchElapsedMs();
					color = 0xFFFFFF;
				}
			} else {
				rta = practiceRtaMs();
				if (practiceFinished) {
					color = 0x55FF55;
				} else {
					color = practiceRunning ? 0xFFFFFF : 0xAAAAAA;
				}
			}
			draw(client, matrices, "RTA " + formatTime(rta), y, color);
			y += 11.0F;
			draw(client, matrices, "IGT " + formatTime(igt), y, color);
			y += 12.0F;
			if (!RankedState.inMatch) {
				draw(client, matrices, practiceRunning ? "Latihan (berjalan)" : "Latihan (berhenti)", y, 0x888888);
				y += 10.0F;
			}
		}

		if (RankedState.inMatch) {
			draw(client, matrices, "VS " + RankedState.opponentName + " [" + RankedState.opponentRank
					+ " " + RankedState.opponentElo + "]", y, 0xFFFFFF);
			y += 10.0F;
			draw(client, matrices, "Seed: " + RankedState.seed, y, 0xAAAAAA);
			y += 10.0F;
		}

		if (RankedState.connected) {
			draw(client, matrices, "Launcher: tersambung", y, 0x7CFC9A);
		} else {
			draw(client, matrices, "Launcher: tidak tersambung", y, 0xFF8A80);
		}
		y += 10.0F;

		if (now < RankedState.noticeUntil) {
			draw(client, matrices, RankedState.notice, y, 0xFFD54F);
			y += 10.0F;
		}
		if (now < forfeitArmedUntil) {
			draw(client, matrices, "Tekan tombol Forfeit sekali lagi untuk menyerah (4 detik)", y, 0xFF5555);
		}
	}

	private static void draw(MinecraftClient client, MatrixStack matrices, String text, float y, int color) {
		client.textRenderer.drawWithShadow(matrices, text, 4.0F, y, color);
	}

	private static String formatTime(long ms) {
		long minutes = ms / 60_000L;
		long seconds = (ms / 1000L) % 60L;
		long millis = ms % 1000L;
		return String.format("%02d:%02d.%03d", minutes, seconds, millis);
	}
}
