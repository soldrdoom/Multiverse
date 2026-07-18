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
import type {UserTipRow} from '@fluxer/api/src/database/types/UserTipTypes';
import {UserTipRepository} from '@fluxer/api/src/user/repositories/UserTipRepository';
import type {IUserRepositoryAggregate} from '@fluxer/api/src/user/repositories/IUserRepositoryAggregate';
import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';

export class UserTipService {
	private readonly tipRepository = new UserTipRepository();

	constructor(private readonly userRepository: IUserRepositoryAggregate) {}

	/** Resolves the recipient's linked wallet so fluxer_server can quote a fee and build the transfer. */
	async getTipTarget(params: {senderUserId: UserID; recipientUserId: UserID}): Promise<{
		recipientWalletAddress: string;
	}> {
		const {senderUserId, recipientUserId} = params;
		if (senderUserId === recipientUserId) {
			throw InputValidationError.fromCode('user_id', ValidationErrorCodes.TIP_SELF_NOT_ALLOWED);
		}

		const recipientWalletAddress = await this.userRepository.findSolanaAddressByUserId(recipientUserId);
		if (!recipientWalletAddress) {
			throw InputValidationError.fromCode('user_id', ValidationErrorCodes.TIP_RECIPIENT_HAS_NO_WALLET);
		}

		return {recipientWalletAddress};
	}

	/** Records an on-chain-verified tip. `fluxer_server` has already confirmed both transfers landed before calling this. */
	async recordTip(params: {
		senderUserId: UserID;
		recipientUserId: UserID;
		txSignature: string;
		senderWalletAddress: string;
		recipientWalletAddress: string;
		amountLamports: number;
		feeLamports: number;
		solPriceUsd: number;
	}): Promise<{ok: true}> {
		const row: UserTipRow = {
			tx_signature: params.txSignature,
			sender_user_id: params.senderUserId,
			recipient_user_id: params.recipientUserId,
			sender_wallet_address: params.senderWalletAddress,
			recipient_wallet_address: params.recipientWalletAddress,
			amount_lamports: params.amountLamports,
			fee_lamports: params.feeLamports,
			sol_price_usd_at_tip: params.solPriceUsd,
			created_at: new Date(),
		};

		const {applied} = await this.tipRepository.recordTip(row);
		if (!applied) {
			throw InputValidationError.fromCode('tx_signature', ValidationErrorCodes.TIP_TX_ALREADY_USED);
		}

		return {ok: true};
	}
}
