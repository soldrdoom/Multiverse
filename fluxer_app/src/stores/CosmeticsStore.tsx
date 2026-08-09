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
	applyAsCreator,
	createListing,
	deleteListing,
	fetchCosmeticsStore,
	fetchCreatorStatus,
	fetchGuildCosmetics,
	fetchOwnedNfts,
	fetchPublicUserCosmetics,
	fetchUserCosmetics,
	submitListing,
	updateListing,
} from '@app/services/cosmetics/CosmeticsService';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import UserStore from '@app/stores/UserStore';
import type {
	AppliedCosmeticEntry,
	CreateListingRequest,
	CreatorListingEntry,
	CreatorStatusResponse,
	OwnedCosmeticNft,
	StoreListingNft,
	UpdateListingRequest,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {makeAutoObservable, reaction} from 'mobx';

/**
 * CosmeticsStore — global singleton holding:
 *   - ownedNfts: cosmetic NFTs in the current user's linked Solana wallet
 *   - appliedProfile: map of slot → applied entry for the current user's profile
 *   - appliedGuild: map of guildId → (slot → applied entry) for server cosmetics
 *
 * Populated on login by calling loadAll().  Mutations go through the service
 * layer and then update the store directly.
 */
class CosmeticsStore {
	/** All cosmetic NFTs the current user owns. Empty until loadOwnedNfts() completes. */
	ownedNfts: OwnedCosmeticNft[] = [];

	/** Shop catalog items. Empty until loadStoreItems() completes. */
	storeItems: StoreListingNft[] = [];

	/** Applied profile cosmetics keyed by slot name. */
	appliedProfile: Map<string, AppliedCosmeticEntry> = new Map();

	/** Applied server cosmetics keyed by guildId, then slot. */
	appliedGuild: Map<string, Map<string, AppliedCosmeticEntry & {applied_by: string}>> = new Map();

	/**
	 * Applied profile cosmetics for other (non-self) users, keyed by userId then slot.
	 * Populated lazily when a user's profile is viewed.
	 */
	appliedUsers: Map<string, Map<string, AppliedCosmeticEntry>> = new Map();

	/** Creator program state for the current user. */
	creatorStatus: CreatorStatusResponse | null = null;
	isLoadingCreatorStatus = false;

	isLoadingNfts = false;
	isLoadingProfile = false;
	isLoadingStore = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});

		// creatorStatus (in particular its wallet_linked flag) is fetched once per call to
		// loadCreatorStatus() and does not otherwise track the account's linked wallet. Without
		// this, linking/unlinking a wallet through any path other than a manual reload (e.g. a
		// future settings-page unlink, or a link performed while CreatorPanel/BuySheet aren't
		// mounted to trigger their own effects) would leave creatorStatus silently stale for the
		// rest of the session. Only refetch if status has been loaded before — an unmounted/never
		// -opened shop shouldn't eagerly hit GET /creators/@me just because the address changed.
		//
		// Deferred via queueMicrotask, matching NotificationStore.tsx's accountReactionDisposer
		// setup: CosmeticsStore is a module-level singleton (`export default new CosmeticsStore()`
		// below), and reaction()'s tracked function runs once synchronously at registration time
		// to establish its dependencies. Registering it directly in this constructor hit a real
		// circular-import ordering issue — UserStore was still `undefined` at that point (its own
		// module, via ClaimAccountModal.tsx et al., transitively imports back into this module
		// graph before UserStore's `export default new UserStore()` line runs) — confirmed live via
		// a MobX "Cannot read properties of undefined (reading 'getCurrentUser')" uncaught reaction
		// error on every page load. Deferring to a microtask runs this after all modules have
		// finished their synchronous top-level evaluation, sidestepping the ordering entirely.
		queueMicrotask(() => {
			reaction(
				() => UserStore.getCurrentUser()?.solanaAddress,
				() => {
					if (this.creatorStatus !== null) void this.loadCreatorStatus();
				},
			);
		});
	}

	// ─── Loaders ─────────────────────────────────────────────────────────────

	async loadStoreItems(): Promise<void> {
		if (this.isLoadingStore) return;
		this.isLoadingStore = true;
		try {
			const items = await fetchCosmeticsStore();
			this.storeItems = items;
		} catch {
			this.storeItems = [];
		} finally {
			this.isLoadingStore = false;
		}
	}

	async loadOwnedNfts(): Promise<void> {
		if (this.isLoadingNfts) return;
		this.isLoadingNfts = true;
		try {
			const nfts = await fetchOwnedNfts();
			this.ownedNfts = nfts;
		} catch {
			this.ownedNfts = [];
		} finally {
			this.isLoadingNfts = false;
		}
	}

	async loadProfileCosmetics(): Promise<void> {
		if (this.isLoadingProfile) return;
		this.isLoadingProfile = true;
		try {
			const applied = await fetchUserCosmetics();
			this.setAppliedProfile(applied);
		} catch {
			// Non-fatal — cosmetics just won't render
		} finally {
			this.isLoadingProfile = false;
		}
	}

	async loadGuildCosmetics(guildId: string): Promise<void> {
		try {
			const applied = await fetchGuildCosmetics(guildId);
			const map = new Map<string, AppliedCosmeticEntry & {applied_by: string}>();
			for (const entry of applied) {
				map.set(entry.slot, entry);
			}
			this.appliedGuild.set(guildId, map);
		} catch {
			// Non-fatal
		}
	}

	/**
	 * Load applied profile cosmetics for another user (non-self).
	 * Skips if we already have data for this user.
	 */
	async loadUserCosmetics(userId: string): Promise<void> {
		if (this.appliedUsers.has(userId)) return;
		try {
			const applied = await fetchPublicUserCosmetics(userId);
			const map = new Map<string, AppliedCosmeticEntry>();
			for (const entry of applied) {
				map.set(entry.slot, entry);
			}
			this.appliedUsers.set(userId, map);
		} catch {
			// Non-fatal — cosmetics just won't render for this user
		}
	}

	// ─── Setters ──────────────────────────────────────────────────────────────

	setAppliedProfile(entries: AppliedCosmeticEntry[]): void {
		const map = new Map<string, AppliedCosmeticEntry>();
		for (const entry of entries) {
			map.set(entry.slot, entry);
		}
		this.appliedProfile = map;
	}

	setAppliedGuild(guildId: string, entries: Array<AppliedCosmeticEntry & {applied_by: string}>): void {
		const map = new Map<string, AppliedCosmeticEntry & {applied_by: string}>();
		for (const entry of entries) {
			map.set(entry.slot, entry);
		}
		this.appliedGuild.set(guildId, map);
	}

	// ─── Creator program ──────────────────────────────────────────────────────

	async loadCreatorStatus(): Promise<void> {
		if (this.isLoadingCreatorStatus) return;
		this.isLoadingCreatorStatus = true;
		try {
			this.creatorStatus = await fetchCreatorStatus();
		} catch {
			this.creatorStatus = null;
		} finally {
			this.isLoadingCreatorStatus = false;
		}
	}

	async applyAsCreator(): Promise<void> {
		await applyAsCreator();
		await this.loadCreatorStatus();
	}

	async createListing(data: CreateListingRequest): Promise<CreatorListingEntry> {
		const listing = await createListing(data);
		await this.loadCreatorStatus();
		return listing;
	}

	async updateListing(id: string, patch: UpdateListingRequest): Promise<CreatorListingEntry> {
		const listing = await updateListing(id, patch);
		await this.loadCreatorStatus();
		return listing;
	}

	async submitListing(id: string): Promise<CreatorListingEntry> {
		const listing = await submitListing(id);
		await this.loadCreatorStatus();
		return listing;
	}

	async deleteListing(id: string): Promise<void> {
		await deleteListing(id);
		await this.loadCreatorStatus();
	}

	clearAll(): void {
		this.ownedNfts = [];
		this.storeItems = [];
		this.appliedProfile = new Map();
		this.appliedGuild = new Map();
		this.appliedUsers = new Map();
		this.creatorStatus = null;
	}

	// ─── Computed helpers ─────────────────────────────────────────────────────

	/** NFTs filtered to a specific cosmetic type (slot name). */
	nftsForSlot(cosmeticType: string): OwnedCosmeticNft[] {
		return this.ownedNfts.filter((nft) => nft.cosmetic_type === cosmeticType);
	}

	/** The mint address currently applied to a profile slot, or null. */
	profileSlotMint(slot: string): string | null {
		return this.appliedProfile.get(slot)?.mint_address ?? null;
	}

	/** The mint address currently applied to a server slot, or null. */
	guildSlotMint(guildId: string, slot: string): string | null {
		return this.appliedGuild.get(guildId)?.get(slot)?.mint_address ?? null;
	}

	/**
	 * The image URL for a cosmetic applied to a profile slot.
	 *
	 * For the current user: resolved from owned NFTs (client-side, always accurate).
	 * For other users: taken from the server response image_url field (null until collection launches).
	 */
	getProfileCosmeticImageUrl(userId: string, slot: string): string | null {
		const currentUserId = AuthenticationStore.currentUserId;

		if (userId === currentUserId) {
			const mint = this.profileSlotMint(slot);
			if (!mint) return null;
			return this.ownedNfts.find((n) => n.mint === mint)?.image ?? null;
		}

		return this.appliedUsers.get(userId)?.get(slot)?.image_url ?? null;
	}

	/** Image URL for a guild cosmetic slot, or null. */
	getGuildCosmeticImageUrl(guildId: string, slot: string): string | null {
		return this.appliedGuild.get(guildId)?.get(slot)?.image_url ?? null;
	}
}

export default new CosmeticsStore();
