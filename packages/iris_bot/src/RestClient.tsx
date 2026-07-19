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

export interface WellKnownResponse {
	endpoints: {
		api: string;
		gateway: string;
	};
}

export class RestClient {
	constructor(
		private readonly instanceBaseUrl: string,
		private readonly botToken: string,
		private readonly log: Logger,
	) {}

	async fetchWellKnown(): Promise<WellKnownResponse> {
		const res = await fetch(`${this.instanceBaseUrl}/.well-known/fluxer`);
		if (!res.ok) {
			throw new Error(`Failed to fetch .well-known/fluxer: ${res.status}`);
		}
		return (await res.json()) as WellKnownResponse;
	}

	async sendMessage(apiBaseUrl: string, channelId: string, content: string): Promise<void> {
		const res = await fetch(`${apiBaseUrl}/channels/${channelId}/messages`, {
			method: 'POST',
			headers: {
				Authorization: `Bot ${this.botToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({content}),
		});

		if (!res.ok) {
			const body = await res.text();
			this.log.error({channelId, status: res.status, body}, 'Failed to send message');
		}
	}
}
