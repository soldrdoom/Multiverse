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
import {BatchBuilder, fetchMany} from '@fluxer/api/src/database/Cassandra';
import type {ApplicationCommandRow} from '@fluxer/api/src/database/types/ApplicationCommandTypes';
import type {IApplicationCommandRepository} from '@fluxer/api/src/oauth/repositories/IApplicationCommandRepository';
import {ApplicationCommands} from '@fluxer/api/src/Tables';

const SELECT_COMMANDS_BY_BOT_USER_CQL = ApplicationCommands.selectCql({
	where: ApplicationCommands.where.eq('bot_user_id'),
});

export class ApplicationCommandRepository implements IApplicationCommandRepository {
	async listForBotUser(botUserId: UserID): Promise<Array<ApplicationCommandRow>> {
		return fetchMany<ApplicationCommandRow>(SELECT_COMMANDS_BY_BOT_USER_CQL, {bot_user_id: botUserId});
	}

	async replaceAllForBotUser(botUserId: UserID, rows: Array<ApplicationCommandRow>): Promise<void> {
		const existing = await this.listForBotUser(botUserId);
		const incomingNames = new Set(rows.map((row) => row.name));

		const batch = new BatchBuilder();
		for (const existingRow of existing) {
			if (!incomingNames.has(existingRow.name)) {
				batch.addPrepared(ApplicationCommands.deleteByPk({bot_user_id: botUserId, name: existingRow.name}));
			}
		}
		for (const row of rows) {
			batch.addPrepared(ApplicationCommands.upsertAll(row));
		}

		await batch.execute();
	}

	async deleteAllForBotUser(botUserId: UserID): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationCommands.deletePartition({bot_user_id: botUserId}));
		await batch.execute();
	}
}
