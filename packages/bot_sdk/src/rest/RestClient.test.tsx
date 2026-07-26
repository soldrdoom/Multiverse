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

import {describe, expect, it} from 'vitest';
import {FluxerApiError} from '../Errors';
import {RestClient} from './RestClient';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json', ...headers},
	});
}

interface RecordedRequest {
	url: string;
	method: string | undefined;
	authorization: string | null;
	body: string | undefined;
}

function makeClient(
	responses: Array<() => Response>,
	options: {tokenType?: 'bot' | 'session'} = {},
): {client: RestClient; requests: Array<RecordedRequest>} {
	const requests: Array<RecordedRequest> = [];
	let call = 0;
	const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		requests.push({
			url: String(input),
			method: init?.method,
			authorization: headers.get('Authorization'),
			body: typeof init?.body === 'string' ? init.body : undefined,
		});
		const next = responses[Math.min(call, responses.length - 1)];
		call += 1;
		if (!next) throw new Error('No response scripted');
		return next();
	}) as typeof fetch;
	const client = new RestClient({
		apiBaseUrl: 'https://example.test/api',
		token: 'token-value',
		tokenType: options.tokenType ?? 'bot',
		fetchImpl,
		sleep: async () => {},
	});
	return {client, requests};
}

describe('RestClient', () => {
	it('sends Authorization: Bot <token> for tokenType bot', async () => {
		const {client, requests} = makeClient([() => jsonResponse(200, {id: '1'})]);
		await client.request('GET', '/users/@me');
		expect(requests[0]?.authorization).toBe('Bot token-value');
	});

	it('sends the raw token for tokenType session (the I.R.I.S. escape hatch)', async () => {
		const {client, requests} = makeClient([() => jsonResponse(200, {id: '1'})], {tokenType: 'session'});
		await client.request('GET', '/users/@me');
		expect(requests[0]?.authorization).toBe('token-value');
	});

	it('substitutes and encodes path params', async () => {
		const {client, requests} = makeClient([() => jsonResponse(200, {})]);
		await client.request('GET', '/channels/{channel_id}', {params: {channel_id: '123'}});
		expect(requests[0]?.url).toBe('https://example.test/api/channels/123');
	});

	it('throws FluxerApiError carrying the API error code', async () => {
		const {client} = makeClient([
			() => jsonResponse(403, {code: 'MISSING_PERMISSIONS', message: 'Missing permissions.'}),
		]);
		const error = await client
			.request('GET', '/channels/{channel_id}', {params: {channel_id: '1'}})
			.catch((e: FluxerApiError) => e);
		expect(error).toBeInstanceOf(FluxerApiError);
		expect((error as FluxerApiError).code).toBe('MISSING_PERMISSIONS');
		expect((error as FluxerApiError).status).toBe(403);
	});

	it('retries GET on 5xx up to maxRetries', async () => {
		const {client, requests} = makeClient([
			() => jsonResponse(502, {code: 'BAD_GATEWAY', message: 'bad'}),
			() => jsonResponse(502, {code: 'BAD_GATEWAY', message: 'bad'}),
			() => jsonResponse(200, {ok: true}),
		]);
		const result = await client.request<{ok: boolean}>('GET', '/users/@me');
		expect(result.ok).toBe(true);
		expect(requests.length).toBe(3);
	});

	it('never blind-retries POST on 5xx (no duplicate message sends)', async () => {
		const {client, requests} = makeClient([() => jsonResponse(500, {code: 'INTERNAL_SERVER_ERROR', message: 'boom'})]);
		const error = await client
			.request('POST', '/channels/{channel_id}/messages', {params: {channel_id: '1'}, body: {content: 'hi'}})
			.catch((e: FluxerApiError) => e);
		expect(error).toBeInstanceOf(FluxerApiError);
		expect((error as FluxerApiError).status).toBe(500);
		expect(requests.length).toBe(1);
	});

	it('surfaces an exhausted 429 as FluxerApiError RATE_LIMITED', async () => {
		const {client} = makeClient([
			() => jsonResponse(429, {code: 'RATE_LIMITED', message: 'slow down', retry_after: 0}, {'Retry-After': '0'}),
		]);
		const error = await client.request('GET', '/users/@me').catch((e: FluxerApiError) => e);
		expect(error).toBeInstanceOf(FluxerApiError);
		expect((error as FluxerApiError).code).toBe('RATE_LIMITED');
	});
});
