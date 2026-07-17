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

import GuildMemberStore from '@app/stores/GuildMemberStore';
import type {GatewayHandlerContext} from '@app/stores/gateway/handlers';
import TypingStore from '@app/stores/TypingStore';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';

interface TypingStartPayload {
	channel_id: string;
	user_id: string;
	guild_id?: string;
	member?: GuildMemberData;
}

export function handleTypingStart(data: TypingStartPayload, _context: GatewayHandlerContext): void {
	if (data.guild_id && data.member) {
		GuildMemberStore.handleMemberAdd(data.guild_id, data.member);
	}
	TypingStore.startTyping(data.channel_id, data.user_id);
}
