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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';

const logger = new Logger('UserTipActionCreators');

export interface UserTipTarget {
	recipient_wallet: string;
	platform_wallet: string;
	fee_lamports: number;
	fee_usd: number;
	recent_blockhash: string;
	sol_price_usd: number;
}

export async function fetchTipTarget(userId: string): Promise<UserTipTarget> {
	try {
		const response = await http.get<UserTipTarget>(Endpoints.USER_TIP_TARGET(userId));
		return response.body;
	} catch (error) {
		logger.error(`Failed to fetch tip target for user ${userId}:`, error);
		throw error;
	}
}

export async function verifyTip(userId: string, txSignature: string): Promise<void> {
	try {
		await http.post(Endpoints.USER_TIP_VERIFY(userId), {tx_signature: txSignature});
		logger.debug(`Verified tip to user ${userId}`);
	} catch (error) {
		logger.error(`Failed to verify tip to user ${userId}:`, error);
		throw error;
	}
}
