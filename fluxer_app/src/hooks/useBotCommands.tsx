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

import type {BotCommand} from '@app/hooks/useCommands';
import type {ChannelRecord} from '@app/records/ChannelRecord';
import BotCommandStore from '@app/stores/BotCommandStore';
import GuildMemberStore from '@app/stores/GuildMemberStore';
import UserStore from '@app/stores/UserStore';
import {useEffect, useMemo, useSyncExternalStore} from 'react';

/**
 * Derives the set of candidate bot user ids present in a channel — guild
 * members flagged `bot` for a guild channel, or `bot` recipients for a
 * DM/group DM — mirroring the guild-vs-DM split `useTextareaAutocomplete`
 * already uses for `canUseCommand`/`canViewChannel`.
 */
function getCandidateBotUserIds(channel: ChannelRecord | null): Array<string> {
	if (!channel) {
		return [];
	}

	if (channel.guildId) {
		return GuildMemberStore.getMembers(channel.guildId)
			.filter((member) => member.user.bot)
			.map((member) => member.user.id);
	}

	return channel.recipientIds.filter((userId) => UserStore.getUser(userId)?.bot === true);
}

export function useBotCommands(channel: ChannelRecord | null): Array<BotCommand> {
	const botUserIds = useMemo(() => getCandidateBotUserIds(channel), [channel]);
	const botUserIdsToken = botUserIds.join(',');

	const version = useSyncExternalStore(BotCommandStore.subscribe.bind(BotCommandStore), () => BotCommandStore.version);

	useEffect(() => {
		// botUserIdsToken (a stable string proxy for botUserIds' contents) is the
		// real dependency here; botUserIds itself is a fresh array each render.
		for (const botUserId of botUserIds) {
			void BotCommandStore.ensureFetched(botUserId);
		}
	}, [botUserIdsToken]);

	return useMemo(() => {
		// version is read only to subscribe this memo to BotCommandStore updates.
		void version;

		return botUserIds.flatMap((botUserId) =>
			BotCommandStore.getCommands(botUserId).map(
				(command): BotCommand => ({
					type: 'bot',
					name: `/${command.name}`,
					description: command.description,
					botUserId,
					options: command.options,
				}),
			),
		);
	}, [botUserIdsToken, version]);
}
