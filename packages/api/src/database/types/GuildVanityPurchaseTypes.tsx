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

import type {GuildID, UserID} from '@fluxer/api/src/BrandedTypes';

export type GuildVanityPurchaseStatus = 'pending' | 'confirmed' | 'failed';

/**
 * A guild's paid, permanent custom vanity invite link — SOL-only, $1.99, one-time.
 * Primary key: (guild_id, purchase_id). A guild can have multiple rows (e.g. an
 * abandoned pending attempt followed by a confirmed one) — the confirmed one is
 * what ultimately grants GuildFeatures.VANITY_URL.
 */
export interface GuildVanityPurchaseRow {
	guild_id: GuildID;
	purchase_id: string;
	purchaser_user_id: UserID;
	tx_signature: string | null;
	payer_wallet_address: string | null;
	amount_lamports: number;
	sol_price_usd_at_purchase: number;
	usd_amount: number;
	vanity_code: string | null;
	status: GuildVanityPurchaseStatus;
	created_at: Date;
	confirmed_at: Date | null;
}

export const GUILD_VANITY_PURCHASE_COLUMNS = [
	'guild_id',
	'purchase_id',
	'purchaser_user_id',
	'tx_signature',
	'payer_wallet_address',
	'amount_lamports',
	'sol_price_usd_at_purchase',
	'usd_amount',
	'vanity_code',
	'status',
	'created_at',
	'confirmed_at',
] as const satisfies ReadonlyArray<keyof GuildVanityPurchaseRow>;

/**
 * Lookup index: tx_signature → (guild_id, purchase_id). Enforces one purchase
 * record per on-chain transaction, so the same signature can't be replayed
 * across guilds or reused after a purchase already confirmed.
 */
export interface GuildVanityPurchaseByTxSignatureRow {
	tx_signature: string;
	guild_id: GuildID;
	purchase_id: string;
}

export const GUILD_VANITY_PURCHASE_BY_TX_SIGNATURE_COLUMNS = [
	'tx_signature',
	'guild_id',
	'purchase_id',
] as const satisfies ReadonlyArray<keyof GuildVanityPurchaseByTxSignatureRow>;
