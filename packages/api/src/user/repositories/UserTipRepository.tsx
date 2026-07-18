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

import {executeConditional} from '@fluxer/api/src/database/Cassandra';
import type {UserTipRow} from '@fluxer/api/src/database/types/UserTipTypes';
import {UserTips} from '@fluxer/api/src/Tables';

export class UserTipRepository {
	/** Atomically records a tip — tx_signature is the primary key, so this doubles as the anti-replay guard. */
	async recordTip(row: UserTipRow): Promise<{applied: boolean}> {
		return executeConditional(UserTips.insertIfNotExists(row));
	}
}
