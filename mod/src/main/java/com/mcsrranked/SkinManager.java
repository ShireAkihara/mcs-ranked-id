package com.mcsrranked;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import org.apache.logging.log4j.LogManager;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Skin kustom untuk pemain lokal.
 * Membaca <folder game>/mcsr-skin/skin.png (+ skin.json untuk model "default" / "slim").
 * Mendukung PNG persegi 64, 128, 256, dan 512 piksel (tata letak sama dengan skin 64x64).
 */
public final class SkinManager {

	private static final Identifier SKIN_ID = new Identifier("mcsrranked", "custom_skin");
	private static Identifier texture = null;
	private static String model = "default";
	private static boolean loaded = false;

	private SkinManager() {
	}

	public static Identifier getTexture() {
		ensureLoaded();
		return texture;
	}

	public static String getModel() {
		ensureLoaded();
		return model;
	}

	/** Minta baca ulang file skin (dipanggil saat masuk world). */
	public static void reload() {
		loaded = false;
	}

	private static void ensureLoaded() {
		if (loaded) {
			return;
		}
		loaded = true; // jangan coba lagi tiap frame walau gagal
		texture = null;
		model = "default";

		Path dir = FabricLoader.getInstance().getGameDir().resolve("mcsr-skin");
		Path png = dir.resolve("skin.png");
		if (!Files.isRegularFile(png)) {
			return;
		}

		try (InputStream in = Files.newInputStream(png)) {
			NativeImage image = NativeImage.read(in);
			int w = image.getWidth();
			int h = image.getHeight();
			if (w != h || (w != 64 && w != 128 && w != 256 && w != 512)) {
				LogManager.getLogger("MCS Ranked").warn("Ukuran skin tidak didukung: " + w + "x" + h);
				image.close();
				return;
			}
			makeBaseLayerOpaque(image, w / 64);
			MinecraftClient.getInstance().getTextureManager()
					.registerTexture(SKIN_ID, new NativeImageBackedTexture(image));
			texture = SKIN_ID;
			model = readModel(dir.resolve("skin.json"));
		} catch (IOException | RuntimeException e) {
			LogManager.getLogger("MCS Ranked").warn("Gagal memuat skin: " + e);
			texture = null;
		}
	}

	private static String readModel(Path file) {
		try {
			if (Files.isRegularFile(file)) {
				String json = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
				JsonObject o = new JsonParser().parse(json).getAsJsonObject();
				if (o.has("model") && "slim".equals(o.get("model").getAsString())) {
					return "slim";
				}
			}
		} catch (IOException | RuntimeException ignored) {
			// pakai model default
		}
		return "default";
	}

	// Seperti Minecraft: lapisan dasar badan tidak boleh transparan (supaya tidak bolong)
	private static void makeBaseLayerOpaque(NativeImage img, int s) {
		opaque(img, 0, 0, 32 * s, 16 * s);
		opaque(img, 0, 16 * s, 64 * s, 32 * s);
		opaque(img, 16 * s, 48 * s, 48 * s, 64 * s);
	}

	private static void opaque(NativeImage img, int x1, int y1, int x2, int y2) {
		for (int y = y1; y < y2; y++) {
			for (int x = x1; x < x2; x++) {
				img.setPixelColor(x, y, img.getPixelColor(x, y) | 0xFF000000);
			}
		}
	}
}
