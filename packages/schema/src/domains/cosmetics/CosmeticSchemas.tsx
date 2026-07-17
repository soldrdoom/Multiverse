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

import {z} from 'zod';

// ─── Slot enums ───────────────────────────────────────────────────────────────

export const ProfileCosmeticSlotSchema = z.enum([
	'avatar_frame',
	'profile_banner',
	'profile_effect',
	'badge',
	'name_effect',
]);
export type ProfileCosmeticSlot = z.infer<typeof ProfileCosmeticSlotSchema>;

export const ServerCosmeticSlotSchema = z.enum([
	'chat_background',
	'channel_list_background',
	'server_banner',
]);
export type ServerCosmeticSlot = z.infer<typeof ServerCosmeticSlotSchema>;

// ─── Shared ───────────────────────────────────────────────────────────────────

/** A single applied cosmetic entry returned in list responses. */
export const AppliedCosmeticEntry = z.object({
	slot: z.string(),
	mint_address: z.string(),
	applied_at: z.string().datetime(),
	/**
	 * Preview image URL for the applied NFT cosmetic.
	 * Populated once the Metaplex collection is deployed; null until then.
	 */
	image_url: z.string().url().nullable().optional(),
});
export type AppliedCosmeticEntry = z.infer<typeof AppliedCosmeticEntry>;

// ─── Profile cosmetic endpoints ───────────────────────────────────────────────

/**
 * GET /users/@me/cosmetics
 * Returns all applied profile cosmetic slots for the current user.
 */
export const UserCosmeticsResponse = z.object({
	applied: z.array(AppliedCosmeticEntry),
});
export type UserCosmeticsResponse = z.infer<typeof UserCosmeticsResponse>;

/**
 * PUT /users/@me/cosmetics
 * Apply or clear a single profile cosmetic slot.
 * Set mint_address to null to clear the slot.
 */
export const ApplyProfileCosmeticRequest = z.object({
	slot: ProfileCosmeticSlotSchema,
	/** Mint address of the NFT to apply. null clears the slot. */
	mint_address: z
		.string()
		.min(32)
		.max(64)
		.nullable(),
});
export type ApplyProfileCosmeticRequest = z.infer<typeof ApplyProfileCosmeticRequest>;

export const ApplyProfileCosmeticResponse = z.object({
	ok: z.boolean(),
	applied: z.array(AppliedCosmeticEntry),
});
export type ApplyProfileCosmeticResponse = z.infer<typeof ApplyProfileCosmeticResponse>;

// ─── Server cosmetic endpoints ────────────────────────────────────────────────

/**
 * GET /guilds/:guildId/cosmetics
 * Returns all applied server cosmetic slots (public — visible to all members).
 */
export const GuildCosmeticsResponse = z.object({
	applied: z.array(
		AppliedCosmeticEntry.extend({
			/** User ID of the server owner who applied the cosmetic. */
			applied_by: z.string(),
		}),
	),
});
export type GuildCosmeticsResponse = z.infer<typeof GuildCosmeticsResponse>;

/**
 * PUT /guilds/:guildId/cosmetics
 * Apply or clear a single server cosmetic slot. Server owner only.
 * Set mint_address to null to clear the slot.
 */
export const ApplyServerCosmeticRequest = z.object({
	slot: ServerCosmeticSlotSchema,
	/** Mint address of the NFT to apply. null clears the slot. */
	mint_address: z
		.string()
		.min(32)
		.max(64)
		.nullable(),
});
export type ApplyServerCosmeticRequest = z.infer<typeof ApplyServerCosmeticRequest>;

export const ApplyServerCosmeticResponse = z.object({
	ok: z.boolean(),
	applied: z.array(
		AppliedCosmeticEntry.extend({
			applied_by: z.string(),
		}),
	),
});
export type ApplyServerCosmeticResponse = z.infer<typeof ApplyServerCosmeticResponse>;

/**
 * GET /users/:userId/cosmetics
 * Public read of any user's applied profile cosmetics (login required).
 * Same shape as UserCosmeticsResponse.
 */
