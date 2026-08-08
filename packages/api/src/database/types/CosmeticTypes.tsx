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

// ─── Slot type strings ───────────────────────────────────────────────────────

/** Slots available on a user's profile. */
export type ProfileCosmeticSlot = 'avatar_frame' | 'profile_banner' | 'profile_effect' | 'badge' | 'name_effect';

/** Slots available on a server (launch set). */
export type ServerCosmeticSlot = 'chat_background' | 'channel_list_background';

// ─── Row types ────────────────────────────────────────────────────────────────

/**
 * One applied profile cosmetic.
 * Primary key: (user_id, slot) — one cosmetic per slot per user.
 */
export interface AppliedProfileCosmeticRow {
	user_id: UserID;
	/** Which profile slot this cosmetic occupies. */
	slot: ProfileCosmeticSlot;
	/** Solana mint address of the NFT. */
	mint_address: string;
	applied_at: Date;
}

export const APPLIED_PROFILE_COSMETIC_COLUMNS = [
	'user_id',
	'slot',
	'mint_address',
	'applied_at',
] as const satisfies ReadonlyArray<keyof AppliedProfileCosmeticRow>;

/**
 * One applied server cosmetic.
 * Primary key: (guild_id, slot) — one cosmetic per slot per server.
 */
export interface AppliedServerCosmeticRow {
	guild_id: GuildID;
	/** Which server slot this cosmetic occupies. */
	slot: ServerCosmeticSlot;
	/** Solana mint address of the NFT. */
	mint_address: string;
	/** User ID of the server owner who applied the cosmetic. */
	applied_by: UserID;
	applied_at: Date;
}

export const APPLIED_SERVER_COSMETIC_COLUMNS = [
	'guild_id',
	'slot',
	'mint_address',
	'applied_by',
	'applied_at',
] as const satisfies ReadonlyArray<keyof AppliedServerCosmeticRow>;

// ─── Creator program ──────────────────────────────────────────────────────────

export type CreatorApplicationStatus = 'pending' | 'approved' | 'rejected';
export type CosmeticListingStatus = 'draft' | 'pending_review' | 'live' | 'rejected' | 'delisted';
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A creator application submitted by a user.
 * Primary key: solana_address (the wallet that applied).
 * No PII is stored — the wallet address is the sole identity.
 */
export interface CreatorApplicationRow {
	solana_address: string;
	status: CreatorApplicationStatus;
	applied_at: Date;
	reviewed_at: Date | null;
	reviewed_by: string | null;
}

export const CREATOR_APPLICATION_COLUMNS = [
	'solana_address',
	'status',
	'applied_at',
	'reviewed_at',
	'reviewed_by',
] as const satisfies ReadonlyArray<keyof CreatorApplicationRow>;

/**
 * An approved creator.
 * creator_id is a stable numeric identifier that survives wallet rotation.
 * Primary key: creator_id.
 */
export interface CreatorRow {
	creator_id: number;
	/** Current payout wallet — updatable by admin at any time. */
	solana_address: string;
	/** Creator's share of each sale, 0–100. Default 90 (platform takes 10). */
	commission_rate: number;
	/** If true, payouts are frozen (e.g. wallet compromise). */
	payout_suspended: boolean;
	approved_at: Date;
}

export const CREATOR_COLUMNS = [
	'creator_id',
	'solana_address',
	'commission_rate',
	'payout_suspended',
	'approved_at',
] as const satisfies ReadonlyArray<keyof CreatorRow>;

/** Lookup index: solana_address → creator_id, for wallet-based lookups. */
export interface CreatorByWalletRow {
	solana_address: string;
	creator_id: number;
}

export const CREATOR_BY_WALLET_COLUMNS = [
	'solana_address',
	'creator_id',
] as const satisfies ReadonlyArray<keyof CreatorByWalletRow>;

/**
 * A cosmetic item listing created by a creator.
 * Primary key: id (UUID).
 */
export interface CosmeticListingRow {
	id: string;
	creator_id: number;
	name: string;
	description: string | null;
	image_url: string | null;
	cosmetic_type: string;
	rarity: CosmeticRarity;
	price_lamports: number;
	/** Set when the Metaplex collection is deployed; null until then. */
	collection_address: string | null;
	status: CosmeticListingStatus;
	created_at: Date;
	updated_at: Date;
}

export const COSMETIC_LISTING_COLUMNS = [
	'id',
	'creator_id',
	'name',
	'description',
	'image_url',
	'cosmetic_type',
	'rarity',
	'price_lamports',
	'collection_address',
	'status',
	'created_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof CosmeticListingRow>;

/** Lookup index: creator_id → listing ids, for creator dashboard queries. */
export interface CosmeticListingByCreatorRow {
	creator_id: number;
	id: string;
}

export const COSMETIC_LISTING_BY_CREATOR_COLUMNS = [
	'creator_id',
	'id',
] as const satisfies ReadonlyArray<keyof CosmeticListingByCreatorRow>;
