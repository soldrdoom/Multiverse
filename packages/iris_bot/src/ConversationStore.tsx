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

import type {ConversationTurn} from './LlmClient';

const MAX_TURNS_PER_USER = 5;

function key(channelId: string, authorId: string): string {
	return `${channelId}:${authorId}`;
}

export class ConversationStore {
	private readonly byUser = new Map<string, Array<ConversationTurn>>();

	getHistory(channelId: string, authorId: string): ReadonlyArray<ConversationTurn> {
		return this.byUser.get(key(channelId, authorId)) ?? [];
	}

	append(channelId: string, authorId: string, turn: ConversationTurn): void {
		const k = key(channelId, authorId);
		const history = this.byUser.get(k) ?? [];
		history.push(turn);
		// Compact rather than slide: once a user's history fills up, drop it and
		// start fresh instead of trimming the oldest turn, so it never grows unbounded.
		this.byUser.set(k, history.length > MAX_TURNS_PER_USER ? [turn] : history);
	}
}
