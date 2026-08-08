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
