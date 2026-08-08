/*
 * Copyright (C) 2026 Multiverse Contributors
 *
 * This file is part of Multiverse.
 *
 * Multiverse is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Multiverse is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Multiverse. If not, see <https://www.gnu.org/licenses/>.
 */

import {
	applyProfileCosmetic,
	applyServerCosmetic,
	clearProfileCosmetic,
	clearServerCosmetic,
} from '@app/services/cosmetics/CosmeticsService';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import type {
	OwnedCosmeticNft,
	ProfileCosmeticSlot,
	ServerCosmeticSlot,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {useCallback, useEffect, useState} from 'react';

export interface UseCosmeticSlotEquipResult {
	/** Slot currently being saved (apply/clear in flight), or null. */
	savingSlot: string | null;
	/** True while the underlying NFT/applied-cosmetics data is still loading. */
	isLoading: boolean;
	/** All cosmetic NFTs the current user owns (unfiltered). */
	ownedNfts: Array<OwnedCosmeticNft>;
	/** The mint currently applied to `slot`, or null. */
	currentMint: (slot: string) => string | null;
	/** Owned NFTs matching `slot`'s cosmetic type. */
	nftsForSlot: (slot: string) => Array<OwnedCosmeticNft>;
	/** Apply `mint` to `slot`. Replaces whatever was previously equipped there. */
	applySlot: (slot: string, mint: string) => Promise<void>;
	/** Clear whatever is equipped in `slot`. */
	clearSlot: (slot: string) => Promise<void>;
}

/**
 * Shared non-visual logic behind every cosmetic-equip surface in the app:
 * the Settings → Profile Cosmetics tab, Settings → Server Cosmetics tab, and
 * the new rail-navigated shop modal's "Your Items" / "Server" views.
 *
 * Extracted from `CosmeticsTab.tsx` / `GuildCosmeticsTab.tsx`, which had
 * ~90% duplicated load-on-mount / per-slot-saving / apply-clear logic. Markup
 * is intentionally NOT shared — callers keep their own layout (compact
 * settings list-row vs. shop card-grid) and only consume this hook's state
 * and handlers.
 *
 * `guildId` selects the server-cosmetics variant (applies to
 * `PUT /guilds/:id/cosmetics` via `applyServerCosmetic`/`clearServerCosmetic`
 * and `CosmeticsStore.setAppliedGuild`); omitting it selects the profile
 * variant (`PUT /users/@me/cosmetics` via `applyProfileCosmetic`/
 * `clearProfileCosmetic` and `CosmeticsStore.setAppliedProfile`). Per the
 * existing codebase pattern, the service call happens first and its response
 * is handed to the store setter — these two functions are service-layer
 * only, never store methods.
 */
export function useCosmeticSlotEquip(guildId?: string): UseCosmeticSlotEquipResult {
	const [savingSlot, setSavingSlot] = useState<string | null>(null);

	useEffect(() => {
		CosmeticsStore.loadOwnedNfts();
		if (guildId) {
			CosmeticsStore.loadGuildCosmetics(guildId);
		} else {
			CosmeticsStore.loadProfileCosmetics();
		}
	}, [guildId]);

	const currentMint = useCallback(
		(slot: string) => (guildId ? CosmeticsStore.guildSlotMint(guildId, slot) : CosmeticsStore.profileSlotMint(slot)),
		[guildId],
	);

	const nftsForSlot = useCallback((slot: string) => CosmeticsStore.nftsForSlot(slot), []);

	const applySlot = useCallback(
		async (slot: string, mint: string) => {
			setSavingSlot(slot);
			try {
				if (guildId) {
					const updated = await applyServerCosmetic(guildId, slot as ServerCosmeticSlot, mint);
					CosmeticsStore.setAppliedGuild(guildId, updated);
				} else {
					const updated = await applyProfileCosmetic(slot as ProfileCosmeticSlot, mint);
					CosmeticsStore.setAppliedProfile(updated);
				}
			} finally {
				setSavingSlot(null);
			}
		},
		[guildId],
	);

	const clearSlot = useCallback(
		async (slot: string) => {
			setSavingSlot(slot);
			try {
				if (guildId) {
					const updated = await clearServerCosmetic(guildId, slot as ServerCosmeticSlot);
					CosmeticsStore.setAppliedGuild(guildId, updated);
				} else {
					const updated = await clearProfileCosmetic(slot as ProfileCosmeticSlot);
					CosmeticsStore.setAppliedProfile(updated);
				}
			} finally {
				setSavingSlot(null);
			}
		},
		[guildId],
	);

	const isLoading = guildId
		? CosmeticsStore.isLoadingNfts
		: CosmeticsStore.isLoadingNfts || CosmeticsStore.isLoadingProfile;

	return {
		savingSlot,
		isLoading,
		ownedNfts: CosmeticsStore.ownedNfts,
		currentMint,
		nftsForSlot,
		applySlot,
		clearSlot,
	};
}
