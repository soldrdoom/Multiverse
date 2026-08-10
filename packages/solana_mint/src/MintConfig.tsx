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
 * Independent Solana RPC/config surface for on-demand cosmetics NFT minting.
 *
 * DELIBERATELY does not import from `@fluxer/solana_das/src/SolanaNetwork` (the
 * `SOLANA_NETWORK` devnet|mainnet-beta switch shared by SIWS auth, tokengating,
 * DAS NFT lookups, vanity purchases, and tips). That switch has already caused
 * two production incidents from being flipped underneath live features. Minting
 * is devnet-only for the foreseeable future and must never be affected by (or
 * accidentally affect) `SOLANA_NETWORK` — so it gets its own env vars, read only
 * here, and every other module in this package must go through this file rather
 * than reading `process.env` directly.
 */

/** RPC endpoint used ONLY for minting/collection-setup/ownership-verification. Independent of SOLANA_NETWORK. */
export const COSMETICS_MINT_RPC_URL: string = process.env['COSMETICS_MINT_RPC_URL'] || 'https://api.devnet.solana.com';

/**
 * DAS (Digital Asset Standard) endpoint used ONLY to enumerate a wallet's *current* cosmetics
 * holdings (`GET /cosmetics/owned-nfts`) — mirrors `SOLANA_DAS_URL`'s role for the mainnet path
 * (`fluxer_server`'s `GET /v1/nfts`), but pointed at whatever cluster the cosmetics-mint pipeline
 * actually mints onto (devnet, per this file's header comment), not at `SOLANA_NETWORK`.
 *
 * Deliberately has NO hardcoded default, unlike `COSMETICS_MINT_RPC_URL`/`COSMETICS_PAYMENT_RPC_URL`
 * above — those two are plain unauthenticated Solana JSON-RPC, which `api.devnet.solana.com` serves
 * for free, but DAS's `getAssetsByOwner` method requires a DAS-capable provider (Helius/Shyft/
 * QuickNode) with an API key baked into the URL; there is no free public default to fall back to
 * (see `SOLANA_DAS_URL` in `@fluxer/solana_das/src/SolanaNetwork`, which follows the same
 * null-when-unset convention for the identical reason). Until this is set, `GET /cosmetics/owned-nfts`
 * degrades to returning an empty list rather than erroring — see `CosmeticsController.tsx`.
 *
 * IMPORTANT: verified live (2026-08-09/10) that Helius's devnet DAS endpoint correctly indexes
 * Metaplex Core assets for `getAssetsByOwner`/`getAsset` — `interface: "MplCoreAsset"`,
 * `ownership.owner`, and `grouping: [{group_key: "collection", group_value: ...}]` all came back
 * correct for a real devnet-minted cosmetic. HOWEVER: DAS's *off-chain* metadata resolution
 * (`content.files`/`content.links.image`/`content.metadata.attributes`, populated by DAS crawling
 * the asset's `json_uri`) was still empty for that same asset well after mint confirmation — only
 * the on-chain fields (interface/ownership/grouping) were reliably populated. Do NOT depend on
 * DAS-resolved image/name/attributes for cosmetics display data; use `grouping`'s collection value
 * to join back to this deployment's own `cosmetic_listings` (which already has the authoritative
 * name/image/cosmetic_type/rarity for every asset in that collection) instead. This is exactly why
 * `CosmeticsController.tsx`'s owned-nfts route uses `fetchGatingAssetsForWallet`/`parseDasAssetForGating`
 * (mint + collection only, never drops an asset for missing display metadata) rather than
 * `parseDasAsset` (drops any asset it can't resolve an image for — which would have silently
 * excluded every devnet cosmetic from this endpoint).
 */
export const COSMETICS_DAS_URL: string | null = process.env['COSMETICS_DAS_URL'] || null;

/**
 * Whether `COSMETICS_MINT_RPC_URL` currently points at devnet, based on a simple substring check
 * of the configured URL (anything not containing `devnet` is treated as mainnet/non-devnet — there
 * is no separate testnet mode for this pipeline). This is deliberately NOT derived from
 * `SOLANA_NETWORK` (see this file's header comment) — it exists purely so client-facing code can
 * decide whether to prefer the cosmetics-minted-items ownership path
 * (`GET /cosmetics/owned-nfts`, verified live against this exact RPC) over the mainnet-only DAS
 * `GET /v1/nfts` path, which can never see anything minted while this pipeline is devnet-pinned.
 */
export function isCosmeticsMintingOnDevnet(): boolean {
	return COSMETICS_MINT_RPC_URL.includes('devnet');
}

/** Receive-only treasury wallet for cosmetics-shop platform revenue. No private key exists in this codebase. */
export const COSMETICS_TREASURY_WALLET: string | null = process.env['COSMETICS_TREASURY_WALLET'] || null;

/** Public address of the mint authority wallet (informational / for cross-checking the configured secret key). */
export const COSMETICS_MINT_AUTHORITY_PUBKEY: string | null = process.env['COSMETICS_MINT_AUTHORITY_PUBKEY'] || null;

/**
 * Mint authority's secret key, user-supplied via env var — never generated, logged, or hardcoded here.
 * Accepts either a JSON array of bytes (`solana-keygen`'s default export format, e.g. `[12,34,...]`) or a
 * base58-encoded string (the format `solana-keygen`'s `--outfile -` / most wallet "export private key" UIs use).
 * When unset, minting is simply inert — see `isMintingConfigured()`.
 */
export const COSMETICS_MINT_AUTHORITY_SECRET_KEY: string | null =
	process.env['COSMETICS_MINT_AUTHORITY_SECRET_KEY'] || null;

/**
 * The Multiverse Cosmetics Collection NFT address, produced once by
 * `packages/api/scripts/setupCosmeticsCollection.ts` and then saved into this
 * env var for every subsequent mint to verify against. Minting works without it
 * (items just aren't attached to a collection), but collection-verified items
 * are what makes the marketplace's items visibly a matched set in wallets/explorers.
 */
export const COSMETICS_COLLECTION_ADDRESS: string | null = process.env['COSMETICS_COLLECTION_ADDRESS'] || null;

/** Whether server-side minting is usable on this deployment. False in prod until a mint authority key is deliberately provisioned. */
export function isMintingConfigured(): boolean {
	return COSMETICS_MINT_AUTHORITY_SECRET_KEY !== null;
}
