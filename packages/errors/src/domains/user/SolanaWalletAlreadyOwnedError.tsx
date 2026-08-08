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

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ConflictError} from '@fluxer/errors/src/domains/core/ConflictError';

/**
 * Thrown by POST /users/@me/solana-wallet when the calling account already has a
 * *different* solana_address linked and the request is attempting to switch to a new
 * one. Wallet switching is intentionally unsupported for now (see SolanaAuthService.linkWallet
 * for why — the reverse-index cleanup this would require isn't safe to ship as a quick patch).
 * Re-linking the same address that's already on the account is unaffected — that stays a
 * no-op success.
 */
export class SolanaWalletAlreadyOwnedError extends ConflictError {
	constructor() {
		super({
			code: APIErrorCodes.SOLANA_WALLET_ALREADY_OWNED,
			message: 'Your account already has a linked wallet.',
		});
	}
}
