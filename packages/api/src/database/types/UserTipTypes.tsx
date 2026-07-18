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

/**
 * A direct SOL tip from one user to another, sent from the user profile
 * popout. Primary key is tx_signature itself — the on-chain signature is
 * already globally unique, so it doubles as the anti-replay guard (no
 * separate lookup table needed, unlike guild vanity purchases which key off
 * a generated purchase_id instead).
 */
export interface UserTipRow {
	tx_signature: string;
	sender_user_id: UserID;
	recipient_user_id: UserID;
	sender_wallet_address: string;
	recipient_wallet_address: string;
	amount_lamports: number;
	fee_lamports: number;
	sol_price_usd_at_tip: number;
	created_at: Date;
}

export const USER_TIP_COLUMNS = [
	'tx_signature',
	'sender_user_id',
	'recipient_user_id',
	'sender_wallet_address',
	'recipient_wallet_address',
	'amount_lamports',
	'fee_lamports',
	'sol_price_usd_at_tip',
	'created_at',
] as const satisfies ReadonlyArray<keyof UserTipRow>;
