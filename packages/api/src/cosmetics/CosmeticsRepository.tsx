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

import type {GuildID, UserID} from '@fluxer/api/src/BrandedTypes';
import {
	Db,
	deleteOneOrMany,
	executeVersionedUpdate,
	fetchMany,
	fetchOne,
	nextVersion,
	upsertOne,
} from '@fluxer/api/src/database/Cassandra';
import type {
	AppliedProfileCosmeticRow,
	AppliedServerCosmeticRow,
	CosmeticListingRow,
	CosmeticListingStatus,
	CreatorApplicationRow,
	CreatorApplicationStatus,
	CreatorByWalletRow,
	CreatorRow,
	ProfileCosmeticSlot,
	ServerCosmeticSlot,
} from '@fluxer/api/src/database/types/CosmeticTypes';
import type {UserBySolanaAddressRow, UserRow} from '@fluxer/api/src/database/types/UserTypes';
import {
	AppliedProfileCosmetics,
	AppliedServerCosmetics,
	CosmeticListings,
	CosmeticListingsByCreator,
	CreatorApplications,
	Creators,
	CreatorsByWallet,
	UserBySolanaAddress,
	Users,
} from '@fluxer/api/src/Tables';

// ─── Profile cosmetic queries ─────────────────────────────────────────────────

const FETCH_PROFILE_COSMETICS_CQL = AppliedProfileCosmetics.selectCql({
	where: AppliedProfileCosmetics.where.eq('user_id'),
});

// ─── Server cosmetic queries ──────────────────────────────────────────────────

const FETCH_SERVER_COSMETICS_CQL = AppliedServerCosmetics.selectCql({
	where: AppliedServerCosmetics.where.eq('guild_id'),
});

// ─── Creator application queries ──────────────────────────────────────────────

const FETCH_CREATOR_APPLICATION_CQL = CreatorApplications.selectCql({
	where: CreatorApplications.where.eq('solana_address'),
});

const FETCH_ALL_CREATOR_APPLICATIONS_CQL = CreatorApplications.selectCql({});

const FETCH_USER_ID_BY_SOLANA_ADDRESS_CQL = UserBySolanaAddress.selectCql({
	columns: ['user_id'],
	where: UserBySolanaAddress.where.eq('solana_address'),
});

const FETCH_USERNAME_BY_USER_ID_CQL = Users.selectCql({
	columns: ['username'],
	where: Users.where.eq('user_id'),
});

// ─── Creator queries ──────────────────────────────────────────────────────────

const FETCH_CREATOR_BY_ID_CQL = Creators.selectCql({
	where: Creators.where.eq('creator_id'),
});

const FETCH_ALL_CREATORS_CQL = Creators.selectCql({});

const FETCH_CREATOR_BY_WALLET_CQL = CreatorsByWallet.selectCql({
	where: CreatorsByWallet.where.eq('solana_address'),
});

// ─── Cosmetic listing queries ─────────────────────────────────────────────────

const FETCH_LISTING_BY_ID_CQL = CosmeticListings.selectCql({
	where: CosmeticListings.where.eq('id'),
});

const FETCH_LISTINGS_BY_CREATOR_INDEX_CQL = CosmeticListingsByCreator.selectCql({
	where: CosmeticListingsByCreator.where.eq('creator_id'),
});

const FETCH_ALL_LISTINGS_CQL = CosmeticListings.selectCql({});

// ─── Mint setup ───────────────────────────────────────────────────────────────

/**
 * Sentinel value prefix for `CosmeticListingRow.collection_address` while lazy on-chain mint setup
 * (Collection + optional Candy Machine + metadata upload) is in progress. See
 * `claimListingMintSetup` and `@fluxer/api/src/cosmetics/CosmeticsMintService`'s
 * `ensureListingMintSetup`.
 *
 * The actual stored value is `` `${PENDING_MINT_SETUP_SENTINEL_PREFIX}${Date.now()}` ``, e.g.
 * `pending:1754765432100` — not the bare literal `'pending'`. Encoding the claim timestamp makes
 * the sentinel self-expiring: if the process that claimed setup crashes before reverting it back
 * to `null` (OOM-kill, restart, unhandled exception — the normal `catch` block in
 * `ensureListingMintSetup` never runs), the listing would otherwise be stuck unclaimable forever,
 * since `claimListingMintSetup` only used to succeed while `collection_address === null`. See
 * `isClaimableForSetup`/`isStalePendingSentinel` below for the recovery logic.
 */
