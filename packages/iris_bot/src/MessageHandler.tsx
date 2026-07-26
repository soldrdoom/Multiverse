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

/**
 * The message-sending contract this handler was written against (the deleted
 * local RestClient's `sendMessage`). index.tsx adapts @fluxer/bot_sdk to this
 * interface so the handler's logic stays untouched.
 */
export interface MessageSender {
	sendMessage(apiBaseUrl: string, channelId: string, content: string): Promise<void>;
}

interface MessageCreatePayload {
	channel_id: string;
	guild_id?: string;
	author: {id: string; bot?: boolean};
	content: string;
	encrypted_content?: string | null;
}

const BOT_TEASE_INTERVAL = 5;
const BOT_TEASE_LINES = [
	'(psst — bots are coming soon to Multiverse 🤖)',
	'(small teaser: a public bot API is on the way for Multiverse)',
	'(bot support is coming soon, by the way)',
];

// I.R.I.S. doesn't discuss the platform beyond this canned deflection — with
// no model behind it there is nothing to hallucinate, but the deflection stays
// so platform questions get a consistent, deliberate answer.
const PLATFORM_KEYWORDS = [
	'multiverse',
	'self-host',
	'self host',
	'selfhost',
	'whitepaper',
	'white paper',
	'roadmap',
	'tokenomics',
	'plutonium',
	'identity vault',
	'bot api',
	'agplv3',
	'agpl',
	'csam',
];
const PLATFORM_DEFLECTION =
	"I can't get into that right now — ask my creator directly! Happy to chat about anything else though.";

// The LLM was removed for now (2026-07-26): every non-platform DM gets this
// fixed line instead of a generated reply. Guild messages get no reply at all —
// a canned bot answering every public message would be noise.
const LIGHTWEIGHT_REPLY =
	"I'm running in lightweight mode right now, so I can't hold a real conversation — but I'm still here, and smarter days are coming!";

function mentionsPlatform(content: string): boolean {
	const lower = content.toLowerCase();
	return PLATFORM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export class MessageHandler {
	private readonly replyCounts = new Map<string, number>();

	constructor(
		private readonly botUserId: string,
		private readonly apiBaseUrl: string,
		private readonly restClient: MessageSender,
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
		if (message.author.bot) return;

		// DM-only while in lightweight mode: guild traffic is read but never
		// answered.
		if (message.guild_id) return;

		if (!message.content) {
			if (message.encrypted_content) {
				this.log.info({channelId: message.channel_id}, 'Skipping end-to-end encrypted message, cannot read content');
			}
			return;
		}

		this.log.info({channelId: message.channel_id}, 'Replying to message');

		let reply = mentionsPlatform(message.content) ? PLATFORM_DEFLECTION : LIGHTWEIGHT_REPLY;
		reply = this.maybeAppendBotTease(message.channel_id, reply);

		await this.restClient.sendMessage(this.apiBaseUrl, message.channel_id, reply);
	}

	private maybeAppendBotTease(channelId: string, reply: string): string {
		const count = (this.replyCounts.get(channelId) ?? 0) + 1;
		this.replyCounts.set(channelId, count);

		if (count % BOT_TEASE_INTERVAL !== 0) return reply;
		if (reply.toLowerCase().includes('bot')) return reply;

		const tease = BOT_TEASE_LINES[Math.floor(Math.random() * BOT_TEASE_LINES.length)];
		return `${reply}\n\n${tease}`;
	}
}
