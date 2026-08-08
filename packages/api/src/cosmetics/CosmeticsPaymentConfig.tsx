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
 * RPC endpoint used ONLY for cosmetics SOL-payment verification (blockhash fetch +
 * transaction polling in CosmeticsSolanaUtils.tsx).
 *
 * DELIBERATELY does not import from `@fluxer/solana_das/src/SolanaNetwork` (the
 * `SOLANA_NETWORK` devnet|mainnet-beta switch shared by SIWS auth, tokengating, DAS NFT
 * lookups, vanity purchases, and tips). That switch has already caused two production
 * incidents from being flipped underneath live features. While the cosmetics shop is
 * being hardened it needs to run its payment verification on devnet without affecting
 * (or being affected by) the mainnet-pinned `SOLANA_NETWORK` used by the rest of the live
 * site — so, mirroring `packages/solana_mint/src/MintConfig.tsx`'s `COSMETICS_MINT_RPC_URL`,
 * this gets its own env var, defaulted to the same devnet endpoint, read only here.
 */
export const COSMETICS_PAYMENT_RPC_URL: string =
	process.env['COSMETICS_PAYMENT_RPC_URL'] || 'https://api.devnet.solana.com';

/**
 * Receive-only platform wallet for the cosmetics shop's 10% cut of every sale.
 *
 * Deliberately its OWN env var — a NEW `COSMETICS_TREASURY_WALLET`, not a reuse of
 * `SOLANA_TREASURY_WALLET` (used by guild-vanity purchases, see
 * GuildVanityPurchaseService.tsx's `GUILD_VANITY_MERCHANT_WALLET`). Even though both
 * currently resolve to the same physical address, keeping cosmetics revenue on a
 * separately-named config knob means it can be pointed at a different wallet later
 * without touching (or accidentally affecting) vanity-purchase payment routing, and
 * keeps the two revenue streams independently auditable in the deployment config.
 *
 * No private key for this wallet exists anywhere in this codebase — it's purely a
 * payment destination, verified the same way vanity/tips are: by summing System
 * Program `transfer` instructions targeting this address in the confirmed
 * transaction (see CosmeticsSolanaUtils.tsx's `sumTransfersTo`), never by diffing a
 * balance — which matters because a buyer's own wallet could coincidentally be
 * (or later become) this address, and balance-delta verification breaks when payer
 * and destination coincide.
 */
export const COSMETICS_TREASURY_WALLET =
	process.env['COSMETICS_TREASURY_WALLET'] ?? '4iLSmzRJzm682ojiqM6xhNaWTAx6EpCcgypYh8srzrii';