export const PENDING_MINT_SETUP_SENTINEL_PREFIX = 'pending:';

/** How long a claim may sit in-progress before another request is allowed to reclaim it. Real setup
 * involves at most a couple of confirmed on-chain transactions plus propagation polling, which
 * should never legitimately take anywhere close to this long. */
const PENDING_MINT_SETUP_STALE_MS = 5 * 60 * 1000;

function makePendingMintSetupSentinel(): string {
	return `${PENDING_MINT_SETUP_SENTINEL_PREFIX}${Date.now()}`;
}

/**
 * True for any current or past pending-setup sentinel value (`'pending:<timestamp>'`), regardless
 * of staleness — this is the check every non-claiming caller (pollers, client-facing sanitizers)
 * should use to distinguish "setup in progress" from a real address or `null`.
 */
export function isPendingMintSetupSentinel(collectionAddress: string | null): boolean {
	return collectionAddress?.startsWith(PENDING_MINT_SETUP_SENTINEL_PREFIX) ?? false;
}

/**
 * True if `collectionAddress` is a pending-setup sentinel whose embedded claim timestamp is older
 * than `PENDING_MINT_SETUP_STALE_MS` (or is malformed/unparseable) — i.e. old enough that the
 * claiming request almost certainly crashed rather than still being in flight.
 */
function isStalePendingSentinel(collectionAddress: string): boolean {
	const raw = collectionAddress.slice(PENDING_MINT_SETUP_SENTINEL_PREFIX.length);
	const claimedAt = Number(raw);
	if (!Number.isFinite(claimedAt)) return true;
	return Date.now() - claimedAt > PENDING_MINT_SETUP_STALE_MS;
}

/** Whether `claimListingMintSetup` may claim setup given the listing's current `collection_address`:
 * either no setup has ever been attempted (`null`), or a prior claim is stale enough to have almost
 * certainly crashed rather than still being in progress. A real address, or a fresh (non-stale)
 * pending claim, is not claimable. */
