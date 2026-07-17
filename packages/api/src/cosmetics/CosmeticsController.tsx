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

import crypto from 'node:crypto';
import {createGuildID, createUserID} from '@fluxer/api/src/BrandedTypes';
import {Config} from '@fluxer/api/src/Config';
import {CosmeticsRepository} from '@fluxer/api/src/cosmetics/CosmeticsRepository';
import {DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {requireAdminACL} from '@fluxer/api/src/middleware/AdminMiddleware';
import {CosmeticsRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/CosmeticsRateLimitConfig';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {
	ApplyProfileCosmeticRequest,
	ApplyProfileCosmeticResponse,
	ApplyServerCosmeticRequest,
	ApplyServerCosmeticResponse,
	AdminCreatorApplicationsResponse,
	AdminCreatorsResponse,
	AdminListingsResponse,
	AdminUpdateCreatorRequest,
	CreateListingRequest,
	CreatorApplyResponse,
	CreatorListingEntry,
	CreatorStatusResponse,
	CosmeticsStoreResponse,
	GuildCosmeticsResponse,
	ListingResponse,
	NftsResponse,
	PurchaseCosmeticRequest,
	PurchaseCosmeticResponse,
	type StoreListingNft,
	UpdateListingRequest,
	UserCosmeticsPublicResponse,
	UserCosmeticsResponse,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {z} from 'zod';

const cosmeticsRepo = new CosmeticsRepository();

// ─── Seed catalog ─────────────────────────────────────────────────────────────
// Placeholder items shown in the shop before the Metaplex collection is live.
// Replace with a DB/IPFS-backed catalog once collection addresses are known.
// Prices are in lamports (1 SOL = 1_000_000_000).

const SEED_CATALOG: StoreListingNft[] = [
	// ── Profile cosmetics ──────────────────────────────────────────────────
	{
		id: 'seed-avatar-frame-legendary-01',
		name: 'Void Crown Frame',
		description: 'A pulsing obsidian crown wraps your avatar in dark energy.',
		image: null,
		cosmetic_type: 'avatar_frame',
		rarity: 'legendary',
		price_lamports: 5_000_000_000,
		collection_address: null,
	},
	{
		id: 'seed-avatar-frame-epic-01',
		name: 'Ember Ring Frame',
		description: 'Flickering embers orbit your avatar.',
		image: null,
		cosmetic_type: 'avatar_frame',
		rarity: 'epic',
		price_lamports: 2_000_000_000,
		collection_address: null,
	},
	{
		id: 'seed-avatar-frame-rare-01',
		name: 'Neon Circuit Frame',
		description: 'A glowing circuit-board border in electric blue.',
		image: null,
		cosmetic_type: 'avatar_frame',
		rarity: 'rare',
		price_lamports: 750_000_000,
		collection_address: null,
	},
	{
		id: 'seed-avatar-frame-uncommon-01',
		name: 'Leaf Wreath Frame',
		description: 'A simple wreath of animated leaves.',
		image: null,
		cosmetic_type: 'avatar_frame',
		rarity: 'uncommon',
		price_lamports: 250_000_000,
		collection_address: null,
	},
	{
		id: 'seed-avatar-frame-common-01',
		name: 'Silver Ring Frame',
		description: 'A clean silver ring around your avatar.',
		image: null,
		cosmetic_type: 'avatar_frame',
		rarity: 'common',
		price_lamports: 100_000_000,
		collection_address: null,
	},
	{
		id: 'seed-profile-banner-legendary-01',
		name: 'Aurora Borealis Banner',
		description: 'Dancing northern lights fill your profile.',
		image: null,
		cosmetic_type: 'profile_banner',
		rarity: 'legendary',
		price_lamports: 4_000_000_000,
		collection_address: null,
	},
	{
		id: 'seed-profile-banner-rare-01',
		name: 'Deep Space Banner',
		description: 'A slow-drifting star field.',
		image: null,
		cosmetic_type: 'profile_banner',
		rarity: 'rare',
		price_lamports: 500_000_000,
		collection_address: null,
	},
	{
		id: 'seed-profile-effect-epic-01',
		name: 'Starfall Effect',
		description: 'Tiny stars rain down across your profile card.',
		image: null,
		cosmetic_type: 'profile_effect',
		rarity: 'epic',
		price_lamports: 1_500_000_000,
		collection_address: null,
	},
	{
		id: 'seed-badge-legendary-01',
		name: 'Founder Badge',
		description: 'Exclusive badge for Multiverse early supporters.',
		image: null,
		cosmetic_type: 'badge',
		rarity: 'legendary',
		price_lamports: 10_000_000_000,
		collection_address: null,
	},
	{
		id: 'seed-badge-rare-01',
		name: 'Crystal Badge',
		description: 'A shimmering crystal icon on your profile.',
		image: null,
		cosmetic_type: 'badge',
		rarity: 'rare',
		price_lamports: 600_000_000,
		collection_address: null,
	},
	{
		id: 'seed-name-effect-epic-01',
		name: 'Rainbow Shimmer Name',
		description: 'Your display name shifts through vivid colors.',
		image: null,
		cosmetic_type: 'name_effect',
		rarity: 'epic',
		price_lamports: 1_200_000_000,
		collection_address: null,
	},
	{
		id: 'seed-name-effect-uncommon-01',
		name: 'Glitter Name',
		description: 'Subtle gold glitter drifts over your username.',
		image: null,
		cosmetic_type: 'name_effect',
		rarity: 'uncommon',
		price_lamports: 200_000_000,
		collection_address: null,
	},
	// ── Server cosmetics ───────────────────────────────────────────────────
	{
		id: 'seed-chat-bg-legendary-01',
		name: 'Galaxy Chat Background',
		description: 'A slowly rotating galaxy fills your server\'s chat.',
		image: null,
		cosmetic_type: 'chat_background',
		rarity: 'legendary',
		price_lamports: 6_000_000_000,
		collection_address: null,
	},
	{
		id: 'seed-chat-bg-rare-01',
		name: 'Midnight Grid Chat Background',
		description: 'A dark grid pattern with subtle glow lines.',
		image: null,
		cosmetic_type: 'chat_background',
		rarity: 'rare',
		price_lamports: 800_000_000,
		collection_address: null,
	},
	{
		id: 'seed-channel-list-bg-epic-01',
		name: 'Volcanic Channel List Background',
		description: 'Slow lava flows behind your channel list.',
		image: null,
		cosmetic_type: 'channel_list_background',
		rarity: 'epic',
		price_lamports: 1_800_000_000,
		collection_address: null,
	},
	{
		id: 'seed-channel-list-bg-common-01',
		name: 'Forest Channel List Background',
		description: 'A calm forest scene behind your channels.',
		image: null,
		cosmetic_type: 'channel_list_background',
		rarity: 'common',
		price_lamports: 150_000_000,
		collection_address: null,
	},
	{
		id: 'seed-server-banner-legendary-01',
		name: 'Stormfront Server Banner',
		description: 'Dramatic storm clouds roll across the top of your server.',
		image: null,
		cosmetic_type: 'server_banner',
		rarity: 'legendary',
		price_lamports: 5_500_000_000,
		collection_address: null,
	},
	{
		id: 'seed-server-banner-uncommon-01',
		name: 'Sunset Server Banner',
		description: 'A warm gradient sunset at the top of your server.',
		image: null,
		cosmetic_type: 'server_banner',
		rarity: 'uncommon',
		price_lamports: 300_000_000,
		collection_address: null,
	},
];

export function CosmeticsController(app: HonoApp): void {
	// ─── NFT listing ─────────────────────────────────────────────────────────

	/**
	 * GET /nfts
	 * Returns all cosmetic NFTs held in the authenticated user's Solana wallet.
	 * Ownership is verified server-side against the configured Metaplex collection.
	 * Returns an empty array when no collection is configured (development / pre-launch).
	 */
	app.get(
		'/nfts',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_NFTS),
		OpenAPI({
			operationId: 'list_owned_nfts',
			summary: 'List cosmetic NFTs in the current user\'s wallet',
			responseSchema: NftsResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Returns all Multiverse cosmetic NFTs held in the authenticated user\'s linked Solana wallet. ' +
				'Returns an empty array before the cosmetics collection is launched.',
		}),
		async (_ctx) => {
			// TODO: Look up user's Solana address, query Metaplex DAS API, filter by
			// COSMETICS_COLLECTION_ADDRESS env var, return matching NFTs.
			// For now, returns empty until collection is deployed.
			return _ctx.json<NftsResponse>({nfts: []});
		},
	);

	// ─── Shop catalog ─────────────────────────────────────────────────────────

	/**
	 * GET /cosmetics/store
	 * Returns the public shop catalog.
	 * Returns an empty array until the Metaplex collection is deployed.
	 */
	app.get(
		'/cosmetics/store',
		LoginRequired,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_STORE),
		OpenAPI({
			operationId: 'get_cosmetics_store',
			summary: 'Get the cosmetics shop catalog',
			responseSchema: CosmeticsStoreResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Returns all cosmetic NFTs available for purchase, including platform items and approved creator listings.',
		}),
		async (_ctx) => {
			const liveListings = await cosmeticsRepo.getLiveListings();
			const creatorItems: StoreListingNft[] = liveListings.map((l) => ({
				id: l.id,
				name: l.name,
				description: l.description,
				image: l.image_url,
				cosmetic_type: l.cosmetic_type,
				rarity: l.rarity,
				price_lamports: l.price_lamports,
				collection_address: l.collection_address,
			}));
			return _ctx.json<CosmeticsStoreResponse>({items: [...SEED_CATALOG, ...creatorItems]});
		},
	);

	// ─── Public user cosmetics ───────────────────────────────────────────────

	/**
	 * GET /users/:userId/cosmetics
	 * Returns all applied profile cosmetics for any user (public read).
	 * Used by the client to render other users' cosmetics throughout the app.
	 */
	app.get(
		'/users/:userId/cosmetics',
		LoginRequired,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_USER_COSMETICS_PUBLIC),
		OpenAPI({
			operationId: 'get_user_cosmetics_public',
			summary: 'Get applied profile cosmetics for a user',
			responseSchema: UserCosmeticsPublicResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Returns all applied profile cosmetics for the specified user. ' +
				'Accessible to any authenticated user for rendering purposes.',
		}),
		Validator('param', z.object({userId: z.string().min(1)})),
		async (ctx) => {
			const targetUserId = createUserID(BigInt(ctx.req.valid('param').userId));
			const rows = await cosmeticsRepo.getProfileCosmetics(targetUserId);
			return ctx.json<UserCosmeticsPublicResponse>({
				applied: rows.map((r) => ({
					slot: r.slot,
					mint_address: r.mint_address,
					applied_at: r.applied_at.toISOString(),
					// TODO: populate image_url from Metaplex DAS API when collection is deployed.
					image_url: null,
				})),
			});
		},
	);

	// ─── Purchase ─────────────────────────────────────────────────────────────

	/**
	 * POST /cosmetics/purchase
	 * Verify a SOL payment transaction and mint the purchased NFT to the buyer's wallet.
	 * Requires the Metaplex collection to be deployed; returns 503 until then.
	 */
	app.post(
		'/cosmetics/purchase',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.PURCHASE),
		OpenAPI({
			operationId: 'purchase_cosmetic',
			summary: 'Purchase a cosmetic NFT',
			requestSchema: PurchaseCosmeticRequest,
			responseSchema: PurchaseCosmeticResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Verifies the provided Solana transaction signature as payment for the specified catalog item, ' +
				'then mints the cosmetic NFT to the buyer\'s wallet. ' +
				'Returns 503 before the Multiverse cosmetics collection is launched.',
		}),
		Validator('json', PurchaseCosmeticRequest),
		async (ctx) => {
			// TODO: Implement when Metaplex collection is deployed:
			//   1. Look up item_id in the cosmetics catalog.
			//   2. Verify tx_signature on-chain (correct amount, correct recipient treasury address).
			//   3. Mint NFT via Candy Machine / Metaplex to buyer_address.
			//   4. Return the minted NFT details.
			return ctx.json({error: 'Cosmetics shop not yet launched'}, 503);
		},
	);

	// ─── Profile cosmetics ────────────────────────────────────────────────────

	/**
	 * GET /users/@me/cosmetics
	 * Returns all applied profile cosmetic slots for the current user.
	 */
	app.get(
		'/users/@me/cosmetics',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_COSMETICS),
		OpenAPI({
			operationId: 'get_profile_cosmetics',
			summary: 'Get applied profile cosmetics',
			responseSchema: UserCosmeticsResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const rows = await cosmeticsRepo.getProfileCosmetics(userId);
			return ctx.json<UserCosmeticsResponse>({
				applied: rows.map((r) => ({
					slot: r.slot,
					mint_address: r.mint_address,
					applied_at: r.applied_at.toISOString(),
					image_url: null,
				})),
			});
		},
	);

	/**
	 * PUT /users/@me/cosmetics
	 * Apply or clear a profile cosmetic slot.
	 * mint_address: null clears the slot.
	 */
	app.put(
		'/users/@me/cosmetics',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.APPLY_COSMETIC),
		OpenAPI({
			operationId: 'apply_profile_cosmetic',
			summary: 'Apply or clear a profile cosmetic slot',
			requestSchema: ApplyProfileCosmeticRequest,
			responseSchema: ApplyProfileCosmeticResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Applies the specified NFT to a profile cosmetic slot, or clears the slot when mint_address is null. ' +
				'The caller must own the NFT in their linked Solana wallet.',
		}),
		Validator('json', ApplyProfileCosmeticRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {slot, mint_address} = ctx.req.valid('json');

			if (mint_address === null) {
				await cosmeticsRepo.clearProfileCosmetic(userId, slot);
			} else {
				// TODO: Verify on-chain ownership (user's wallet holds mint_address from
				// COSMETICS_COLLECTION_ADDRESS). Skipped until collection is deployed.
				await cosmeticsRepo.applyProfileCosmetic(userId, slot, mint_address);
			}

			const rows = await cosmeticsRepo.getProfileCosmetics(userId);
			return ctx.json<ApplyProfileCosmeticResponse>({
				ok: true,
				applied: rows.map((r) => ({
					slot: r.slot,
					mint_address: r.mint_address,
					applied_at: r.applied_at.toISOString(),
					image_url: null,
				})),
			});
		},
	);

	// ─── Server cosmetics ─────────────────────────────────────────────────────

	/**
	 * GET /guilds/:guildId/cosmetics
	 * Returns all applied server cosmetic slots for the given guild.
	 * Public — any authenticated user can read (needed for rendering).
	 */
	app.get(
		'/guilds/:guildId/cosmetics',
		LoginRequired,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_COSMETICS),
		OpenAPI({
			operationId: 'get_guild_cosmetics',
			summary: 'Get applied server cosmetics',
			responseSchema: GuildCosmeticsResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
		}),
		Validator('param', z.object({guildId: z.string().min(1)})),
		async (ctx) => {
			const guildId = createGuildID(BigInt(ctx.req.valid('param').guildId));
			const rows = await cosmeticsRepo.getServerCosmetics(guildId);
			return ctx.json<GuildCosmeticsResponse>({
				applied: rows.map((r) => ({
					slot: r.slot,
					mint_address: r.mint_address,
					applied_at: r.applied_at.toISOString(),
					applied_by: String(r.applied_by),
					image_url: null,
				})),
			});
		},
	);

	// ─── Creator program — user-facing ───────────────────────────────────────

	/**
	 * POST /creators/apply
	 * Submit a creator application.
	 * The user must have a linked Solana wallet. No other information is required.
	 */
	app.post(
		'/creators/apply',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_APPLY),
		OpenAPI({
			operationId: 'creator_apply',
			summary: 'Apply to become a cosmetics creator',
			responseSchema: CreatorApplyResponse,
			statusCode: 200,
			tags: ['Creators'],
			description:
				'Submit a creator application. The user must have a linked Solana wallet. ' +
				'No personally identifiable information is collected — the wallet address is the sole identity.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) {
				return ctx.json({error: 'You must link a Solana wallet before applying'}, 400);
			}

			const existing = await cosmeticsRepo.getApplication(solanaAddress);
			if (existing && existing.status === 'approved') {
				return ctx.json({error: 'You are already an approved creator'}, 409);
			}
			if (existing && existing.status === 'pending') {
				return ctx.json<CreatorApplyResponse>({
					status: 'pending',
					applied_at: existing.applied_at.toISOString(),
				});
			}

			await cosmeticsRepo.upsertApplication(solanaAddress, 'pending');
			return ctx.json<CreatorApplyResponse>({
				status: 'pending',
				applied_at: new Date().toISOString(),
			});
		},
	);

	/**
	 * GET /creators/@me
	 * Returns the current user's creator application status, creator record, and listings.
	 */
	app.get(
		'/creators/@me',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_STATUS),
		OpenAPI({
			operationId: 'get_creator_status',
			summary: 'Get current creator status and listings',
			responseSchema: CreatorStatusResponse,
			statusCode: 200,
			tags: ['Creators'],
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;

			if (!solanaAddress) {
				return ctx.json<CreatorStatusResponse>({
					wallet_linked: false,
					is_creator: false,
					application: null,
					creator: null,
					listings: [],
				});
			}

			const [application, creator] = await Promise.all([
				cosmeticsRepo.getApplication(solanaAddress),
				cosmeticsRepo.getCreatorByWallet(solanaAddress),
			]);

			const listings = creator
				? await cosmeticsRepo.getListingsByCreator(creator.creator_id)
				: [];

			const listingEntries: CreatorListingEntry[] = listings.map((l) => ({
				id: l.id,
				creator_id: l.creator_id,
				name: l.name,
				description: l.description,
				image_url: l.image_url,
				cosmetic_type: l.cosmetic_type,
				rarity: l.rarity,
				price_lamports: l.price_lamports,
				collection_address: l.collection_address,
				status: l.status,
				created_at: l.created_at.toISOString(),
				updated_at: l.updated_at.toISOString(),
			}));

			return ctx.json<CreatorStatusResponse>({
				wallet_linked: true,
				is_creator: creator !== null,
				application: application
					? {status: application.status, applied_at: application.applied_at.toISOString()}
					: null,
				creator: creator
					? {
						creator_id: creator.creator_id,
						solana_address: creator.solana_address,
						commission_rate: creator.commission_rate,
						payout_suspended: creator.payout_suspended,
						approved_at: creator.approved_at.toISOString(),
					}
					: null,
				listings: listingEntries,
			});
		},
	);

	/**
	 * POST /creators/@me/listings
	 * Create a new draft listing. Creator only.
	 */
	app.post(
		'/creators/@me/listings',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_LISTING_WRITE),
		OpenAPI({
			operationId: 'create_creator_listing',
			summary: 'Create a new cosmetic listing',
			requestSchema: CreateListingRequest,
			responseSchema: ListingResponse,
			statusCode: 201,
			tags: ['Creators'],
		}),
		Validator('json', CreateListingRequest),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) {
				return ctx.json({error: 'You must link a Solana wallet'}, 400);
			}
			const creator = await cosmeticsRepo.getCreatorByWallet(solanaAddress);
			if (!creator) {
				return ctx.json({error: 'You are not an approved creator'}, 403);
			}
			if (creator.payout_suspended) {
				return ctx.json({error: 'Your creator account is currently suspended'}, 403);
			}

			const data = ctx.req.valid('json');
			const listing = await cosmeticsRepo.createListing(creator.creator_id, {
				name: data.name,
				description: data.description ?? null,
				image_url: data.image_url ?? null,
				cosmetic_type: data.cosmetic_type,
				rarity: data.rarity,
				price_lamports: data.price_lamports,
			});

			const entry: CreatorListingEntry = {
				id: listing.id,
				creator_id: listing.creator_id,
				name: listing.name,
				description: listing.description,
				image_url: listing.image_url,
				cosmetic_type: listing.cosmetic_type,
				rarity: listing.rarity,
				price_lamports: listing.price_lamports,
				collection_address: listing.collection_address,
				status: listing.status,
				created_at: listing.created_at.toISOString(),
				updated_at: listing.updated_at.toISOString(),
			};
			return ctx.json<ListingResponse>({listing: entry}, 201);
		},
	);

	/**
	 * POST /creators/@me/listings/upload-image
	 * Upload an image for a listing. Returns the CDN URL to use as image_url.
	 */
	app.post(
		'/creators/@me/listings/upload-image',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_LISTING_WRITE),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) return ctx.json({error: 'You must link a Solana wallet'}, 400);

			const creator = await cosmeticsRepo.getCreatorByWallet(solanaAddress);
			if (!creator) return ctx.json({error: 'You are not an approved creator'}, 403);
			if (creator.payout_suspended) return ctx.json({error: 'Your creator account is currently suspended'}, 403);

			const body = await ctx.req.parseBody();
			const file = body['image'];
			if (!(file instanceof File)) return ctx.json({error: 'Missing image file'}, 400);

			const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
			const EXT_MAP: Record<string, string> = {
				'image/png': 'png',
				'image/jpeg': 'jpg',
				'image/webp': 'webp',
				'image/gif': 'gif',
			};
			if (!ALLOWED_TYPES.has(file.type)) {
				return ctx.json({error: 'Only PNG, JPG, WebP, and GIF images are allowed'}, 400);
			}

			const MAX_BYTES = 4 * 1024 * 1024;
			if (file.size > MAX_BYTES) return ctx.json({error: 'Image must be under 4 MB'}, 400);

			const buffer = new Uint8Array(await file.arrayBuffer());
			const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12);
			const ext = EXT_MAP[file.type];
			const key = `${creator.creator_id}/${hash}.${ext}`;

			const storageService = ctx.get('storageService');
			await storageService.uploadAvatar({prefix: 'cosmetics', key, body: buffer});

			const url = `${Config.staticCdn}/cosmetics/${key}`;
			return ctx.json({url});
		},
	);

	/**
	 * PUT /creators/@me/listings/:id
	 * Update a draft listing. Only allowed while status is 'draft'.
	 */
	app.put(
		'/creators/@me/listings/:id',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_LISTING_WRITE),
		OpenAPI({
			operationId: 'update_creator_listing',
			summary: 'Update a draft cosmetic listing',
			requestSchema: UpdateListingRequest,
			responseSchema: ListingResponse,
			statusCode: 200,
			tags: ['Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		Validator('json', UpdateListingRequest),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) return ctx.json({error: 'You must link a Solana wallet'}, 400);

			const creator = await cosmeticsRepo.getCreatorByWallet(solanaAddress);
			if (!creator) return ctx.json({error: 'You are not an approved creator'}, 403);

			const {id} = ctx.req.valid('param');
			const listing = await cosmeticsRepo.getListingById(id);
			if (!listing || listing.creator_id !== creator.creator_id) {
				return ctx.json({error: 'Listing not found'}, 404);
			}
			if (listing.status !== 'draft') {
				return ctx.json({error: 'Only draft listings can be edited'}, 409);
			}

			const patch = ctx.req.valid('json');
			const updated = await cosmeticsRepo.updateListing(id, patch);
			if (!updated) return ctx.json({error: 'Listing not found'}, 404);

			return ctx.json<ListingResponse>({
				listing: {
					id: updated.id,
					creator_id: updated.creator_id,
					name: updated.name,
					description: updated.description,
					image_url: updated.image_url,
					cosmetic_type: updated.cosmetic_type,
					rarity: updated.rarity,
					price_lamports: updated.price_lamports,
					collection_address: updated.collection_address,
					status: updated.status,
					created_at: updated.created_at.toISOString(),
					updated_at: updated.updated_at.toISOString(),
				},
			});
		},
	);

	/**
	 * POST /creators/@me/listings/:id/submit
	 * Submit a draft listing for admin review.
	 */
	app.post(
		'/creators/@me/listings/:id/submit',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_LISTING_WRITE),
		OpenAPI({
			operationId: 'submit_creator_listing',
			summary: 'Submit a listing for review',
			responseSchema: ListingResponse,
			statusCode: 200,
			tags: ['Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) return ctx.json({error: 'You must link a Solana wallet'}, 400);

			const creator = await cosmeticsRepo.getCreatorByWallet(solanaAddress);
			if (!creator) return ctx.json({error: 'You are not an approved creator'}, 403);

			const {id} = ctx.req.valid('param');
			const listing = await cosmeticsRepo.getListingById(id);
			if (!listing || listing.creator_id !== creator.creator_id) {
				return ctx.json({error: 'Listing not found'}, 404);
			}
			if (listing.status !== 'draft') {
				return ctx.json({error: 'Only draft listings can be submitted'}, 409);
			}

			const updated = await cosmeticsRepo.setListingStatus(id, 'pending_review');
			if (!updated) return ctx.json({error: 'Listing not found'}, 404);

			return ctx.json<ListingResponse>({
				listing: {
					id: updated.id,
					creator_id: updated.creator_id,
					name: updated.name,
					description: updated.description,
					image_url: updated.image_url,
					cosmetic_type: updated.cosmetic_type,
					rarity: updated.rarity,
					price_lamports: updated.price_lamports,
					collection_address: updated.collection_address,
					status: updated.status,
					created_at: updated.created_at.toISOString(),
					updated_at: updated.updated_at.toISOString(),
				},
			});
		},
	);

	/**
	 * DELETE /creators/@me/listings/:id
	 * Delete a draft listing.
	 */
	app.delete(
		'/creators/@me/listings/:id',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.CREATOR_LISTING_WRITE),
		OpenAPI({
			operationId: 'delete_creator_listing',
			summary: 'Delete a draft cosmetic listing',
			responseSchema: z.object({ok: z.boolean()}),
			statusCode: 200,
			tags: ['Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		async (ctx) => {
			const user = ctx.get('user');
			const solanaAddress: string | null = user.solanaAddress;
			if (!solanaAddress) return ctx.json({error: 'You must link a Solana wallet'}, 400);

			const creator = await cosmeticsRepo.getCreatorByWallet(solanaAddress);
			if (!creator) return ctx.json({error: 'You are not an approved creator'}, 403);

			const {id} = ctx.req.valid('param');
			const listing = await cosmeticsRepo.getListingById(id);
			if (!listing || listing.creator_id !== creator.creator_id) {
				return ctx.json({error: 'Listing not found'}, 404);
			}
			if (listing.status !== 'draft') {
				return ctx.json({error: 'Only draft listings can be deleted'}, 409);
			}

			await cosmeticsRepo.deleteListing(id, creator.creator_id);
			return ctx.json({ok: true});
		},
	);

	// ─── Creator program — admin ───────────────────────────────────────────────

	/**
	 * GET /admin/creator-applications
	 * List all creator applications.
	 */
	app.get(
		'/admin/creator-applications',
		requireAdminACL(AdminACLs.CREATOR_APPLICATION_VIEW),
		OpenAPI({
			operationId: 'admin_list_creator_applications',
			summary: 'List creator applications',
			responseSchema: AdminCreatorApplicationsResponse,
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		async (ctx) => {
			const applications = await cosmeticsRepo.getAllApplications();
			const withUsernames = await Promise.all(
				applications.map(async (a) => ({
					solana_address: a.solana_address,
					username: await cosmeticsRepo.getUsernameBySolanaAddress(a.solana_address),
					status: a.status,
					applied_at: a.applied_at.toISOString(),
					reviewed_at: a.reviewed_at?.toISOString() ?? null,
				})),
			);
			return ctx.json<AdminCreatorApplicationsResponse>({applications: withUsernames});
		},
	);

	/**
	 * POST /admin/creator-applications/:address/approve
	 * Approve a creator application and create the creator record.
	 */
	app.post(
		'/admin/creator-applications/:address/approve',
		requireAdminACL(AdminACLs.CREATOR_APPLICATION_REVIEW),
		OpenAPI({
			operationId: 'admin_approve_creator_application',
			summary: 'Approve a creator application',
			responseSchema: z.object({ok: z.boolean(), creator_id: z.number().int()}),
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({address: z.string().min(1)})),
		async (ctx) => {
			const {address} = ctx.req.valid('param');
			const adminKey = String(ctx.get('adminUserId') ?? 'unknown');

			const application = await cosmeticsRepo.reviewApplication(address, 'approved', adminKey);
			if (!application) {
				return ctx.json({error: 'Application not found'}, 404);
			}

			// Check if already a creator (idempotent).
			const existing = await cosmeticsRepo.getCreatorByWallet(address);
			if (existing) {
				return ctx.json({ok: true, creator_id: existing.creator_id});
			}

			const creator = await cosmeticsRepo.createCreator(address);
			return ctx.json({ok: true, creator_id: creator.creator_id});
		},
	);

	/**
	 * POST /admin/creator-applications/:address/reject
	 * Reject a creator application.
	 */
	app.post(
		'/admin/creator-applications/:address/reject',
		requireAdminACL(AdminACLs.CREATOR_APPLICATION_REVIEW),
		OpenAPI({
			operationId: 'admin_reject_creator_application',
			summary: 'Reject a creator application',
			responseSchema: z.object({ok: z.boolean()}),
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({address: z.string().min(1)})),
		async (ctx) => {
			const {address} = ctx.req.valid('param');
			const adminKey = String(ctx.get('adminUserId') ?? 'unknown');
			const application = await cosmeticsRepo.reviewApplication(address, 'rejected', adminKey);
			if (!application) return ctx.json({error: 'Application not found'}, 404);
			return ctx.json({ok: true});
		},
	);

	/**
	 * GET /admin/creators
	 * List all approved creators.
	 */
	app.get(
		'/admin/creators',
		requireAdminACL(AdminACLs.CREATOR_VIEW),
		OpenAPI({
			operationId: 'admin_list_creators',
			summary: 'List approved creators',
			responseSchema: AdminCreatorsResponse,
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		async (ctx) => {
			const creators = await cosmeticsRepo.getAllCreators();
			return ctx.json<AdminCreatorsResponse>({
				creators: creators.map((c) => ({
					creator_id: c.creator_id,
					solana_address: c.solana_address,
					commission_rate: c.commission_rate,
					payout_suspended: c.payout_suspended,
					approved_at: c.approved_at.toISOString(),
				})),
			});
		},
	);

	/**
	 * PATCH /admin/creators/:id
	 * Update a creator — payout wallet, commission rate, or suspension status.
	 */
	app.patch(
		'/admin/creators/:id',
		requireAdminACL(AdminACLs.CREATOR_MANAGE),
		OpenAPI({
			operationId: 'admin_update_creator',
			summary: 'Update a creator record',
			requestSchema: AdminUpdateCreatorRequest,
			responseSchema: z.object({ok: z.boolean()}),
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		Validator('json', AdminUpdateCreatorRequest),
		async (ctx) => {
			const creatorId = Number(ctx.req.valid('param').id);
			if (!Number.isInteger(creatorId) || creatorId <= 0) {
				return ctx.json({error: 'Invalid creator ID'}, 400);
			}
			const patch = ctx.req.valid('json');
			const updated = await cosmeticsRepo.updateCreator(creatorId, patch);
			if (!updated) return ctx.json({error: 'Creator not found'}, 404);
			return ctx.json({ok: true});
		},
	);

	/**
	 * GET /admin/creator-listings
	 * List all creator listings (all statuses).
	 */
	app.get(
		'/admin/creator-listings',
		requireAdminACL(AdminACLs.CREATOR_LISTING_VIEW),
		OpenAPI({
			operationId: 'admin_list_creator_listings',
			summary: 'List all creator listings',
			responseSchema: AdminListingsResponse,
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		async (ctx) => {
			const listings = await cosmeticsRepo.getAllListings();
			return ctx.json<AdminListingsResponse>({
				listings: listings.map((l) => ({
					id: l.id,
					creator_id: l.creator_id,
					name: l.name,
					description: l.description,
					image_url: l.image_url,
					cosmetic_type: l.cosmetic_type,
					rarity: l.rarity,
					price_lamports: l.price_lamports,
					collection_address: l.collection_address,
					status: l.status,
					created_at: l.created_at.toISOString(),
					updated_at: l.updated_at.toISOString(),
				})),
			});
		},
	);

	/**
	 * POST /admin/creator-listings/:id/approve
	 * Approve a listing — sets status to 'live' and makes it visible in the shop.
	 */
	app.post(
		'/admin/creator-listings/:id/approve',
		requireAdminACL(AdminACLs.CREATOR_LISTING_REVIEW),
		OpenAPI({
			operationId: 'admin_approve_creator_listing',
			summary: 'Approve a creator listing',
			responseSchema: z.object({ok: z.boolean()}),
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		async (ctx) => {
			const {id} = ctx.req.valid('param');
			const updated = await cosmeticsRepo.setListingStatus(id, 'live');
			if (!updated) return ctx.json({error: 'Listing not found'}, 404);
			return ctx.json({ok: true});
		},
	);

	/**
	 * POST /admin/creator-listings/:id/reject
	 * Reject a listing.
	 */
	app.post(
		'/admin/creator-listings/:id/reject',
		requireAdminACL(AdminACLs.CREATOR_LISTING_REVIEW),
		OpenAPI({
			operationId: 'admin_reject_creator_listing',
			summary: 'Reject a creator listing',
			responseSchema: z.object({ok: z.boolean()}),
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({id: z.string().min(1)})),
		async (ctx) => {
			const {id} = ctx.req.valid('param');
			const updated = await cosmeticsRepo.setListingStatus(id, 'rejected');
			if (!updated) return ctx.json({error: 'Listing not found'}, 404);
			return ctx.json({ok: true});
		},
	);

	/**
	 * PUT /guilds/:guildId/cosmetics
	 * Apply or clear a server cosmetic slot. Server owner only.
	 * mint_address: null clears the slot.
	 */
	app.put(
		'/guilds/:guildId/cosmetics',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.APPLY_COSMETIC),
		OpenAPI({
			operationId: 'apply_guild_cosmetic',
			summary: 'Apply or clear a server cosmetic slot',
			requestSchema: ApplyServerCosmeticRequest,
			responseSchema: ApplyServerCosmeticResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Applies the specified NFT to a server cosmetic slot. ' +
				'Caller must be the server owner and must own the NFT in their linked Solana wallet.',
		}),
		Validator('param', z.object({guildId: z.string().min(1)})),
		Validator('json', ApplyServerCosmeticRequest),
		async (ctx) => {
			const user = ctx.get('user');
			const guildId = createGuildID(BigInt(ctx.req.valid('param').guildId));
			const {slot, mint_address} = ctx.req.valid('json');

			// Verify the caller is the guild owner.
			const guildService = ctx.get('guildService');
			let guild;
			try {
				guild = await guildService.getGuild({userId: user.id, guildId});
			} catch {
				return ctx.json({error: 'Unknown guild'}, 404);
			}
			if (guild.owner_id !== String(user.id)) {
				return ctx.json({error: 'Only the server owner can apply server cosmetics'}, 403);
			}

			if (mint_address === null) {
				await cosmeticsRepo.clearServerCosmetic(guildId, slot);
			} else {
				// TODO: Verify on-chain ownership when collection is deployed.
				await cosmeticsRepo.applyServerCosmetic(guildId, slot, mint_address, user.id);
			}

			const rows = await cosmeticsRepo.getServerCosmetics(guildId);
			return ctx.json<ApplyServerCosmeticResponse>({
				ok: true,
				applied: rows.map((r) => ({
					slot: r.slot,
					mint_address: r.mint_address,
					applied_at: r.applied_at.toISOString(),
					applied_by: String(r.applied_by),
					image_url: null,
				})),
			});
		},
	);
}
