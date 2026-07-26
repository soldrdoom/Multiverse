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

/**
 * Endpoint discovery. `GET <instanceBaseUrl>/.well-known/fluxer` is a real,
 * unauthenticated route (fluxer_server/src/Routes.tsx:552, spec operation
 * `get_well_known_fluxer`) whose `endpoints` block carries the REST base and
 * gateway WebSocket URL. Verified live against https://multiverse.forum:
 * `endpoints.api = <base>/api` (no version segment) and
 * `endpoints.gateway = wss://<host>/gateway`.
 *
 * If the document is unreachable we fall back to deriving the same shape from
 * the instance base URL, which matches what production publishes today.
 */

export interface ResolvedEndpoints {
	/** REST base URL, e.g. `https://multiverse.forum/api`. */
	api: string;
	/** Gateway WebSocket URL, e.g. `wss://multiverse.forum/gateway`. */
	gateway: string;
}

interface WellKnownDocument {
	endpoints?: {
		api?: string;
		gateway?: string;
	};
}

function stripTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function deriveEndpoints(instanceBaseUrl: string): ResolvedEndpoints {
	const base = stripTrailingSlash(instanceBaseUrl);
	return {
		api: `${base}/api`,
		gateway: `${base.replace(/^http/, 'ws')}/gateway`,
	};
}

export async function resolveEndpoints(
	instanceBaseUrl: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ResolvedEndpoints> {
	const base = stripTrailingSlash(instanceBaseUrl);
	try {
		const response = await fetchImpl(`${base}/.well-known/fluxer`, {
			headers: {Accept: 'application/json'},
		});
		if (!response.ok) {
			return deriveEndpoints(instanceBaseUrl);
		}
		const document = (await response.json()) as WellKnownDocument;
		const api = document.endpoints?.api;
		const gateway = document.endpoints?.gateway;
		if (typeof api === 'string' && typeof gateway === 'string') {
			return {api: stripTrailingSlash(api), gateway};
		}
		return deriveEndpoints(instanceBaseUrl);
	} catch {
		return deriveEndpoints(instanceBaseUrl);
	}
}