function isClaimableForSetup(collectionAddress: string | null): boolean {
	if (collectionAddress === null) return true;
	return isPendingMintSetupSentinel(collectionAddress) && isStalePendingSentinel(collectionAddress);
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown by `updateListing` when the patch would shrink `max_supply` below the listing's
 * current `minted_count`. `updateListing` is only reachable while a listing is `draft`
 * (enforced by the controller), where `minted_count` is normally 0 — this guard exists for
 * correctness regardless, not because the draft path is expected to hit it in practice.
 */
export class ListingMaxSupplyBelowMintedError extends Error {
	constructor(
		public readonly mintedCount: number,
		public readonly requestedMaxSupply: number,
	) {
		super(
			`max_supply (${requestedMaxSupply}) cannot be lower than the listing's current minted_count (${mintedCount})`,
		);
		this.name = 'ListingMaxSupplyBelowMintedError';
	}
}

/**
 * Internal sentinel thrown from `reserveMintSlot`'s `buildPatch` when a retry (triggered by a
 * concurrent version conflict) discovers the listing has since sold out. Lets us bail out of
 * `executeVersionedUpdate`'s retry loop instead of spinning against a now-permanently-failing
 * condition — see the comment in `reserveMintSlot`.
 */
class MintSlotSoldOutSignal extends Error {}

/**
 * Internal sentinel thrown from `claimListingMintSetup`'s `buildPatch` when a retry (triggered by
 * a concurrent version conflict) discovers another request already claimed or finished setup for
 * this listing. Mirrors `MintSlotSoldOutSignal`'s role in `reserveMintSlot` — lets us bail out of
 * `executeVersionedUpdate`'s retry loop instead of spinning against a now-permanently-failing
 * condition.
 */
class ListingSetupClaimFailedSignal extends Error {}

// ─── Repository ───────────────────────────────────────────────────────────────

export class CosmeticsRepository {
	// ── Profile ──────────────────────────────────────────────────────────────

	async getProfileCosmetics(userId: UserID): Promise<AppliedProfileCosmeticRow[]> {
		return fetchMany<AppliedProfileCosmeticRow>(FETCH_PROFILE_COSMETICS_CQL, {user_id: userId});
	}

	async applyProfileCosmetic(userId: UserID, slot: ProfileCosmeticSlot, mintAddress: string): Promise<void> {
		const row: AppliedProfileCosmeticRow = {
			user_id: userId,
			slot,
			mint_address: mintAddress,
			applied_at: new Date(),
		};
		await upsertOne(AppliedProfileCosmetics.upsertAll(row));
	}

	async clearProfileCosmetic(userId: UserID, slot: ProfileCosmeticSlot): Promise<void> {
		await deleteOneOrMany(
			AppliedProfileCosmetics.deleteCql({
				where: [AppliedProfileCosmetics.where.eq('user_id'), AppliedProfileCosmetics.where.eq('slot')],
			}),
			{user_id: userId, slot},
		);
	}

	// ── Server ────────────────────────────────────────────────────────────────

	async getServerCosmetics(guildId: GuildID): Promise<AppliedServerCosmeticRow[]> {
		return fetchMany<AppliedServerCosmeticRow>(FETCH_SERVER_COSMETICS_CQL, {guild_id: guildId});
	}

	async applyServerCosmetic(
		guildId: GuildID,
		slot: ServerCosmeticSlot,
		mintAddress: string,
		appliedBy: UserID,
	): Promise<void> {
		const row: AppliedServerCosmeticRow = {
			guild_id: guildId,
			slot,
			mint_address: mintAddress,
			applied_by: appliedBy,
			applied_at: new Date(),
		};
		await upsertOne(AppliedServerCosmetics.upsertAll(row));
	}

	async clearServerCosmetic(guildId: GuildID, slot: ServerCosmeticSlot): Promise<void> {
		await deleteOneOrMany(
			AppliedServerCosmetics.deleteCql({
				where: [AppliedServerCosmetics.where.eq('guild_id'), AppliedServerCosmetics.where.eq('slot')],
			}),
			{guild_id: guildId, slot},
		);
	}

	// ── Creator applications ──────────────────────────────────────────────────

	async getApplication(solanaAddress: string): Promise<CreatorApplicationRow | null> {
		return fetchOne<CreatorApplicationRow>(FETCH_CREATOR_APPLICATION_CQL, {solana_address: solanaAddress});
	}

	async upsertApplication(solanaAddress: string, status: CreatorApplicationStatus): Promise<void> {
		const existing = await this.getApplication(solanaAddress);
		const row: CreatorApplicationRow = {
			solana_address: solanaAddress,
			status,
			applied_at: existing?.applied_at ?? new Date(),
			reviewed_at: status !== 'pending' ? new Date() : (existing?.reviewed_at ?? null),
			reviewed_by: existing?.reviewed_by ?? null,
		};
		await upsertOne(CreatorApplications.upsertAll(row));
	}

	async reviewApplication(
		solanaAddress: string,
		status: 'approved' | 'rejected',
		reviewedBy: string,
	): Promise<CreatorApplicationRow | null> {
		const existing = await this.getApplication(solanaAddress);
		if (!existing) return null;
		const row: CreatorApplicationRow = {
			...existing,
			status,
			reviewed_at: new Date(),
			reviewed_by: reviewedBy,
		};
		await upsertOne(CreatorApplications.upsertAll(row));
		return row;
	}

	async getAllApplications(): Promise<CreatorApplicationRow[]> {
		return fetchMany<CreatorApplicationRow>(FETCH_ALL_CREATOR_APPLICATIONS_CQL, {});
	}

	async getUsernameBySolanaAddress(solanaAddress: string): Promise<string | null> {
		const idx = await fetchOne<Pick<UserBySolanaAddressRow, 'user_id'>>(FETCH_USER_ID_BY_SOLANA_ADDRESS_CQL, {
			solana_address: solanaAddress,
		});
		if (!idx) return null;
		const user = await fetchOne<Pick<UserRow, 'username'>>(FETCH_USERNAME_BY_USER_ID_CQL, {user_id: idx.user_id});
		return user?.username ?? null;
	}

	// ── Creators ──────────────────────────────────────────────────────────────

	async getCreatorById(creatorId: number): Promise<CreatorRow | null> {
		return fetchOne<CreatorRow>(FETCH_CREATOR_BY_ID_CQL, {creator_id: creatorId});
	}

	async getCreatorByWallet(solanaAddress: string): Promise<CreatorRow | null> {
		const idx = await fetchOne<CreatorByWalletRow>(FETCH_CREATOR_BY_WALLET_CQL, {
			solana_address: solanaAddress,
		});
		if (!idx) return null;
		return this.getCreatorById(idx.creator_id);
	}

	async getAllCreators(): Promise<CreatorRow[]> {
		return fetchMany<CreatorRow>(FETCH_ALL_CREATORS_CQL);
	}

	/**
	 * Create a new creator record. Assigns the next sequential creator_id.
	 * Creator approvals are infrequent (admin-only) so the MAX+1 approach is safe.
	 */
	async createCreator(solanaAddress: string): Promise<CreatorRow> {
		const maxRow = await fetchOne<{max_id: number | null}>(`SELECT MAX(creator_id) as max_id FROM creators`, {});
		const nextId = (maxRow?.max_id ?? 0) + 1;

		const row: CreatorRow = {
			creator_id: nextId,
			solana_address: solanaAddress,
			commission_rate: 90,
			payout_suspended: false,
			approved_at: new Date(),
		};
		await upsertOne(Creators.upsertAll(row));

		// Keep wallet → id index in sync.
		await upsertOne(CreatorsByWallet.upsertAll({solana_address: solanaAddress, creator_id: nextId}));

		return row;
	}

	async updateCreator(
		creatorId: number,
		patch: {solana_address?: string; commission_rate?: number; payout_suspended?: boolean},
	): Promise<CreatorRow | null> {
		const existing = await this.getCreatorById(creatorId);
		if (!existing) return null;

		const updated: CreatorRow = {
			...existing,
			...patch,
		};
		await upsertOne(Creators.upsertAll(updated));

		// If wallet changed, update the lookup index.
		if (patch.solana_address && patch.solana_address !== existing.solana_address) {
			await deleteOneOrMany(
				CreatorsByWallet.deleteCql({
					where: [CreatorsByWallet.where.eq('solana_address')],
				}),
				{solana_address: existing.solana_address},
			);
			await upsertOne(
				CreatorsByWallet.upsertAll({
					solana_address: patch.solana_address,
					creator_id: creatorId,
				}),
			);
		}

		return updated;
	}

	// ── Cosmetic listings ─────────────────────────────────────────────────────

	async getListingById(id: string): Promise<CosmeticListingRow | null> {
		return fetchOne<CosmeticListingRow>(FETCH_LISTING_BY_ID_CQL, {id});
	}

	async getListingsByCreator(creatorId: number): Promise<CosmeticListingRow[]> {
		const index = await fetchMany<{creator_id: number; id: string}>(FETCH_LISTINGS_BY_CREATOR_INDEX_CQL, {
			creator_id: creatorId,
		});
		if (index.length === 0) return [];
		return Promise.all(index.map((r) => this.getListingById(r.id))).then((rows) =>
			rows.filter((r): r is CosmeticListingRow => r !== null),
		);
	}

	async getAllListings(): Promise<CosmeticListingRow[]> {
		return fetchMany<CosmeticListingRow>(FETCH_ALL_LISTINGS_CQL, {});
	}

	async getLiveListings(): Promise<CosmeticListingRow[]> {
		const all = await this.getAllListings();
		return all.filter((l) => l.status === 'live');
	}

	async createListing(
		creatorId: number,
		data: {
			name: string;
			description: string | null;
			image_url: string | null;
			cosmetic_type: string;
			rarity: CosmeticListingRow['rarity'];
			price_lamports: number;
			/** Creator-chosen mint ceiling. null (or omitted) means unlimited. */
			max_supply?: number | null;
		},
	): Promise<CosmeticListingRow> {
		const id = crypto.randomUUID();
		const now = new Date();
		const row: CosmeticListingRow = {
			id,
			creator_id: creatorId,
			name: data.name,
			description: data.description ?? null,
			image_url: data.image_url ?? null,
			cosmetic_type: data.cosmetic_type,
			rarity: data.rarity,
			price_lamports: data.price_lamports,
			collection_address: null,
			candy_machine_address: null,
			metadata_uri: null,
			status: 'draft',
			max_supply: data.max_supply ?? null,
			minted_count: 0,
			version: nextVersion(null),
			created_at: now,
			updated_at: now,
		};
		await upsertOne(CosmeticListings.upsertAll(row));
		await upsertOne(CosmeticListingsByCreator.upsertAll({creator_id: creatorId, id}));
		return row;
	}

	/**
	 * Updates a draft listing's editable fields. Throws `ListingMaxSupplyBelowMintedError` if the
	 * patch would shrink `max_supply` below the listing's current `minted_count` — the controller
	 * turns that into a 400. This is a plain (non-versioned) read-modify-write like the rest of
	 * this repository's listing writes; it's only ever reachable while `status === 'draft'`
	 * (enforced by the controller), which is also the only state `reserveMintSlot` can't be
	 * racing against, since purchases only reserve slots on `'live'` listings.
	 */
	async updateListing(
		id: string,
		patch: Partial<
			Pick<
				CosmeticListingRow,
				'name' | 'description' | 'image_url' | 'cosmetic_type' | 'rarity' | 'price_lamports' | 'max_supply'
			>
		>,
	): Promise<CosmeticListingRow | null> {
		const existing = await this.getListingById(id);
		if (!existing) return null;
		if (patch.max_supply !== undefined && patch.max_supply !== null && patch.max_supply < existing.minted_count) {
			throw new ListingMaxSupplyBelowMintedError(existing.minted_count, patch.max_supply);
		}
		const updated: CosmeticListingRow = {
			...existing,
			...patch,
			updated_at: new Date(),
		};
		await upsertOne(CosmeticListings.upsertAll(updated));
		return updated;
	}

	async setListingStatus(id: string, status: CosmeticListingStatus): Promise<CosmeticListingRow | null> {
		const existing = await this.getListingById(id);
		if (!existing) return null;
		const updated: CosmeticListingRow = {...existing, status, updated_at: new Date()};
		await upsertOne(CosmeticListings.upsertAll(updated));
		return updated;
	}

	/**
	 * Atomically reserves one mint slot against a listing's `max_supply`, incrementing
	 * `minted_count` by exactly 1 via an optimistic-concurrency (LWT) update — this is the actual
	 * correctness boundary for supply enforcement (the read check in the invoice route is just an
	 * early UX gate). If the listing has no cap (`max_supply === null`) or still has room, the
	 * slot is reserved and `applied: true` is returned. If the cap is already reached, no LWT
	 * write is attempted at all and `applied: false` is returned immediately — retrying a
	 * permanently-failing condition would just waste round-trips. A concurrent reservation
	 * discovered mid-retry (i.e. two buyers racing the last slot) is handled the same way: the
	 * retry's `buildPatch` re-checks the guard against freshly-fetched data and bails via
	 * `MintSlotSoldOutSignal` rather than looping until `executeVersionedUpdate`'s retry budget is
	 * exhausted.
	 */
	async reserveMintSlot(listingId: string): Promise<{applied: boolean; listing: CosmeticListingRow | null}> {
		const current = await this.getListingById(listingId);
		if (!current) return {applied: false, listing: null};
		if (current.max_supply !== null && current.minted_count >= current.max_supply) {
			return {applied: false, listing: current};
		}

		try {
			await executeVersionedUpdate<CosmeticListingRow, 'id'>(
				async () => this.getListingById(listingId),
				(row) => {
					if (!row) throw new MintSlotSoldOutSignal('Listing no longer exists');
					if (row.max_supply !== null && row.minted_count >= row.max_supply) {
						throw new MintSlotSoldOutSignal('Listing sold out');
					}
					return {
						pk: {id: listingId},
						patch: {minted_count: Db.set(row.minted_count + 1)},
					};
				},
				CosmeticListings,
				{initialData: current},
			);
		} catch (err) {
			if (err instanceof MintSlotSoldOutSignal) {
				const latest = await this.getListingById(listingId);
				return {applied: false, listing: latest};
			}
			throw err;
		}

		const updated = await this.getListingById(listingId);
		return {applied: true, listing: updated};
	}

	/**
	 * Atomically claims the right to perform this listing's lazy on-chain mint setup (Collection
	 * creation, optional Candy Machine creation, metadata upload), via an LWT patch of
	 * `collection_address` that only succeeds while it's still `null` OR already holds a stale
	 * (older than `PENDING_MINT_SETUP_STALE_MS`) pending-setup sentinel — see
	 * `isClaimableForSetup`. The latter recovers a listing whose previous claimant crashed between
	 * claiming and reverting, which would otherwise leave it stuck unclaimable forever. Exactly one
	 * caller across any number of concurrent requests will see `applied: true` — that caller must
	 * perform setup and eventually write the real `collection_address` (or revert it back to `null`
	 * on failure, see `ensureListingMintSetup`). Everyone else sees `applied: false` and should poll
	 * `getListingById` until `collection_address` stops being a pending-setup sentinel (see
	 * `isPendingMintSetupSentinel`).
	 *
	 * Mirrors `reserveMintSlot`'s exact shape: a plain read short-circuits the not-currently-
	 * claimable case without attempting an LWT at all, and a concurrent claim discovered mid-retry
	 * bails via `ListingSetupClaimFailedSignal` rather than looping until the retry budget is
	 * exhausted.
	 */
	async claimListingMintSetup(listingId: string): Promise<{applied: boolean; listing: CosmeticListingRow | null}> {
		const current = await this.getListingById(listingId);
		if (!current) return {applied: false, listing: null};
		if (!isClaimableForSetup(current.collection_address)) {
			return {applied: false, listing: current};
		}

		try {
			await executeVersionedUpdate<CosmeticListingRow, 'id'>(
				async () => this.getListingById(listingId),
				(row) => {
					if (!row) throw new ListingSetupClaimFailedSignal('Listing no longer exists');
					if (!isClaimableForSetup(row.collection_address)) {
						throw new ListingSetupClaimFailedSignal('Setup already claimed or completed');
					}
					return {
						pk: {id: listingId},
						patch: {collection_address: Db.set(makePendingMintSetupSentinel())},
					};
				},
				CosmeticListings,
				{initialData: current},
			);
		} catch (err) {
			if (err instanceof ListingSetupClaimFailedSignal) {
				const latest = await this.getListingById(listingId);
				return {applied: false, listing: latest};
			}
			throw err;
		}

		const updated = await this.getListingById(listingId);
		return {applied: true, listing: updated};
	}

	/**
	 * Plain (non-versioned) patch of the mint-setup fields, used only by whichever caller holds
	 * the exclusive claim from `claimListingMintSetup` — no further CAS is needed since that claim
	 * already provides mutual exclusion for this listing's setup. Also used to revert
	 * `collection_address` back to `null` on setup failure so a future attempt can reclaim it.
	 */
	async patchListingMintFields(
		id: string,
		patch: Partial<Pick<CosmeticListingRow, 'candy_machine_address' | 'metadata_uri' | 'collection_address'>>,
	): Promise<CosmeticListingRow | null> {
		const existing = await this.getListingById(id);
		if (!existing) return null;
		const updated: CosmeticListingRow = {...existing, ...patch, updated_at: new Date()};
		await upsertOne(CosmeticListings.upsertAll(updated));
		return updated;
	}

	/**
	 * Best-effort cache reconciliation after an on-chain Candy Machine mint is rejected as
	 * sold-out despite `reserveMintSlot`'s pre-check believing there was room — clamps
	 * `minted_count` up to `max_supply` so the shop's cached supply display stops claiming
	 * availability the Candy Machine will never actually grant. Not itself the correctness
	 * boundary (the Candy Machine account is), just keeps the read-path cache honest.
	 */
	async clampMintedCountToMaxSupply(listingId: string): Promise<void> {
		const listing = await this.getListingById(listingId);
		if (!listing || listing.max_supply === null) return;
		if (listing.minted_count < listing.max_supply) {
			await upsertOne(
				CosmeticListings.upsertAll({...listing, minted_count: listing.max_supply, updated_at: new Date()}),
			);
		}
	}

	async deleteListing(id: string, creatorId: number): Promise<void> {
		await deleteOneOrMany(
			CosmeticListings.deleteCql({
				where: [CosmeticListings.where.eq('id')],
			}),
			{id},
		);
		await deleteOneOrMany(
			CosmeticListingsByCreator.deleteCql({
				where: [CosmeticListingsByCreator.where.eq('creator_id'), CosmeticListingsByCreator.where.eq('id')],
			}),
			{creator_id: creatorId, id},
		);
	}
}
