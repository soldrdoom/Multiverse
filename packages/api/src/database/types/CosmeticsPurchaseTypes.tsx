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

import type {UserID} from '@fluxer/api/src/BrandedTypes';

export type CosmeticsPurchaseStatus = 'pending' | 'paid' | 'minted' | 'failed';

/**
 * A single cosmetics-shop purchase attempt — created (status 'pending') when the
 * buyer requests an invoice, then transitioned to 'paid' once the on-chain SOL
 * payment (split creator/platform) is verified, and finally to 'minted' once the
 * NFT has been minted to the buyer's wallet (or left at 'paid' forever if minting
 * isn't configured on this deployment — see COSMETICS_MINT_AUTHORITY_SECRET_KEY).
 * Primary key: purchase_id (UUID).
 */
export interface CosmeticsPurchaseRow {
	purchase_id: string;
	/** Catalog item ID — a CosmeticListingRow.id (creator listings only; seed catalog items aren't purchasable). */
	item_id: string;
	buyer_user_id: UserID;
	/** Buyer's Solana wallet — the SOL payer and NFT mint destination. Set once payment is verified. */
	buyer_address: string | null;
	creator_id: number;
	/** Creator's payout wallet at invoice time (snapshotted — a creator's payout wallet can change later). */
	creator_wallet: string;
	creator_lamports: number;
	/** Platform/treasury wallet at invoice time (COSMETICS_TREASURY_WALLET). */
	platform_wallet: string;
	platform_lamports: number;
	/** Confirmed Solana transaction signature for the SOL payment. Set once payment is verified. */
	tx_signature: string | null;
	status: CosmeticsPurchaseStatus;
	/** Mint address of the minted NFT. Set only once minting succeeds. */
	mint_address: string | null;
	created_at: Date;
	paid_at: Date | null;
	minted_at: Date | null;
}

export const COSMETICS_PURCHASE_COLUMNS = [
	'purchase_id',
	'item_id',
	'buyer_user_id',
	'buyer_address',
	'creator_id',
	'creator_wallet',
	'creator_lamports',
	'platform_wallet',
	'platform_lamports',
	'tx_signature',
	'status',
	'mint_address',
	'created_at',
	'paid_at',
	'minted_at',
] as const satisfies ReadonlyArray<keyof CosmeticsPurchaseRow>;

/**
 * Lookup index: tx_signature → purchase_id. Enforces one purchase record per
 * on-chain transaction, mirroring GuildVanityPurchaseByTxSignatureRow — the same
 * signature can't be replayed across purchases (or reused after one already paid).
 */
export interface CosmeticsPurchaseByTxSignatureRow {
	tx_signature: string;
	purchase_id: string;
}

export const COSMETICS_PURCHASE_BY_TX_SIGNATURE_COLUMNS = [
	'tx_signature',
	'purchase_id',
] as const satisfies ReadonlyArray<keyof CosmeticsPurchaseByTxSignatureRow>;