export const UserCosmeticsPublicResponse = z.object({
	applied: z.array(AppliedCosmeticEntry),
});
export type UserCosmeticsPublicResponse = z.infer<typeof UserCosmeticsPublicResponse>;

// ─── Purchase ────────────────────────────────────────────────────────────────

/**
 * POST /cosmetics/purchase
 * Initiate a cosmetic purchase.  The client first sends a SOL payment on-chain
 * and then posts the confirmed transaction signature here.  The server verifies
 * the transaction, mints the NFT to the buyer's wallet, and returns the new NFT.
 */
export const PurchaseCosmeticRequest = z.object({
	/** Catalog item ID from GET /cosmetics/store. */
	item_id: z.string().min(1),
	/** Confirmed Solana transaction signature for the SOL payment. */
	tx_signature: z.string().min(1),
	/** Buyer's Solana wallet address (Base58). */
	buyer_address: z.string().min(32).max(64),
});
export type PurchaseCosmeticRequest = z.infer<typeof PurchaseCosmeticRequest>;

export const PurchaseCosmeticResponse = z.object({
	ok: z.boolean(),
	/** The newly minted NFT. */
	nft: z.object({
		mint: z.string(),
		name: z.string(),
		image: z.string().nullable(),
		cosmetic_type: z.string(),
		rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
	}),
});
export type PurchaseCosmeticResponse = z.infer<typeof PurchaseCosmeticResponse>;

// ─── NFT listing ──────────────────────────────────────────────────────────────

/** A single cosmetic NFT held in the user's wallet. */
export const OwnedCosmeticNft = z.object({
	/** Solana mint address. */
	mint: z.string(),
	/** Human-readable name from NFT metadata. */
	name: z.string(),
	/** Off-chain metadata URI (image/preview URL). */
	image: z.string().nullable(),
	/** Cosmetic type — matches a slot name. */
	cosmetic_type: z.string(),
	/** Rarity tier. */
	rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
});
export type OwnedCosmeticNft = z.infer<typeof OwnedCosmeticNft>;

/** GET /nfts — returns all cosmetic NFTs in the current user's wallet. */
export const NftsResponse = z.object({
	nfts: z.array(OwnedCosmeticNft),
});
export type NftsResponse = z.infer<typeof NftsResponse>;

// ─── Shop catalog ─────────────────────────────────────────────────────────────

/** A single item available for purchase in the cosmetics shop. */
export const StoreListingNft = z.object({
	/** Unique catalog ID. */
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	/** Preview image URL. */
	image: z.string().nullable(),
	/** Cosmetic type — matches a profile or server slot name. */
	cosmetic_type: z.string(),
	rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
	/** Price in lamports (SOL × 1 000 000 000). */
	price_lamports: z.number().int(),
	/** Metaplex collection address. null until collection is deployed. */
	collection_address: z.string().nullable(),
});
export type StoreListingNft = z.infer<typeof StoreListingNft>;

/** GET /cosmetics/store — returns the full shop catalog. */
export const CosmeticsStoreResponse = z.object({
	items: z.array(StoreListingNft),
});
export type CosmeticsStoreResponse = z.infer<typeof CosmeticsStoreResponse>;

// ─── Creator program ──────────────────────────────────────────────────────────

export const CreatorApplicationStatus = z.enum(['pending', 'approved', 'rejected']);
export type CreatorApplicationStatus = z.infer<typeof CreatorApplicationStatus>;

export const CosmeticListingStatus = z.enum(['draft', 'pending_review', 'live', 'rejected', 'delisted']);
export type CosmeticListingStatus = z.infer<typeof CosmeticListingStatus>;

/**
 * POST /creators/apply
 * No body required — wallet is taken from the user's linked Solana account.
 */
export const CreatorApplyResponse = z.object({
	status: CreatorApplicationStatus,
	applied_at: z.string().datetime(),
});
export type CreatorApplyResponse = z.infer<typeof CreatorApplyResponse>;

