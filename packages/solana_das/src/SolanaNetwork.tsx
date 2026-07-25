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
 * Single source of truth for which Solana cluster this deployment talks to.
 * Every server-side RPC call (blockhash, transaction lookup, balance, the
 * public-RPC NFT fallback, tokengate verification) should go through
 * SOLANA_RPC_URL here rather than hardcoding a cluster URL, so flipping
 * networks is a one-variable change.
 */
export const SOLANA_NETWORK: 'devnet' | 'mainnet-beta' =
	process.env['SOLANA_NETWORK'] === 'devnet' ? 'devnet' : 'mainnet-beta';

export const SOLANA_RPC_URL: string =
	SOLANA_NETWORK === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';

/** The DAS (Digital Asset Standard) JSON-RPC endpoint, e.g. Helius/Shyft/QuickNode. Enables cNFT support. */
export const SOLANA_DAS_URL: string | null = process.env['SOLANA_DAS_URL'] || null;
