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
	readonly token: string;
	readonly tokenType: 'bot' | 'session';
	readonly instanceBaseUrl: string;
	readonly healthPort: number;
}

export function loadConfig(): IrisConfig {
	// Phase 1.6b: when IRIS_BOT_TOKEN is set, I.R.I.S. runs as a real bot
	// application. The IRIS_AUTH_TOKEN session path is the permanent rollback
	// (plan risk H2): unset the bot token and the old account comes back.
	const botToken = process.env.IRIS_BOT_TOKEN;
	if (botToken) {
		return {
			token: botToken,
			tokenType: 'bot',
			instanceBaseUrl: process.env.IRIS_INSTANCE_BASE_URL ?? 'https://multiverse.forum',
			healthPort: Number(process.env.PORT ?? 8080),
		};
	}
	return {
		token: requireEnv('IRIS_AUTH_TOKEN'),
		tokenType: 'session',
		instanceBaseUrl: process.env.IRIS_INSTANCE_BASE_URL ?? 'https://multiverse.forum',
		healthPort: Number(process.env.PORT ?? 8080),
	};
}
