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
import type {ApplicationCommandRow} from '@fluxer/api/src/database/types/ApplicationCommandTypes';

export interface IApplicationCommandRepository {
	listForBotUser(botUserId: UserID): Promise<Array<ApplicationCommandRow>>;
	/**
	 * Replace the full set of commands registered for a bot's user id in one
	 * partition write: rows whose name is not present in `rows` are deleted,
	 * the rest are upserted. Callers are expected to have already diffed
	 * against the existing set so an unchanged re-registration is a cheap
	 * no-op (an empty batch executes nothing).
	 */
	replaceAllForBotUser(botUserId: UserID, rows: Array<ApplicationCommandRow>): Promise<void>;
	deleteAllForBotUser(botUserId: UserID): Promise<void>;
}
