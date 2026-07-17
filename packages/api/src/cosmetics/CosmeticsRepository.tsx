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
import {deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
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
		await deleteOneOrMany(AppliedProfileCosmetics.deleteCql({
			where: [
				AppliedProfileCosmetics.where.eq('user_id'),
				AppliedProfileCosmetics.where.eq('slot'),
			],
		}), {user_id: userId, slot});
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
		await deleteOneOrMany(AppliedServerCosmetics.deleteCql({
			where: [
				AppliedServerCosmetics.where.eq('guild_id'),
				AppliedServerCosmetics.where.eq('slot'),
			],
		}), {guild_id: guildId, slot});
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
		const idx = await fetchOne<Pick<UserBySolanaAddressRow, 'user_id'>>(
			FETCH_USER_ID_BY_SOLANA_ADDRESS_CQL,
			{solana_address: solanaAddress},
		);
		if (!idx) return null;
		const user = await fetchOne<Pick<UserRow, 'username'>>(
			FETCH_USERNAME_BY_USER_ID_CQL,
			{user_id: idx.user_id},
		);
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
		const maxRow = await fetchOne<{max_id: number | null}>(
			`SELECT MAX(creator_id) as max_id FROM creators`,
			{},
		);
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
			await deleteOneOrMany(CreatorsByWallet.deleteCql({
				where: [CreatorsByWallet.where.eq('solana_address')],
			}), {solana_address: existing.solana_address});
			await upsertOne(CreatorsByWallet.upsertAll({
				solana_address: patch.solana_address,
				creator_id: creatorId,
			}));
		}

		return updated;
	}

	// ── Cosmetic listings ─────────────────────────────────────────────────────

	async getListingById(id: string): Promise<CosmeticListingRow | null> {
		return fetchOne<CosmeticListingRow>(FETCH_LISTING_BY_ID_CQL, {id});
	}

	async getListingsByCreator(creatorId: number): Promise<CosmeticListingRow[]> {
		const index = await fetchMany<{creator_id: number; id: string}>(
			FETCH_LISTINGS_BY_CREATOR_INDEX_CQL,
			{creator_id: creatorId},
		);
		if (index.length === 0) return [];
		return Promise.all(index.map((r) => this.getListingById(r.id))).then(
			(rows) => rows.filter((r): r is CosmeticListingRow => r !== null),
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
			status: 'draft',
			created_at: now,
			updated_at: now,
		};
		await upsertOne(CosmeticListings.upsertAll(row));
		await upsertOne(CosmeticListingsByCreator.upsertAll({creator_id: creatorId, id}));
		return row;
	}

	async updateListing(
		id: string,
		patch: Partial<Pick<CosmeticListingRow, 'name' | 'description' | 'image_url' | 'cosmetic_type' | 'rarity' | 'price_lamports'>>,
	): Promise<CosmeticListingRow | null> {
		const existing = await this.getListingById(id);
		if (!existing) return null;
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

	async deleteListing(id: string, creatorId: number): Promise<void> {
		await deleteOneOrMany(CosmeticListings.deleteCql({
			where: [CosmeticListings.where.eq('id')],
		}), {id});
		await deleteOneOrMany(CosmeticListingsByCreator.deleteCql({
			where: [
				CosmeticListingsByCreator.where.eq('creator_id'),
				CosmeticListingsByCreator.where.eq('id'),
			],
		}), {creator_id: creatorId, id});
	}
}
