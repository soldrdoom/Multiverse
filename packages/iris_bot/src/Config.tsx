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

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export interface IrisConfig {
	readonly botToken: string;
	readonly ownerUserId: string;
	readonly instanceBaseUrl: string;
	readonly ollamaBaseUrl: string;
	readonly ollamaModel: string;
	readonly healthPort: number;
}

export function loadConfig(): IrisConfig {
	return {
		botToken: requireEnv('IRIS_BOT_TOKEN'),
		ownerUserId: requireEnv('IRIS_OWNER_USER_ID'),
		instanceBaseUrl: process.env.IRIS_INSTANCE_BASE_URL ?? 'https://multiverse.forum',
		ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434',
		ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.2:3b',
		healthPort: Number(process.env.PORT ?? 8080),
	};
}
