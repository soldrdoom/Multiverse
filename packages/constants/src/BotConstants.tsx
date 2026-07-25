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

import {PublicUserFlags} from '@fluxer/constants/src/UserConstants';

export const ApplicationFlags = {} as const;

export const APPLICATION_MAX_TAGS = 5;

export const APPLICATION_DESCRIPTION_MAX_LENGTH = 400;

/**
 * Tags are a controlled vocabulary rather than free text because they are the
 * index a future bot directory will be browsed by. Free-text tags cannot be
 * grouped, filtered, or moderated at scale. Adding a tag here is deliberate.
 */
export type ApplicationTag =
	| 'ai'
	| 'economy'
	| 'fun'
	| 'games'
	| 'moderation'
	| 'music'
	| 'productivity'
	| 'social'
	| 'utility'
	| 'web3';

export const ApplicationTags: ReadonlyArray<ApplicationTag> = [
	'ai',
	'economy',
	'fun',
	'games',
	'moderation',
	'music',
	'productivity',
	'social',
	'utility',
	'web3',
] as const;

export const ApplicationTagDescriptions: Record<ApplicationTag, string> = {
	ai: 'Assistants, language models, and generative tooling',
	economy: 'Currencies, trading, and reward systems',
	fun: 'Entertainment and novelty commands',
	games: 'Games and game-adjacent integrations',
	moderation: 'Moderation, anti-spam, and safety tooling',
	music: 'Music playback and audio',
	productivity: 'Scheduling, reminders, and workflow tooling',
	social: 'Profiles, levelling, and community engagement',
	utility: 'General-purpose helpers and information lookup',
	web3: 'Wallets, tokens, NFTs, and on-chain integrations',
};

export const BotFlags = {
	FRIENDLY_BOT: PublicUserFlags.FRIENDLY_BOT,
	FRIENDLY_BOT_MANUAL_APPROVAL: PublicUserFlags.FRIENDLY_BOT_MANUAL_APPROVAL,
} as const;

export const BotFlagsDescriptions: Record<keyof typeof BotFlags, string> = {
	FRIENDLY_BOT: 'Bot accepts friend requests from users',
	FRIENDLY_BOT_MANUAL_APPROVAL: 'Bot requires manual approval for friend requests',
};
