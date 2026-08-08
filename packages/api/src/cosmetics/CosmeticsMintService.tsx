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

import {Config} from '@fluxer/api/src/Config';
import type {CosmeticListingRow} from '@fluxer/api/src/database/types/CosmeticTypes';
import type {IStorageService} from '@fluxer/api/src/infrastructure/IStorageService';
import {mintCosmeticNft} from '@fluxer/solana_mint/src/MintClient';
import {COSMETICS_COLLECTION_ADDRESS, isMintingConfigured} from '@fluxer/solana_mint/src/MintConfig';

/**
 * Glues the cosmetics domain (a listing + a paid purchase) to `@fluxer/solana_mint`'s generic
 * mint primitive: builds the off-chain NFT metadata JSON, hosts it on this deployment's existing
 * S3-backed CDN (the same storageService/bucket creator listing images already use — see
 * `POST /creators/@me/listings/upload-image` in CosmeticsController.tsx), then mints.
 *
 * Deliberately lives in packages/api (not @fluxer/solana_mint) — it depends on IStorageService and
 * Config.endpoints.staticCdn, which are app-layer concerns @fluxer/solana_mint has no business
 * knowing about.
 */

/** Metaplex's on-chain `name` field is capped at 32 bytes; listing names can exceed that. */
function truncateForOnChainName(name: string): string {
	const bytes = new TextEncoder().encode(name);
	if (bytes.length <= 32) return name;
	// Truncate by UTF-16 code units until the UTF-8 byte length fits; simple and safe enough for
	// the mostly-ASCII listing names this marketplace expects.
	let truncated = name;
	while (new TextEncoder().encode(truncated).length > 32) {
		truncated = truncated.slice(0, -1);
	}
	return truncated;
}

export interface MintPurchasedCosmeticParams {
	storageService: IStorageService;
	purchaseId: string;
	listing: CosmeticListingRow;
	destinationWallet: string;
}

export interface MintPurchasedCosmeticResult {
	mintAddress: string;
}

/**
 * Mints the NFT for a paid cosmetics purchase. Returns `null` (not an error) when minting isn't
 * configured on this deployment — callers should treat that as "payment succeeded, minting pending"
 * rather than failing the request. Throws only for genuine mint-attempt failures (RPC error, etc.)
 * so the caller can decide how to degrade (this codebase's convention: never fail an already-verified
 * payment just because the follow-on mint step had a problem).
 */
export async function mintPurchasedCosmetic(
	params: MintPurchasedCosmeticParams,
): Promise<MintPurchasedCosmeticResult | null> {
	if (!isMintingConfigured()) return null;

	const {storageService, purchaseId, listing, destinationWallet} = params;

	const metadataJson = JSON.stringify({
		name: listing.name,
		description: listing.description ?? '',
		image: listing.image_url ?? '',
		attributes: [
			{trait_type: 'Cosmetic Type', value: listing.cosmetic_type},
			{trait_type: 'Rarity', value: listing.rarity},
		],
		properties: {
			files: listing.image_url ? [{uri: listing.image_url, type: 'image/png'}] : [],
			category: 'image',
		},
	});

	const key = `${purchaseId}.json`;
	await storageService.uploadAvatar({
		prefix: 'cosmetics-metadata',
		key,
		body: new TextEncoder().encode(metadataJson),
	});
	const uri = `${Config.endpoints.staticCdn}/cosmetics-metadata/${key}`;

	const {mintAddress} = await mintCosmeticNft({
		name: truncateForOnChainName(listing.name),
		uri,
		collectionMint: COSMETICS_COLLECTION_ADDRESS,
		destinationWallet,
	});

	return {mintAddress};
}
