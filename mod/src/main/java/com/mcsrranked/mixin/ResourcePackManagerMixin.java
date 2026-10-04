package com.mcsrranked.mixin;

import com.mcsrranked.RankedState;
import net.minecraft.resource.ResourcePackManager;
import org.apache.logging.log4j.LogManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Menyaring daftar resource pack yang akan diaktifkan.
 * Hanya pack bawaan ("vanilla") dan pack milik mod Fabric yang diizinkan.
 * Semua pack dari folder resourcepacks, Programmer Art, dll. diblokir.
 */
@Mixin(ResourcePackManager.class)
public abstract class ResourcePackManagerMixin {

	@ModifyVariable(method = "setEnabledProfiles", at = @At("HEAD"), argsOnly = true)
	private Collection<String> mcsrranked$filterPacks(Collection<String> names) {
		if (!RankedState.BLOCK_RESOURCE_PACKS) {
			return names;
		}

		List<String> allowed = new ArrayList<>();
		for (String name : names) {
			if (name.equals("vanilla") || name.toLowerCase().startsWith("fabric")) {
				allowed.add(name);
			} else {
				LogManager.getLogger("MCSR Ranked").info("Resource pack diblokir: " + name);
			}
		}
		return allowed;
	}
}
