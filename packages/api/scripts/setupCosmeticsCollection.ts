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

/**
 * ONE-TIME setup script — creates the "Multiverse Cosmetics" Collection NFT on
 * whatever cluster COSMETICS_MINT_RPC_URL points to (devnet by default).
 *
 * This is NOT run automatically on server boot/deploy. Run it manually, once,
 * per environment that needs its own collection:
 *
 *   COSMETICS_MINT_AUTHORITY_SECRET_KEY=... pnpm --filter @fluxer/api run setup:cosmetics-collection
 *
 * (COSMETICS_MINT_RPC_URL is optional — defaults to https://api.devnet.solana.com.)
 *
 * It prints the resulting collection address. Save it into COSMETICS_COLLECTION_ADDRESS
 * (compose.yaml / config) so `mintCosmeticNft` can verify future item mints into it.
 *
 * The placeholder art here is a generic striped SVG, matching this feature's existing
 * placeholder-art convention (real collection art is a separate later task). Metaplex's
 * on-chain `uri` field is meant to be a short pointer, not the payload itself — embedding
 * both the image and the JSON as inline `data:` URIs previously produced a ~2.4KB `uri`,
 * which blew Solana's 1232-byte raw transaction size limit at simulation time (nothing
 * landed on-chain when that happened; this script fails client-side before broadcast).
 *
 * Fixed the same way per-purchase item mints already do it (see CosmeticsMintService.tsx /
 * CosmeticsController.tsx's upload-image route): host the placeholder image and the metadata
 * JSON on this deployment's existing S3-backed CDN and put a short `https://` URL on-chain.
 * `createStorageService()` (no options) returns the same `StorageService` implementation
 * `ServiceMiddleware`/`WorkerDependencies` construct in production (they only pass a
 * `s3Service` override in tests) — a plain class that reads `Config.s3.*` directly, no Hono
 * request context needed, so it's usable from this standalone script too.
 *
 * NOTE: the two precedents this deliberately does NOT copy verbatim — CosmeticsMintService.tsx
 * (`Config.endpoints.staticCdn`) and CosmeticsController.tsx's upload-image route (same) — reference a
 * property that does not exist on APIConfig (it's `Config.endpoints.staticCdn`, not
 * `Config.endpoints.staticCdn`; confirmed via `tsgo --noEmit`, TS2339). That's a pre-existing bug outside
 * this script's scope (every real cosmetics purchase mint's on-chain `uri` and every creator
 * listing-image URL is currently the literal string `"undefined/..."`) — flagged separately,
 * not fixed here. This script uses the correct `Config.endpoints.staticCdn`.
 */

import {buildAPIConfigFromMaster, Config, initializeConfig} from '@fluxer/api/src/Config';
import {createStorageService} from '@fluxer/api/src/infrastructure/StorageServiceFactory';
import {loadConfig} from '@fluxer/config/src/ConfigLoader';
import {createCollectionNft} from '@fluxer/solana_mint/src/MintClient';
import {COSMETICS_MINT_AUTHORITY_SECRET_KEY, COSMETICS_MINT_RPC_URL} from '@fluxer/solana_mint/src/MintConfig';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <pattern id="stripes" width="40" height="40" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="20" height="40" fill="#7c3aed"/>
      <rect x="20" width="20" height="40" fill="#22c55e"/>
    </pattern>
  </defs>
  <rect width="512" height="512" fill="url(#stripes)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="28" fill="white" stroke="black" stroke-width="1">Multiverse Cosmetics</text>
</svg>`;

const CDN_PREFIX = 'cosmetics-collection';

async function main(): Promise<void> {
	if (!COSMETICS_MINT_AUTHORITY_SECRET_KEY) {
		console.error('COSMETICS_MINT_AUTHORITY_SECRET_KEY is not set — refusing to run (nothing to sign with).');
		process.exitCode = 1;
		return;
	}

	console.log(`Creating "Multiverse Cosmetics" collection NFT via ${COSMETICS_MINT_RPC_URL} ...`);

	// This script runs standalone (tsx, not through fluxer_server's ServiceInitializer), so
	// @fluxer/api's Config proxy is never populated automatically — do here what
	// createAPIInitializer() does at server boot: load the master config (FLUXER_CONFIG) and
	// derive+initialize the API-layer Config from it, so `Config.endpoints.staticCdn`/`Config.s3` (used by
	// `createStorageService()` below) resolve instead of throwing.
	const masterConfig = await loadConfig();
	initializeConfig(buildAPIConfigFromMaster(masterConfig));

	const storageService = createStorageService();

	await storageService.uploadAvatar({
		prefix: CDN_PREFIX,
		key: 'placeholder.svg',
		body: new TextEncoder().encode(PLACEHOLDER_SVG),
	});
	const imageUrl = `${Config.endpoints.staticCdn}/${CDN_PREFIX}/placeholder.svg`;
	console.log(`  uploaded placeholder image -> ${imageUrl}`);

	const metadataJson = JSON.stringify({
		name: 'Multiverse Cosmetics',
		description: 'The verified collection anchor for all Multiverse cosmetics-shop NFTs.',
		image: imageUrl,
		attributes: [],
		properties: {
			files: [{uri: imageUrl, type: 'image/svg+xml'}],
			category: 'image',
		},
	});
	await storageService.uploadAvatar({
		prefix: CDN_PREFIX,
		key: 'metadata.json',
		body: new TextEncoder().encode(metadataJson),
	});
	const metadataUri = `${Config.endpoints.staticCdn}/${CDN_PREFIX}/metadata.json`;
	console.log(`  uploaded metadata JSON -> ${metadataUri}`);
	console.log(`  on-chain uri byte length: ${new TextEncoder().encode(metadataUri).length}`);

	const {collectionAddress, txSignature} = await createCollectionNft({
		name: 'Multiverse Cosmetics',
		uri: metadataUri,
	});

	console.log('');
	console.log('Collection created successfully.');
	console.log(`  collection_address: ${collectionAddress}`);
	console.log(`  tx_signature:       ${txSignature}`);
	console.log('');
	console.log('Save the collection_address above into COSMETICS_COLLECTION_ADDRESS.');
}

main().catch((err) => {
	console.error('Failed to create cosmetics collection:', err);
	process.exitCode = 1;
});
