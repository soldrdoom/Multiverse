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

import {Logger} from '@fluxer/api/src/Logger';
import type {User} from '@fluxer/api/src/models/User';
import {getUserSearchService} from '@fluxer/api/src/SearchFactory';

export class UserSearchRepository {
	async indexUser(user: User): Promise<void> {
		const userSearchService = getUserSearchService();
		if (userSearchService && 'indexUser' in userSearchService) {
			await userSearchService.indexUser(user).catch((error) => {
				Logger.error({userId: user.id, error}, 'Failed to index user in search');
			});
		}
	}

	async updateUser(user: User): Promise<void> {
		const userSearchService = getUserSearchService();
		if (userSearchService && 'updateUser' in userSearchService) {
			await userSearchService.updateUser(user).catch((error) => {
				Logger.error({userId: user.id, error}, 'Failed to update user in search');
			});
		}
	}
}
