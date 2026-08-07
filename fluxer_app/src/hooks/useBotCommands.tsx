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
	// Deliberately NOT `useMemo(..., [channel])`: `channel`'s object identity
	// only changes when the channel record itself is replaced (e.g. a new
	// message arrives, bumping last_message_id) — not when GuildMemberStore
	// (guild channels) or UserStore (DMs), which getCandidateBotUserIds reads,
	// finish an async load *after* this component has already mounted and
	// rendered once. Caching this behind an unrelated `channel` dependency
	// silently freezes `botUserIds` at whatever it computed on the very first
	// render — usually `[]`, since guild member data hasn't hydrated yet — and
	// it never recomputes again: the enclosing `observer()` (ChannelTextarea)
	// only re-tracks the MobX observables it actually reads during a given
	// render, so skipping this read via a stale memo drops GuildMemberStore/
	// UserStore from that tracking, and future updates to either store stop
	// triggering re-renders entirely. Confirmed live: opening a channel and
	// immediately typing `/sol`/`/mass` sent the literal text instead of
	// firing the interaction, because `GET .../application-commands` never
	// fired until an unrelated channel-reference change (e.g. the fallback
	// plain-text message itself arriving) forced a fresh render, by which
	// point the same keystroke sequence had already submitted. Recomputing on
	// every render is cheap (a filter over already-loaded arrays) and
	// restores correct reactivity.
	const botUserIds = getCandidateBotUserIds(channel);
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
