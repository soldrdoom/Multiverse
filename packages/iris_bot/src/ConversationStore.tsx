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

const MAX_TURNS_PER_CHANNEL = 20;

export class ConversationStore {
	private readonly byChannel = new Map<string, Array<ConversationTurn>>();

	getHistory(channelId: string): ReadonlyArray<ConversationTurn> {
		return this.byChannel.get(channelId) ?? [];
	}

	append(channelId: string, turn: ConversationTurn): void {
		const history = this.byChannel.get(channelId) ?? [];
		history.push(turn);
		while (history.length > MAX_TURNS_PER_CHANNEL) {
			history.shift();
		}
		this.byChannel.set(channelId, history);
	}
}
