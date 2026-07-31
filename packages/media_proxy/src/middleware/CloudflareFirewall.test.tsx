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

import type {LoggerInterface} from '@fluxer/logger/src/LoggerInterface';
import type {CloudflareEdgeIPService} from '@fluxer/media_proxy/src/lib/CloudflareEdgeIPService';
import {createCloudflareFirewall} from '@fluxer/media_proxy/src/middleware/CloudflareFirewall';
import type {HonoEnv} from '@fluxer/media_proxy/src/types/HonoEnv';
import {Hono} from 'hono';
import {describe, expect, it} from 'vitest';

const EDGE_IP = '198.51.100.1';
const NON_EDGE_IP = '203.0.113.9';

const noopLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	trace: () => {},
	child: () => noopLogger,
} as unknown as LoggerInterface;

const edgeIpService = {
	isFromCloudflareEdge: (ip: string) => ip === EDGE_IP,
} as unknown as CloudflareEdgeIPService;

function createApp(enabled = true): Hono<HonoEnv> {
	const app = new Hono<HonoEnv>();
	app.use('*', createCloudflareFirewall(edgeIpService, noopLogger, {enabled}));
	app.get('/image', async (ctx) => ctx.text('ok'));
	app.get('/_health', async (ctx) => ctx.text('ok'));
	return app;
}

async function request(app: Hono<HonoEnv>, path: string, headers: Record<string, string> = {}): Promise<Response> {
	return app.fetch(new Request(`https://media.fluxer.app${path}`, {headers}));
}

describe('createCloudflareFirewall', () => {
	it('is a no-op when disabled', async () => {
		const response = await request(createApp(false), '/image');
		expect(response.status).toBe(200);
	});

	it('exempts the health check path', async () => {
		const response = await request(createApp(), '/_health');
		expect(response.status).toBe(200);
	});

	it('rejects a request with no proxy-set client IP header', async () => {
		const response = await request(createApp(), '/image');
		expect(response.status).toBe(403);
	});

	// The bug this test exists for: the firewall used to take the LEFTMOST X-Forwarded-For entry.
	// X-Forwarded-For is append-only, so a caller could prefix a Cloudflare edge address and walk
	// straight through a check whose entire purpose is to prove the peer is a Cloudflare edge.
	it('does not accept an edge address that the caller prefixed onto X-Forwarded-For', async () => {
		const response = await request(createApp(), '/image', {'x-forwarded-for': `${EDGE_IP}, ${NON_EDGE_IP}`});
		expect(response.status).toBe(403);
	});

	it('accepts the edge address the proxy appended on the right', async () => {
		const response = await request(createApp(), '/image', {'x-forwarded-for': `${NON_EDGE_IP}, ${EDGE_IP}`});
		expect(response.status).toBe(200);
	});

	it('prefers X-Real-IP, which a reverse proxy replaces rather than appends', async () => {
		const spoofed = await request(createApp(), '/image', {
			'x-forwarded-for': `${EDGE_IP}, ${EDGE_IP}`,
			'x-real-ip': NON_EDGE_IP,
		});
		expect(spoofed.status).toBe(403);

		const genuine = await request(createApp(), '/image', {
			'x-forwarded-for': `${NON_EDGE_IP}, ${NON_EDGE_IP}`,
			'x-real-ip': EDGE_IP,
		});
		expect(genuine.status).toBe(200);
	});

	// CF-Connecting-IP carries the END USER's address, which is exactly the value that must never be
	// matched against edge ranges — otherwise the check passes for anyone who sends it.
	it('never trusts CF-Connecting-IP for the edge decision', async () => {
		const response = await request(createApp(), '/image', {
			'cf-connecting-ip': EDGE_IP,
			'x-real-ip': NON_EDGE_IP,
		});
		expect(response.status).toBe(403);
	});

	it('rejects a request whose only client IP header is unparseable', async () => {
		const response = await request(createApp(), '/image', {'x-forwarded-for': 'not-an-ip'});
		expect(response.status).toBe(403);
	});
});
