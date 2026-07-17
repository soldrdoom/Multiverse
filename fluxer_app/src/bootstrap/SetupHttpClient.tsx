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

import HttpClient from '@app/lib/HttpClient';
import SessionManager from '@app/lib/SessionManager';
import SudoPromptStore from '@app/stores/SudoPromptStore';
import SudoStore from '@app/stores/SudoStore';

export function setupHttpClient(): void {
	HttpClient.setAuthTokenProvider(() => SessionManager.token);

	SudoStore.init();
	SudoPromptStore.init();
}
