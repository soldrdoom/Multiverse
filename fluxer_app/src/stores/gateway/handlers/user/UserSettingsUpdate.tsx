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

import GuildListStore from '@app/stores/GuildListStore';
import type {GatewayHandlerContext} from '@app/stores/gateway/handlers';
import UserSettingsStore from '@app/stores/UserSettingsStore';

interface UserSettingsPayload {
	flags: number;
	status: string;
	theme: string;
	time_format: number;
	guild_positions: Array<string>;
	locale: string;
}

export function handleUserSettingsUpdate(data: UserSettingsPayload, _context: GatewayHandlerContext): void {
	UserSettingsStore.updateUserSettings(data);
	GuildListStore.sortGuilds();
}
