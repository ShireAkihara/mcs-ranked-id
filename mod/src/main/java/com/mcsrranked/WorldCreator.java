package com.mcsrranked;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.SaveLevelScreen;
import net.minecraft.resource.DataPackSettings;
import net.minecraft.text.TranslatableText;
import net.minecraft.util.registry.RegistryTracker;
import net.minecraft.world.Difficulty;
import net.minecraft.world.GameMode;
import net.minecraft.world.GameRules;
import net.minecraft.world.gen.GeneratorOptions;
import net.minecraft.world.level.LevelInfo;
import org.apache.logging.log4j.LogManager;

import java.util.OptionalLong;

/**
 * Membuat world singleplayer baru dari seed, otomatis (tanpa layar Create World).
 */
public final class WorldCreator {

	private WorldCreator() {
	}

	public static void createFromSeed(String seedText) {
		MinecraftClient client = MinecraftClient.getInstance();
		long seed = parseSeed(seedText);

		client.execute(() -> {
			try {
				// Kalau sedang di dalam world, keluar dulu (seperti tombol Save and Quit)
				if (client.world != null) {
					boolean singleplayer = client.isInSingleplayer();
					client.world.disconnect();
					if (singleplayer) {
						client.disconnect(new SaveLevelScreen(new TranslatableText("menu.savingLevel")));
					} else {
						client.disconnect();
					}
				}

				String name = "MCS_Ranked_" + System.currentTimeMillis();
				GeneratorOptions options = GeneratorOptions.getDefaultOptions()
						.withHardcore(false, OptionalLong.of(seed)); // menerapkan seed
				LevelInfo info = new LevelInfo(name, GameMode.SURVIVAL, false, Difficulty.EASY, false,
						new GameRules(), DataPackSettings.SAFE_MODE);
				client.method_29607(name, info, RegistryTracker.create(), options);
			} catch (RuntimeException e) {
				LogManager.getLogger("MCS Ranked").error("Gagal membuat world dari seed", e);
				RankedState.showNotice("Gagal membuat world otomatis. Lihat log.", 8000L);
			}
		});
	}

	// Sama seperti Minecraft: angka dipakai langsung, teks diubah jadi angka lewat hash
	static long parseSeed(String text) {
		String t = text == null ? "" : text.trim();
		try {
			return Long.parseLong(t);
		} catch (NumberFormatException e) {
			return t.hashCode();
		}
	}
}
