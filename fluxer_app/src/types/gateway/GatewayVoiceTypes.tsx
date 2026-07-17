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

import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';

export interface VoiceState {
	guild_id: string;
	channel_id: string | null;
	user_id: string;
	connection_id: string;
	is_mobile?: boolean;
	mute: boolean;
	deaf: boolean;
	self_mute: boolean;
	self_deaf: boolean;
	self_video: boolean;
	self_stream: boolean;
	viewer_stream_keys?: Array<string> | null;
	suppress: boolean;
	member?: GuildMemberData;
}

export interface CallVoiceState {
	user_id: string;
	channel_id?: string | null;
	session_id?: string;
	self_mute?: boolean;
	self_deaf?: boolean;
	self_video?: boolean;
	self_stream?: boolean;
}
