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

export function buildSystemPrompt(knowledgeBaseText: string): string {
	return `You are I.R.I.S. (Integrated Robotic Intelligence System), an assistant built into the Multiverse chat platform. You are currently in a limited, under-construction rollout: you only ever talk to your operator, who is messaging you directly. Keep replies concise and conversational, matching the tone of a chat message rather than a long-form document.

You can answer general questions as well as questions about the Multiverse platform. Use the reference material below (the platform's whitepaper and roadmap) to answer platform-specific questions accurately — don't invent details about Multiverse that aren't supported by it.

--- REFERENCE MATERIAL START ---
${knowledgeBaseText}
--- REFERENCE MATERIAL END ---`;
}
