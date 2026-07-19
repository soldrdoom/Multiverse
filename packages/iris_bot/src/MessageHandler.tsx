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

import type {Logger} from 'pino';
import {ConversationStore} from './ConversationStore';
import type {LlmClient} from './LlmClient';
import type {RestClient} from './RestClient';

interface MessageCreatePayload {
	channel_id: string;
	guild_id?: string;
	author: {id: string; bot?: boolean};
	content: string;
	encrypted_content?: string | null;
}

export class MessageHandler {
	private readonly conversations = new ConversationStore();

	constructor(
		private readonly ownerUserId: string,
		private readonly botUserId: string,
		private readonly apiBaseUrl: string,
		private readonly restClient: RestClient,
		private readonly llmClient: LlmClient,
		private readonly log: Logger,
	) {}

	handleDispatch(eventType: string, data: unknown): void {
		if (eventType !== 'MESSAGE_CREATE') return;
		this.handleMessageCreate(data as MessageCreatePayload).catch((err) => {
			this.log.error({err}, 'Failed to handle MESSAGE_CREATE');
		});
	}

	private async handleMessageCreate(message: MessageCreatePayload): Promise<void> {
		if (message.author.id === this.botUserId) return;
		if (message.author.id !== this.ownerUserId) return;

		if (!message.content) {
			if (message.encrypted_content) {
				this.log.info({channelId: message.channel_id}, 'Skipping end-to-end encrypted message, cannot read content');
			}
			return;
		}

		this.log.info({channelId: message.channel_id, guildId: message.guild_id}, 'Replying to owner message');

		const history = this.conversations.getHistory(message.channel_id);
		const reply = await this.llmClient.generateReply(history, message.content);
		if (!reply) return;

		this.conversations.append(message.channel_id, {role: 'user', content: message.content});
		this.conversations.append(message.channel_id, {role: 'assistant', content: reply});

		await this.restClient.sendMessage(this.apiBaseUrl, message.channel_id, reply);
	}
}