/** A single creator listing entry (returned in creator dashboard + admin views). */
export const CreatorListingEntry = z.object({
	id: z.string(),
	creator_id: z.number().int(),
	name: z.string(),
	description: z.string().nullable(),
	image_url: z.string().url().nullable(),
	cosmetic_type: z.string(),
	rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
	price_lamports: z.number().int().positive(),
	collection_address: z.string().nullable(),
	status: CosmeticListingStatus,
	created_at: z.string().datetime(),
	updated_at: z.string().datetime(),
});
export type CreatorListingEntry = z.infer<typeof CreatorListingEntry>;

/**
 * GET /creators/@me
 * Returns the current user's creator status, application, and listings.
 */
export const CreatorStatusResponse = z.object({
	/** Whether the user has a Solana wallet linked to their account. */
	wallet_linked: z.boolean(),
	/** Whether this user is an approved creator. */
	is_creator: z.boolean(),
	application: z
		.object({
			status: CreatorApplicationStatus,
			applied_at: z.string().datetime(),
		})
		.nullable(),
	creator: z
		.object({
			creator_id: z.number().int(),
			solana_address: z.string(),
			commission_rate: z.number().int(),
			payout_suspended: z.boolean(),
			approved_at: z.string().datetime(),
		})
		.nullable(),
	listings: z.array(CreatorListingEntry),
});
export type CreatorStatusResponse = z.infer<typeof CreatorStatusResponse>;

/**
 * POST /creators/@me/listings
 * Create a new draft listing.
 */
export const CreateListingRequest = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).nullable().optional(),
	image_url: z.string().url().nullable().optional(),
	cosmetic_type: z.enum([
		'avatar_frame',
		'profile_banner',
		'profile_effect',
		'badge',
		'name_effect',
		'chat_background',
		'channel_list_background',
		'server_banner',
	]),
	rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
	price_lamports: z.number().int().positive(),
});
export type CreateListingRequest = z.infer<typeof CreateListingRequest>;

/**
 * PUT /creators/@me/listings/:id
 * Update a draft listing (only allowed while status is 'draft').
 */
export const UpdateListingRequest = CreateListingRequest.partial();
export type UpdateListingRequest = z.infer<typeof UpdateListingRequest>;

export const ListingResponse = z.object({listing: CreatorListingEntry});
export type ListingResponse = z.infer<typeof ListingResponse>;

// ─── Admin creator schemas ────────────────────────────────────────────────────

export const AdminCreatorApplicationEntry = z.object({
	solana_address: z.string(),
	username: z.string().nullable(),
	status: CreatorApplicationStatus,
	applied_at: z.string().datetime(),
	reviewed_at: z.string().datetime().nullable(),
});
export type AdminCreatorApplicationEntry = z.infer<typeof AdminCreatorApplicationEntry>;

export const AdminCreatorApplicationsResponse = z.object({
	applications: z.array(AdminCreatorApplicationEntry),
});
export type AdminCreatorApplicationsResponse = z.infer<typeof AdminCreatorApplicationsResponse>;

export const AdminCreatorEntry = z.object({
	creator_id: z.number().int(),
	solana_address: z.string(),
	commission_rate: z.number().int(),
	payout_suspended: z.boolean(),
	approved_at: z.string().datetime(),
});
export type AdminCreatorEntry = z.infer<typeof AdminCreatorEntry>;

export const AdminCreatorsResponse = z.object({
	creators: z.array(AdminCreatorEntry),
});
export type AdminCreatorsResponse = z.infer<typeof AdminCreatorsResponse>;

export const AdminUpdateCreatorRequest = z.object({
	solana_address: z.string().min(32).max(64).optional(),
	commission_rate: z.number().int().min(0).max(100).optional(),
	payout_suspended: z.boolean().optional(),
});
export type AdminUpdateCreatorRequest = z.infer<typeof AdminUpdateCreatorRequest>;

export const AdminListingsResponse = z.object({
	listings: z.array(CreatorListingEntry),
});
export type AdminListingsResponse = z.infer<typeof AdminListingsResponse>;
