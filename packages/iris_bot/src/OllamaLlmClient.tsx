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

import type {ConversationTurn, LlmClient} from './LlmClient';

const CONTEXT_WINDOW_TOKENS = 8192;

interface OllamaChatResponse {
	message?: {content?: string};
}

export class OllamaLlmClient implements LlmClient {
	constructor(
		private readonly baseUrl: string,
		private readonly model: string,
		private readonly systemPrompt: string,
	) {}

	async generateReply(history: ReadonlyArray<ConversationTurn>, newMessage: string): Promise<string> {
		const res = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				model: this.model,
				stream: false,
				options: {num_ctx: CONTEXT_WINDOW_TOKENS},
				messages: [{role: 'system', content: this.systemPrompt}, ...history, {role: 'user', content: newMessage}],
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Ollama request failed: ${res.status} ${body}`);
		}

		const data = (await res.json()) as OllamaChatResponse;
		return data.message?.content ?? '';
	}
}
