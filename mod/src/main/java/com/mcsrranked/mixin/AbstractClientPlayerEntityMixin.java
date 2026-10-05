package com.mcsrranked.mixin;

import com.mcsrranked.SkinManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Mengganti skin pemain lokal dengan skin kustom (kalau ada).
 */
@Mixin(AbstractClientPlayerEntity.class)
public abstract class AbstractClientPlayerEntityMixin {

	private boolean mcsrranked$isLocalPlayer() {
		return (Object) this == MinecraftClient.getInstance().player;
	}

	@Inject(method = "getSkinTexture", at = @At("HEAD"), cancellable = true)
	private void mcsrranked$skinTexture(CallbackInfoReturnable<Identifier> cir) {
		if (mcsrranked$isLocalPlayer()) {
			Identifier id = SkinManager.getTexture();
			if (id != null) {
				cir.setReturnValue(id);
			}
		}
	}

	@Inject(method = "getModel", at = @At("HEAD"), cancellable = true)
	private void mcsrranked$model(CallbackInfoReturnable<String> cir) {
		if (mcsrranked$isLocalPlayer() && SkinManager.getTexture() != null) {
			cir.setReturnValue(SkinManager.getModel());
		}
	}
}
