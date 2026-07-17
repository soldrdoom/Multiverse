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

import type {PresenceRecord} from '@app/types/gateway/GatewayPresenceTypes';
import type {VoiceState} from '@app/types/gateway/GatewayVoiceTypes';
import type {Channel} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import type {GuildEmoji, GuildSticker} from '@fluxer/schema/src/domains/guild/GuildEmojiSchemas';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';
import type {Guild} from '@fluxer/schema/src/domains/guild/GuildResponseSchemas';
import type {GuildRole} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';

export type GuildReadyData = Readonly<{
	id: string;
	properties: Omit<Guild, 'roles'>;
	channels: ReadonlyArray<Channel>;
	emojis: ReadonlyArray<GuildEmoji>;
	stickers?: ReadonlyArray<GuildSticker>;
	members: ReadonlyArray<GuildMemberData>;
	member_count: number;
	presences?: ReadonlyArray<PresenceRecord>;
	voice_states?: ReadonlyArray<VoiceState>;
	roles: ReadonlyArray<GuildRole>;
	joined_at: string;
	unavailable?: boolean;
}>;
