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
 * Thrown by POST /users/@me/solana-wallet when the wallet's ownership was verified
 * successfully but the address is already linked to a *different* account. Re-linking
 * the same address to the same account is a no-op success, not this error.
 */
export class SolanaWalletAlreadyLinkedError extends ConflictError {
	constructor() {
		super({
			code: APIErrorCodes.SOLANA_WALLET_ALREADY_LINKED,
			message: 'This wallet is already linked to another account.',
		});
	}
}
