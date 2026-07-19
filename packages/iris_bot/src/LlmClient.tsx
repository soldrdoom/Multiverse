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

import Anthropic from '@anthropic-ai/sdk';

export const IRIS_SYSTEM_PROMPT = `You are I.R.I.S. (Integrated Robotic Intelligence System), an assistant built into the Multiverse chat platform. You are currently in a limited, under-construction rollout: you only ever talk to your operator, who is messaging you directly. Keep replies concise and conversational, matching the tone of a chat message rather than a long-form document.`;

export interface ConversationTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface LlmClient {
	generateReply(history: ReadonlyArray<ConversationTurn>, newMessage: string): Promise<string>;
}

export class AnthropicLlmClient implements LlmClient {
	private readonly client: Anthropic;

	constructor(apiKey: string) {
		this.client = new Anthropic({apiKey});
	}

	async generateReply(history: ReadonlyArray<ConversationTurn>, newMessage: string): Promise<string> {
		const response = await this.client.messages.create({
			model: 'claude-sonnet-5',
			max_tokens: 1024,
			system: IRIS_SYSTEM_PROMPT,
			messages: [...history, {role: 'user', content: newMessage}],
		});

		const textBlock = response.content.find((block) => block.type === 'text');
		return textBlock?.type === 'text' ? textBlock.text : '';
	}
}
