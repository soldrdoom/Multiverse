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

import type {ChannelRecord} from '@app/records/ChannelRecord';
import type {GuildRecord} from '@app/records/GuildRecord';
import ChannelStore from '@app/stores/ChannelStore';
import GuildStore from '@app/stores/GuildStore';
import MediaEngineStore from '@app/stores/voice/MediaEngineFacade';
import {useMemo} from 'react';

export interface ConnectedVoiceSession {
	guildId: string | null;
	channelId: string | null;
	channel: ChannelRecord | null;
	guild: GuildRecord | null;
	isConnected: boolean;
}

export const useConnectedVoiceSession = (): ConnectedVoiceSession => {
	const channelId = MediaEngineStore.channelId;
	const guildId = MediaEngineStore.guildId;

	const channel = useMemo(() => (channelId ? (ChannelStore.getChannel(channelId) ?? null) : null), [channelId]);
	const guild = useMemo(() => (guildId ? (GuildStore.getGuild(guildId) ?? null) : null), [guildId]);

	return {
		channel,
		channelId,
		guild,
		guildId,
		isConnected: Boolean(channel),
	};
};
