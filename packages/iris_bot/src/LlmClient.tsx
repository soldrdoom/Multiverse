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

export interface ConversationTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface LlmClient {
	generateReply(history: ReadonlyArray<ConversationTurn>, newMessage: string): Promise<string>;
}

export const IRIS_SYSTEM_PROMPT = `You are I.R.I.S. (Integrated Robotic Intelligence System), an assistant built into the Multiverse chat platform. You talk with anyone messaging you on the server. Keep replies concise and conversational, matching the tone of a chat message rather than a long-form document.

You do not discuss the Multiverse platform itself — its features, architecture, roadmap, tokens, self-hosting, or any technical or business details. If asked about the platform, say you can't get into that right now and steer the conversation back to something general. Stick to ordinary conversation otherwise: answer questions, chat casually, help with whatever the person brings up, as long as it isn't about Multiverse itself.`;
