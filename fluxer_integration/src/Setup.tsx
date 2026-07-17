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

import {Config} from '@fluxer/integration/Config';
import {beforeAll} from 'vitest';

beforeAll(async () => {
	const response = await fetch(`${Config.apiUrl}/_health`, {
		headers: {'X-Forwarded-For': '127.0.0.1'},
	});
	if (!response.ok) {
		throw new Error('API health check failed - globalSetup should have started the server');
	}
});
