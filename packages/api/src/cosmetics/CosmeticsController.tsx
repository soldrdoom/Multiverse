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
import {
	CosmeticListingSoldOutOnChainError,
	ensureListingMintSetup,
	ListingMintSetupFailedError,
	mintPurchasedCosmetic,
} from '@fluxer/api/src/cosmetics/CosmeticsMintService';
import {COSMETICS_TREASURY_WALLET} from '@fluxer/api/src/cosmetics/CosmeticsPaymentConfig';
import {CosmeticsPurchaseRepository} from '@fluxer/api/src/cosmetics/CosmeticsPurchaseRepository';
import {
	CosmeticsRepository,
	isPendingMintSetupSentinel,
	ListingMaxSupplyBelowMintedError,
} from '@fluxer/api/src/cosmetics/CosmeticsRepository';
import type {CosmeticListingRow} from '@fluxer/api/src/database/types/CosmeticTypes';
import {
	fetchRecentBlockhash,
	getFeePayerAddress,
	pollSolanaTransaction,
	sumTransfersTo,
} from '@fluxer/api/src/cosmetics/CosmeticsSolanaUtils';
import {sanitizeCosmeticSvg} from '@fluxer/api/src/cosmetics/CosmeticsSvgSanitizer';
import type {CosmeticsPurchaseRow} from '@fluxer/api/src/database/types/CosmeticsPurchaseTypes';
import {Logger} from '@fluxer/api/src/Logger';
import {requireAdminACL} from '@fluxer/api/src/middleware/AdminMiddleware';
import {DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {CosmeticsRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/CosmeticsRateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {requirePermission} from '@fluxer/api/src/utils/PermissionUtils';
import {Validator} from '@fluxer/api/src/Validator';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {
	AdminCreatorApplicationsResponse,
	AdminCreatorsResponse,
	AdminListingsResponse,
	AdminPurchaseLookupResponse,
	AdminUpdateCreatorRequest,
	ApplyProfileCosmeticRequest,
	ApplyProfileCosmeticResponse,
	ApplyServerCosmeticRequest,
	ApplyServerCosmeticResponse,
	CosmeticsInvoiceResponse,
	CosmeticsOwnedNftsResponse,
	CosmeticsStoreResponse,
	CreateListingRequest,
	CreatorApplyResponse,
	type CreatorListingEntry,
	CreatorStatusResponse,
	GuildCosmeticsResponse,
	ListingResponse,
	type OwnedCosmeticNft,
	PurchaseCosmeticRequest,
	PurchaseCosmeticResponse,
	type StoreListingNft,
	UpdateListingRequest,
	UserCosmeticsPublicResponse,
	UserCosmeticsResponse,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {fetchGatingAssetsForWallet} from '@fluxer/solana_das/src/NftFetcher';
import {verifyWalletHoldsCoreAsset} from '@fluxer/solana_mint/src/CoreMintClient';
import {COSMETICS_DAS_URL, isMintingConfigured} from '@fluxer/solana_mint/src/MintConfig';
import {z} from 'zod';

const cosmeticsRepo = new CosmeticsRepository();
const cosmeticsPurchaseRepo = new CosmeticsPurchaseRepository();

/** 90/10 creator/platform split — computed from the creator's own commission_rate (defaults to 90). */
function computeSplit(
	priceLamports: number,
	commissionRate: number,
): {creatorLamports: number; platformLamports: number} {
	const creatorLamports = Math.floor((priceLamports * commissionRate) / 100);
	// Platform gets the remainder rather than an independently-rounded share, so the two legs
	// always sum to exactly priceLamports (no lamports silently lost/gained to rounding).
	const platformLamports = priceLamports - creatorLamports;
	return {creatorLamports, platformLamports};
}

/**
 * Sanitizes a listing's `collection_address` for API responses — the raw column doubles as an
 * internal lazy-setup completion gate and can transiently hold a pending-setup sentinel value
 * (`'pending:<claim-timestamp>'`, see `isPendingMintSetupSentinel`) while setup is in progress.
 * Callers/clients should only ever see a real address or `null`, matching the documented "null
 * until collection is deployed" contract.
 */
function publicCollectionAddress(collectionAddress: string | null): string | null {
	return isPendingMintSetupSentinel(collectionAddress) ? null : collectionAddress;
}

/**
 * Verifies the caller's linked Solana wallet actually holds `assetAddress` before an "apply
 * cosmetic" request is persisted — previously these endpoints trusted whatever mint_address the
 * client sent with no on-chain check at all. Always queries COSMETICS_MINT_RPC_URL (a public,
 * unauthenticated devnet RPC by default) directly — this is a read-only ownership lookup, not a
 * minting operation, so it works regardless of whether COSMETICS_MINT_AUTHORITY_SECRET_KEY (the
 * signer needed to mint) is configured on this deployment. Returns an error message string on
 * failure, or null on success — fails closed (denies) on any RPC error rather than trusting an
 * unverifiable claim.
 *
 * Uses `verifyWalletHoldsCoreAsset` (Metaplex Core, ownership read directly off the asset
 * account's own `owner` field), NOT `MintClient.tsx`'s legacy `verifyWalletHoldsMint`
 * (`getTokenAccountsByOwner`-based SPL-Token-Metadata check) — these cosmetics are minted as Core
 * assets, which have no associated SPL token account for the legacy check to find. See
 * `CoreMintClient.tsx`'s header comment.
 */
async function requireOwnsMint(walletAddress: string | null, assetAddress: string): Promise<string | null> {
	if (!walletAddress) return 'You must link a Solana wallet before applying cosmetics';
	const owns = await verifyWalletHoldsCoreAsset(walletAddress, assetAddress);
	if (!owns) return 'Your linked Solana wallet does not hold this NFT';
	return null;
}

// ─── Seed catalog ─────────────────────────────────────────────────────────────
// Placeholder items shown in the shop before the Metaplex collection is live.
// Replace with a DB/IPFS-backed catalog once collection addresses are known.
// Prices are in lamports (1 SOL = 1_000_000_000).

const SEED_CATALOG: Array<StoreListingNft> = [
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
	},
	// ── Server cosmetics ───────────────────────────────────────────────────
	{
		id: 'seed-chat-bg-legendary-01',
		name: 'Galaxy Chat Background',
		description: "A slowly rotating galaxy fills your server's chat.",
		image: null,
		cosmetic_type: 'chat_background',
		rarity: 'legendary',
		price_lamports: 6_000_000_000,
		collection_address: null,
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
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
		max_supply: null,
		minted_count: 0,
	},
];

export function CosmeticsController(app: HonoApp): void {
	// Note: NFT listing (`GET /nfts`) lives in fluxer_server/src/Routes.tsx (`GET /v1/nfts`),
	// not here — a stub route used to be registered at this same path (`/nfts`, which is also
	// reachable as `/v1/nfts` since App.tsx mounts these controller routes at both `/` and `/v1`)
	// and silently shadowed the real implementation for every request. See PROJECT_REPORT.md's
	// 2026-07-20 session for the full story.

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
			const creatorItems: Array<StoreListingNft> = liveListings.map((l) => ({
				id: l.id,
				name: l.name,
				description: l.description,
				image: l.image_url,
				cosmetic_type: l.cosmetic_type,
				rarity: l.rarity,
				price_lamports: l.price_lamports,
				collection_address: publicCollectionAddress(l.collection_address),
				// Defensive default — see the matching comment in GET /creators/@me below.
				max_supply: l.max_supply ?? null,
				minted_count: l.minted_count ?? 0,
			}));
			return _ctx.json<CosmeticsStoreResponse>({items: [...SEED_CATALOG, ...creatorItems]});
		},
	);

	/**
	 * GET /cosmetics/owned-nfts
	 * Returns cosmetics-shop items the current user's linked wallet *currently* holds, read live
	 * from DAS (COSMETICS_DAS_URL) rather than from Multiverse's own purchase records.
	 *
	 * Deliberately NOT named `/nfts` — see the shadowing-incident note above this function.
	 *
	 * This is intentionally NOT a replacement for `GET /v1/nfts` (fluxer_server/src/Routes.tsx),
	 * which reads mainnet-only DAS (SOLANA_DAS_URL) and is also relied on by the unrelated NFT
	 * sticker picker. That route can never see a cosmetic minted while the cosmetics-mint pipeline
	 * is devnet-pinned (as it currently is on this deployment), because the two DAS/RPC configs are
	 * deliberately decoupled (see MintConfig.tsx's header comment) — this route exists to cover that
	 * gap with its own DAS endpoint.
	 *
	 * IMPORTANT — this was previously implemented by looking up the user's *purchase history*
	 * (`cosmetics_purchases_by_buyer`) and re-verifying each purchased mint's ownership. That
	 * approach was wrong: cosmetics are real tradeable NFTs, and a user who acquires one by trading
	 * rather than buying through Multiverse would never have a purchase row, so it would never show
	 * up in their "Your Items" even though their wallet genuinely holds it. This version instead
	 * enumerates the wallet's *current* holdings via DAS and filters to Multiverse's own known
	 * cosmetic collections (`CosmeticsRepository.getListingsWithCollectionAddress`) — same
	 * "current wallet contents, not who bought what" architecture as the mainnet `GET /v1/nfts` path
	 * above, just pointed at a separate (devnet) DAS endpoint.
	 *
	 * Deliberately uses `fetchGatingAssetsForWallet`/`parseDasAssetForGating` (mint + collection
	 * only), NOT `fetchNftsForWallet`/`parseDasAsset` — the latter drops any asset it can't resolve
	 * a display image for, and DAS's *off-chain* metadata resolution (content.files/content.links/
	 * content.metadata.attributes) has been observed empty for real devnet-minted Core cosmetics
	 * well after mint confirmation, even though the on-chain fields (interface/ownership/grouping)
	 * were correct. Display fields (name/image/cosmetic_type/rarity) are instead taken from this
	 * deployment's own listing row for the matched collection — see COSMETICS_DAS_URL's doc comment
	 * in MintConfig.tsx for the full story.
	 */
	app.get(
		'/cosmetics/owned-nfts',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.GET_NFTS),
		OpenAPI({
			operationId: 'get_cosmetics_owned_nfts',
			summary: 'Get cosmetics-shop NFTs currently held by the current user',
			responseSchema: CosmeticsOwnedNftsResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				"Returns cosmetic NFTs the current user's linked Solana wallet currently holds, read live " +
				'from DAS and filtered to known Multiverse cosmetic collections. Complements GET /nfts, ' +
				'which only ever reads mainnet and cannot see devnet-minted cosmetics.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const buyerAddress = user.solanaAddress;
			if (!buyerAddress) {
				return ctx.json({error: 'No Solana wallet linked to this account'}, 404);
			}

			// Inert until an operator provisions a DAS-capable endpoint for the cosmetics-mint
			// pipeline's cluster — see COSMETICS_DAS_URL's doc comment. Degrade to an empty list
			// rather than error, matching isMintingConfigured()'s "unconfigured => inert" convention.
			if (!COSMETICS_DAS_URL) {
				return ctx.json<CosmeticsOwnedNftsResponse>({nfts: []});
			}

			const knownListings = await cosmeticsRepo.getListingsWithCollectionAddress();
			if (knownListings.length === 0) {
				return ctx.json<CosmeticsOwnedNftsResponse>({nfts: []});
			}
			const listingByCollection = new Map<string, CosmeticListingRow>(
				knownListings.map((l) => [l.collection_address as string, l]),
			);

			let heldAssets: Awaited<ReturnType<typeof fetchGatingAssetsForWallet>>;
			try {
				heldAssets = await fetchGatingAssetsForWallet(buyerAddress, COSMETICS_DAS_URL);
			} catch (err) {
				Logger.error({err, wallet: buyerAddress}, 'Failed to fetch cosmetics-owned NFTs from DAS');
				return ctx.json({error: 'Failed to fetch owned cosmetics. Please try again.'}, 502);
			}

			const nfts: Array<OwnedCosmeticNft> = [];
			for (const asset of heldAssets) {
				if (!asset.collectionMint) continue;
				const listing = listingByCollection.get(asset.collectionMint);
				if (!listing) continue; // Not one of Multiverse's own cosmetic collections.
				nfts.push({
					mint: asset.mint,
					name: listing.name,
					image: listing.image_url,
					cosmetic_type: listing.cosmetic_type,
					rarity: listing.rarity,
				});
			}

			return ctx.json<CosmeticsOwnedNftsResponse>({nfts});
		},
	);

	// ─── Profile cosmetics ────────────────────────────────────────────────────
	// Note: these `@me` routes must be registered before `/users/:userId/cosmetics`
	// below — Hono resolves routes in registration order, and `:userId` matches
	// the literal segment `@me` too, so registering the param route first would
	// silently shadow these for every request. See the `/nfts` note above for
	// the prior incident of this same class of bug.

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
			const user = ctx.get('user');
			const userId = user.id;
			const {slot, mint_address} = ctx.req.valid('json');

			if (mint_address === null) {
				await cosmeticsRepo.clearProfileCosmetic(userId, slot);
			} else {
				const ownershipError = await requireOwnsMint(user.solanaAddress, mint_address);
				if (ownershipError) return ctx.json({error: ownershipError}, 403);
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
	//
	// Two-step flow, mirroring the guild-vanity-purchase / user-tip pattern in
	// fluxer_server/src/Routes.tsx (durable pending row + purchase_id, live
	// on-chain verification, tx_signature replay protection via a conditional
	// insert), but split creator/platform like tips rather than single-recipient
	// like vanity — a cosmetics sale pays both the listing's creator (their
	// commission_rate, default 90%) and the platform treasury (the remainder).
	//
	// Only live creator listings are purchasable — the SEED_CATALOG placeholder
	// items above have no creator wallet to pay out to and no collection to mint
	// into yet (see the catalog's own comment: "Replace with a DB/IPFS-backed
	// catalog once collection addresses are known").

	/**
	 * POST /cosmetics/store/:itemId/invoice
	 * Creates a pending purchase and returns the SOL amounts + a fresh blockhash for the
	 * client to build and sign a single transfer transaction (creator leg + platform leg).
	 */
	app.post(
		'/cosmetics/store/:itemId/invoice',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(CosmeticsRateLimitConfigs.INVOICE),
		OpenAPI({
			operationId: 'create_cosmetic_invoice',
			summary: 'Create a purchase invoice for a cosmetic item',
			responseSchema: CosmeticsInvoiceResponse,
			statusCode: 200,
			tags: ['Cosmetics'],
			description:
				'Computes the creator/platform SOL split for the given catalog item and returns a fresh ' +
				'blockhash for the client to build a single transfer transaction against. Only live creator ' +
				'listings are purchasable.',
		}),
		Validator('param', z.object({itemId: z.string().min(1)})),
		async (ctx) => {
			const {itemId} = ctx.req.valid('param');
			const user = ctx.get('user');

			const listing = await cosmeticsRepo.getListingById(itemId);
			if (!listing || listing.status !== 'live') {
				return ctx.json({error: 'Item not found'}, 404);
			}
			// Early UX gate only — not the correctness boundary. A plain (non-atomic) read is fine
			// here: the actual supply cap is enforced atomically by `reserveMintSlot` at purchase
			// time, right before the mint attempt.
			if (listing.max_supply !== null && listing.minted_count >= listing.max_supply) {
				return ctx.json({error: 'This item is sold out'}, 409);
			}

			const creator = await cosmeticsRepo.getCreatorById(listing.creator_id);
			if (!creator) {
				return ctx.json({error: 'Item not found'}, 404);
			}
			if (creator.payout_suspended) {
				return ctx.json({error: 'This item is temporarily unavailable for purchase'}, 403);
			}

			// Lazily deploy this listing's on-chain mint setup (Collection, optional Candy Machine,
			// shared metadata) the first time anyone tries to buy it — before any payment-related
			// work, so a setup failure never happens after a buyer has already paid. Skipped
			// entirely when minting isn't configured on this deployment: forcing setup then would
			// turn every invoice request into a guaranteed 503 rather than the intended "payment
			// collection ships ahead of minting" degrade.
			if (isMintingConfigured()) {
				try {
					await ensureListingMintSetup(listing, ctx.get('storageService'));
				} catch (err) {
					Logger.error({err, itemId: listing.id}, 'Cosmetics listing mint setup failed during invoice creation');
					const message = err instanceof ListingMintSetupFailedError ? err.message : 'Setup failed, please try again';
					return ctx.json({error: message}, 503);
				}
			}

			const {creatorLamports, platformLamports} = computeSplit(listing.price_lamports, creator.commission_rate);

			let recentBlockhash: string;
			try {
				recentBlockhash = await fetchRecentBlockhash();
			} catch {
				return ctx.json({error: 'Unable to fetch Solana blockhash. Please try again.'}, 503);
			}

			const purchaseId = crypto.randomUUID();
			const row: CosmeticsPurchaseRow = {
				purchase_id: purchaseId,
				item_id: listing.id,
				buyer_user_id: user.id,
				buyer_address: null,
				creator_id: creator.creator_id,
				creator_wallet: creator.solana_address,
				creator_lamports: creatorLamports,
				platform_wallet: COSMETICS_TREASURY_WALLET,
				platform_lamports: platformLamports,
				tx_signature: null,
				status: 'pending',
				mint_address: null,
				created_at: new Date(),
				paid_at: null,
				minted_at: null,
			};
			await cosmeticsPurchaseRepo.createPurchase(row);

			return ctx.json<CosmeticsInvoiceResponse>({
				purchase_id: purchaseId,
				creator_wallet: creator.solana_address,
				creator_lamports: creatorLamports,
				platform_wallet: COSMETICS_TREASURY_WALLET,
				platform_lamports: platformLamports,
				recent_blockhash: recentBlockhash,
				item_id: listing.id,
			});
		},
	);

	/**
	 * POST /cosmetics/purchase
	 * Verify a SOL payment transaction (split creator/platform) and mint the purchased NFT
	 * to the buyer's wallet. Payment verification always happens; minting only happens if
	 * COSMETICS_MINT_AUTHORITY_SECRET_KEY is configured on this deployment — otherwise the
	 * purchase is recorded as paid and `minted: false` is returned rather than failing the
	 * request (this lets payment collection ship ahead of minting going live).
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
				"then mints the cosmetic NFT to the buyer's wallet if minting is configured on this deployment. " +
				'Payment is verified independently of minting — an unconfigured mint authority never blocks a paid purchase.',
		}),
		Validator('json', PurchaseCosmeticRequest),
		async (ctx) => {
			const user = ctx.get('user');
			// NOTE: the request's `buyer_address` field is intentionally never destructured/used
			// here — it's client-supplied and must NEVER be trusted as the mint destination or as
			// proof of who paid (see the fee-payer check below). The mint destination and payment
			// ownership are always derived from the authenticated session's own linked wallet.
			const {item_id: itemId, tx_signature: txSignature, purchase_id: requestedPurchaseId} = ctx.req.valid('json');

			// The mint destination and payment-ownership check are both derived from the
			// authenticated session's linked wallet, never from client-supplied input.
			const buyerAddress = user.solanaAddress;
			if (!buyerAddress) {
				return ctx.json({error: 'You must link a Solana wallet before purchasing'}, 400);
			}

			const listing = await cosmeticsRepo.getListingById(itemId);
			if (!listing || listing.status !== 'live') {
				return ctx.json({error: 'Item not found'}, 404);
			}

			const creator = await cosmeticsRepo.getCreatorById(listing.creator_id);
			if (!creator) {
				return ctx.json({error: 'Item not found'}, 404);
			}
			if (creator.payout_suspended) {
				return ctx.json({error: 'This item is temporarily unavailable for purchase'}, 403);
			}

			// Same lazy setup as the invoice route above — `purchase_id` is optional here, so a
			// client can call this route directly without ever hitting invoice first, meaning this
			// route needs its own setup gate rather than relying on the invoice route having already
			// run it. Must happen before any payment verification below.
			if (isMintingConfigured()) {
				try {
					await ensureListingMintSetup(listing, ctx.get('storageService'));
				} catch (err) {
					Logger.error({err, itemId: listing.id}, 'Cosmetics listing mint setup failed during purchase');
					const message = err instanceof ListingMintSetupFailedError ? err.message : 'Setup failed, please try again';
					return ctx.json({error: message}, 503);
				}
			}

			const {creatorLamports, platformLamports} = computeSplit(listing.price_lamports, creator.commission_rate);

			// Resolve (or create) the purchase row this verification applies to. Recomputing the
			// expected split fresh from the listing/creator above (rather than only trusting a
			// stored invoice row) means verification is correct even if the client never called
			// the invoice endpoint, or the invoice's row went missing for some reason.
			let purchase: CosmeticsPurchaseRow;
			if (requestedPurchaseId) {
				const existing = await cosmeticsPurchaseRepo.getPurchase(requestedPurchaseId);
				if (!existing || existing.buyer_user_id !== user.id || existing.item_id !== itemId) {
					return ctx.json({error: 'Purchase not found'}, 404);
				}
				if (existing.status !== 'pending') {
					return ctx.json({error: 'This purchase has already been processed'}, 409);
				}
				purchase = existing;
			} else {
				purchase = {
					purchase_id: crypto.randomUUID(),
					item_id: listing.id,
					buyer_user_id: user.id,
					buyer_address: null,
					creator_id: creator.creator_id,
					creator_wallet: creator.solana_address,
					creator_lamports: creatorLamports,
					platform_wallet: COSMETICS_TREASURY_WALLET,
					platform_lamports: platformLamports,
					tx_signature: null,
					status: 'pending',
					mint_address: null,
					created_at: new Date(),
					paid_at: null,
					minted_at: null,
				};
				await cosmeticsPurchaseRepo.createPurchase(purchase);
			}

			// Verify the transaction — retry up to 8x with 3s delay for confirmation lag.
			const txData = await pollSolanaTransaction(txSignature);
			if (!txData) {
				return ctx.json(
					{error: 'Transaction not found after waiting. Please contact support with your tx signature.'},
					400,
				);
			}
			if (txData.meta?.err !== null && txData.meta?.err !== undefined) {
				return ctx.json({error: 'Transaction failed on-chain'}, 400);
			}

			// Bind payment to the authenticated buyer: amount-only verification (below) proves WHAT
			// was paid but not WHO paid it, and Solana transactions are publicly visible on-chain
			// before/while the paying user's own client calls this endpoint — without this check, an
			// attacker who observes a matching-amount transfer could race the legitimate buyer and
			// claim their payment for a different purchase_id/mint destination. Account 0 is always
			// the fee-payer/sender for this transaction shape (same convention as the guild-vanity
			// and tip verification flows in fluxer_server/src/Routes.tsx).
			const feePayerAddress = getFeePayerAddress(txData);
			if (feePayerAddress !== buyerAddress) {
				return ctx.json({error: 'This transaction was not paid from your linked Solana wallet'}, 403);
			}

			const creatorReceived = sumTransfersTo(txData, purchase.creator_wallet);
			const platformReceived = sumTransfersTo(txData, purchase.platform_wallet);
			if (creatorReceived < purchase.creator_lamports) {
				return ctx.json(
					{
						error: `Insufficient payment to creator. Expected ${purchase.creator_lamports} lamports, received ${creatorReceived}`,
					},
					400,
				);
			}
			if (platformReceived < purchase.platform_lamports) {
				return ctx.json(
					{
						error: `Insufficient payment to platform. Expected ${purchase.platform_lamports} lamports, received ${platformReceived}`,
					},
					400,
				);
			}

			const {applied: txSignatureApplied} = await cosmeticsPurchaseRepo.reserveTxSignature(
				txSignature,
				purchase.purchase_id,
			);
			if (!txSignatureApplied) {
				return ctx.json({error: 'This transaction signature has already been used for another purchase'}, 409);
			}

			// Atomically reserve one unit of this listing's supply cap (if it has one) — the
			// correctness boundary for "only N of this can ever be minted", as opposed to the plain
			// read check in the invoice route above which is just an early UX gate. The buyer's SOL
			// payment has already landed on-chain by this point (verified above), so a sold-out
			// result here can't simply be rejected as if nothing happened — the purchase is still
			// recorded as 'paid' below, and the buyer is told to contact support for a refund.
			const {applied: slotReserved} = await cosmeticsRepo.reserveMintSlot(listing.id);

			const paidAt = new Date();
			purchase = {
				...purchase,
				tx_signature: txSignature,
				buyer_address: buyerAddress,
				status: 'paid',
				paid_at: paidAt,
			};
			await cosmeticsPurchaseRepo.updatePurchase(purchase);

			if (!slotReserved) {
				Logger.error(
					{purchaseId: purchase.purchase_id, itemId: listing.id},
					'Cosmetics purchase paid but listing sold out before a mint slot could be reserved',
				);
				// Distinct from the ordinary 'paid' status so support can actually find this purchase
				// via GET /admin/cosmetics/purchases/:purchaseId — 'paid' alone is indistinguishable
				// from "payment verified, minting simply not configured/attempted yet".
				purchase = {...purchase, status: 'sold_out_refund_needed'};
				await cosmeticsPurchaseRepo.updatePurchase(purchase);
				return ctx.json(
					{
						error:
							'Your payment was received, but this item sold out while your purchase was being processed. ' +
							`Please contact support with your purchase ID (${purchase.purchase_id}) and transaction signature for a refund or resolution.`,
					},
					409,
				);
			}

			if (!isMintingConfigured()) {
				return ctx.json<PurchaseCosmeticResponse>({
					ok: true,
					purchase_id: purchase.purchase_id,
					paid: true,
					minted: false,
					nft: null,
				});
			}

			try {
				const minted = await mintPurchasedCosmetic({
					storageService: ctx.get('storageService'),
					purchaseId: purchase.purchase_id,
					listing,
					destinationWallet: buyerAddress,
				});
				if (!minted) {
					// isMintingConfigured() was true a moment ago but flipped false mid-request — treat
					// the same as "not configured" rather than as an error; payment already succeeded.
					return ctx.json<PurchaseCosmeticResponse>({
						ok: true,
						purchase_id: purchase.purchase_id,
						paid: true,
						minted: false,
						nft: null,
					});
				}

				await cosmeticsPurchaseRepo.updatePurchase({
					...purchase,
					status: 'minted',
					mint_address: minted.mintAddress,
					minted_at: new Date(),
				});

				return ctx.json<PurchaseCosmeticResponse>({
					ok: true,
					purchase_id: purchase.purchase_id,
					paid: true,
					minted: true,
					nft: {
						mint: minted.mintAddress,
						name: listing.name,
						image: listing.image_url,
						cosmetic_type: listing.cosmetic_type,
						rarity: listing.rarity,
					},
				});
			} catch (err) {
				if (err instanceof CosmeticListingSoldOutOnChainError) {
					// The Candy Machine — the real, on-chain-enforced cap — rejected the mint even
					// though `reserveMintSlot`'s local cache pre-check believed there was room. This
					// is the same situation as `slotReserved` being false above: the buyer's SOL
					// payment already landed on-chain, so the purchase stays recorded 'paid' and the
					// buyer is told to contact support rather than the purchase silently vanishing.
					Logger.error(
						{err, purchaseId: purchase.purchase_id, itemId: listing.id},
						'Cosmetics purchase paid but Candy Machine rejected the mint as sold out on-chain',
					);
					await cosmeticsRepo.clampMintedCountToMaxSupply(listing.id);
					// Same "distinct from plain 'paid'" reasoning as the reserveMintSlot pre-check
					// above — this purchase needs a support-actioned refund and must be findable via
					// GET /admin/cosmetics/purchases/:purchaseId.
					purchase = {...purchase, status: 'sold_out_refund_needed'};
					await cosmeticsPurchaseRepo.updatePurchase(purchase);
					return ctx.json(
						{
							error:
								'Your payment was received, but this item sold out on-chain before your purchase could be minted. ' +
								`Please contact support with your purchase ID (${purchase.purchase_id}) and transaction signature for a refund or resolution.`,
						},
						409,
					);
				}
				// Payment is already verified and durably recorded — a minting failure must never
				// look like a failed/charged-but-nothing-happened purchase to the buyer. The purchase
				// stays 'paid' and can be minted later (e.g. via an admin retry) without repaying.
				Logger.error({err, purchaseId: purchase.purchase_id}, 'Cosmetics NFT mint failed after payment was verified');
				return ctx.json<PurchaseCosmeticResponse>({
					ok: true,
					purchase_id: purchase.purchase_id,
					paid: true,
					minted: false,
					nft: null,
				});
			}
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

			const listings = creator ? await cosmeticsRepo.getListingsByCreator(creator.creator_id) : [];

			const listingEntries: Array<CreatorListingEntry> = listings.map((l) => ({
				id: l.id,
				creator_id: l.creator_id,
				name: l.name,
				description: l.description,
				image_url: l.image_url,
				cosmetic_type: l.cosmetic_type,
				rarity: l.rarity,
				price_lamports: l.price_lamports,
				collection_address: publicCollectionAddress(l.collection_address),
				status: l.status,
				// Defensive: a handful of legacy/manually-written rows are missing these entirely
				// (see the 2026-08 creators_by_wallet/listing data-repair incident) — default rather
				// than let a malformed row 500 this entire endpoint for the whole creator dashboard.
				max_supply: l.max_supply ?? null,
				minted_count: l.minted_count ?? 0,
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
				max_supply: data.max_supply ?? null,
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
				collection_address: publicCollectionAddress(listing.collection_address),
				status: listing.status,
				max_supply: listing.max_supply,
				minted_count: listing.minted_count,
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

			const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
			const EXT_MAP: Record<string, string> = {
				'image/png': 'png',
				'image/jpeg': 'jpg',
				'image/webp': 'webp',
				'image/gif': 'gif',
				'image/svg+xml': 'svg',
			};
			if (!ALLOWED_TYPES.has(file.type)) {
				return ctx.json({error: 'Only PNG, JPG, WebP, GIF, and SVG images are allowed'}, 400);
			}

			const MAX_BYTES = 4 * 1024 * 1024;
			if (file.size > MAX_BYTES) return ctx.json({error: 'Image must be under 4 MB'}, 400);

			let buffer = new Uint8Array(await file.arrayBuffer());

			// SVG is the one allowed type that can carry executable content (<script>,
			// event-handler attributes, javascript:/data:text/html URIs, off-origin
			// resource references). It's rendered in-app only via <img src=...>, which
			// can't execute any of that — but the stored file is also served back
			// directly from the CDN origin, and a direct top-level navigation to that
			// URL *would* execute it. Sanitize (never trust the client-declared MIME
			// type alone) before this ever reaches storage. See
			// CosmeticsSvgSanitizer.tsx for the full threat model.
			if (file.type === 'image/svg+xml') {
				const rawSvg = new TextDecoder('utf-8').decode(buffer);
				const {ok, sanitized} = sanitizeCosmeticSvg(rawSvg);
				if (!ok || !sanitized) {
					return ctx.json({error: 'That SVG could not be safely processed'}, 400);
				}
				buffer = new TextEncoder().encode(sanitized);
			}

			const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12);
			const ext = EXT_MAP[file.type];
			const key = `${creator.creator_id}/${hash}.${ext}`;

			// uploadObject (not uploadAvatar) so we can pass an explicit contentType:
			// uploadAvatar never threads one through to the underlying PUT, so objects
			// stored via it are served back as generic application/octet-stream. That's
			// harmless for raster formats (browsers sniff <img> content by bytes) but it
			// would either break in-app SVG rendering (if we relied on sniffing) or, if a
			// future fix makes sniffing stricter, silently reintroduce exactly the
			// direct-navigation risk the sanitizer above closes. Set it correctly here
			// instead of depending on that default.
			const storageService = ctx.get('storageService');
			await storageService.uploadObject({
				bucket: Config.s3.buckets.cdn,
				key: `cosmetics/${key}`,
				body: buffer,
				contentType: file.type,
			});

			const url = `${Config.endpoints.staticCdn}/cosmetics/${key}`;
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
			let updated: Awaited<ReturnType<typeof cosmeticsRepo.updateListing>>;
			try {
				updated = await cosmeticsRepo.updateListing(id, patch);
			} catch (err) {
				if (err instanceof ListingMaxSupplyBelowMintedError) {
					return ctx.json({error: err.message}, 400);
				}
				throw err;
			}
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
					collection_address: publicCollectionAddress(updated.collection_address),
					status: updated.status,
					// Defensive default — see the matching comment in GET /creators/@me above; a
					// legacy/malformed `existing` row merged by updateListing/setListingStatus could
					// otherwise still be missing these.
					max_supply: updated.max_supply ?? null,
					minted_count: updated.minted_count ?? 0,
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
					collection_address: publicCollectionAddress(updated.collection_address),
					status: updated.status,
					// Defensive default — see the matching comment in GET /creators/@me above; a
					// legacy/malformed `existing` row merged by updateListing/setListingStatus could
					// otherwise still be missing these.
					max_supply: updated.max_supply ?? null,
					minted_count: updated.minted_count ?? 0,
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
					collection_address: publicCollectionAddress(l.collection_address),
					status: l.status,
					// Defensive default — see the matching comment in GET /creators/@me above.
					max_supply: l.max_supply ?? null,
					minted_count: l.minted_count ?? 0,
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
			const listing = await cosmeticsRepo.getListingById(id);
			if (!listing) return ctx.json({error: 'Listing not found'}, 404);
			// Mirrors the creator-facing submit route's own draft-only gate (see
			// POST /creators/@me/listings/:id/submit above) — without this check, a direct API call
			// (or a race between two admins) could approve a listing that was never submitted for
			// review (draft), already live, already rejected, or delisted.
			if (listing.status !== 'pending_review') {
				return ctx.json({error: 'Only listings pending review can be approved'}, 409);
			}
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
			const listing = await cosmeticsRepo.getListingById(id);
			if (!listing) return ctx.json({error: 'Listing not found'}, 404);
			// Same server-side status gate as approve above — only a listing actually awaiting
			// review can be rejected through this route.
			if (listing.status !== 'pending_review') {
				return ctx.json({error: 'Only listings pending review can be rejected'}, 409);
			}
			const updated = await cosmeticsRepo.setListingStatus(id, 'rejected');
			if (!updated) return ctx.json({error: 'Listing not found'}, 404);
			return ctx.json({ok: true});
		},
	);

	/**
	 * GET /admin/cosmetics/purchases/:purchaseId
	 * Support-facing lookup of a single cosmetics purchase by ID — needed to act on a refund for
	 * a purchase whose payment landed but which could never be minted because the listing sold out
	 * (status 'sold_out_refund_needed', set in the purchase route above when
	 * `reserveMintSlot` fails or `CosmeticListingSoldOutOnChainError` is caught). Read-only: does
	 * not itself trigger a refund or mutate the purchase — CREATOR_PURCHASE_LOOKUP is a narrowly-
	 * scoped read capability (mirrors USER_LOOKUP/GUILD_LOOKUP/MESSAGE_LOOKUP's "detailed single
	 * record by ID for support" convention elsewhere in AdminACLs), not CREATOR_LISTING_REVIEW —
	 * this route can't approve/reject/delist anything.
	 */
	app.get(
		'/admin/cosmetics/purchases/:purchaseId',
		requireAdminACL(AdminACLs.CREATOR_PURCHASE_LOOKUP),
		OpenAPI({
			operationId: 'admin_lookup_cosmetics_purchase',
			summary: 'Look up a cosmetics purchase',
			description:
				'Retrieves a single cosmetics purchase by ID for support/refund handling. Requires CREATOR_PURCHASE_LOOKUP permission.',
			responseSchema: AdminPurchaseLookupResponse,
			statusCode: 200,
			tags: ['Admin', 'Creators'],
		}),
		Validator('param', z.object({purchaseId: z.string().min(1)})),
		async (ctx) => {
			const {purchaseId} = ctx.req.valid('param');
			const purchase = await cosmeticsPurchaseRepo.getPurchase(purchaseId);
			if (!purchase) return ctx.json({error: 'Purchase not found'}, 404);

			return ctx.json<AdminPurchaseLookupResponse>({
				purchase_id: purchase.purchase_id,
				item_id: purchase.item_id,
				buyer_user_id: String(purchase.buyer_user_id),
				buyer_address: purchase.buyer_address,
				creator_id: purchase.creator_id,
				creator_wallet: purchase.creator_wallet,
				creator_lamports: purchase.creator_lamports,
				platform_wallet: purchase.platform_wallet,
				platform_lamports: purchase.platform_lamports,
				total_lamports: purchase.creator_lamports + purchase.platform_lamports,
				tx_signature: purchase.tx_signature,
				status: purchase.status,
				mint_address: purchase.mint_address,
				created_at: purchase.created_at.toISOString(),
				paid_at: purchase.paid_at?.toISOString() ?? null,
				minted_at: purchase.minted_at?.toISOString() ?? null,
			});
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

			// Verify the guild exists, then that the caller has permission to manage cosmetics.
			const guildService = ctx.get('guildService');
			try {
				await guildService.getGuild({userId: user.id, guildId});
			} catch {
				return ctx.json({error: 'Unknown guild'}, 404);
			}
			await requirePermission(ctx.get('gatewayService'), {
				guildId,
				userId: user.id,
				permission: Permissions.MANAGE_COSMETICS,
			});

			if (mint_address === null) {
				await cosmeticsRepo.clearServerCosmetic(guildId, slot);
			} else {
				const ownershipError = await requireOwnsMint(user.solanaAddress, mint_address);
				if (ownershipError) return ctx.json({error: ownershipError}, 403);
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
