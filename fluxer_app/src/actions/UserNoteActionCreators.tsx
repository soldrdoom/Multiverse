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

const logger = new Logger('Notes');

export async function update(userId: string, note: string | null): Promise<void> {
	try {
		await http.put({url: Endpoints.USER_NOTE(userId), body: {note}});
		logger.debug(`Updated note for user ${userId} to ${note ? 'new value' : 'null'}`);
	} catch (error) {
		logger.error(`Failed to update note for user ${userId}:`, error);
		throw error;
	}
}
