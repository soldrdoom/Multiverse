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

import {Config} from '@fluxer/api/src/Config';
import {RequireXForwardedForMiddleware} from '@fluxer/api/src/middleware/RequireXForwardedForMiddleware';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {Hono} from 'hono';
import {describe, expect, it} from 'vitest';

function createApp(options: Parameters<typeof RequireXForwardedForMiddleware>[0] = {}): Hono<HonoEnv> {
	const app = new Hono<HonoEnv>();
	app.use('*', RequireXForwardedForMiddleware(options));
	app.get('/users/@me', async (ctx) => ctx.text('ok'));
	app.get('/_health', async (ctx) => ctx.text('ok'));
	return app;
}

async function request(app: Hono<HonoEnv>, path: string, headers: Record<string, string> = {}): Promise<Response> {
	return app.fetch(new Request(`https://api.fluxer.app${path}`, {headers}));
}

const enforcing = {isEnforced: () => true};

describe('RequireXForwardedForMiddleware', () => {
	describe('when proxy.require_forwarded_for is off', () => {
		it('lets a header-less request through', async () => {
			const response = await request(createApp({isEnforced: () => false}), '/users/@me');
			expect(response.status).toBe(200);
		});

		// Regression guard for the bug this middleware shipped with: `proxy.require_forwarded_for`
		// was read by Config but declared in neither ConfigSchema.json nor the generated Zod schema,
		// so zod stripped it, the value was always `undefined`, and `!undefined` short-circuited the
		// middleware for every request. The knob could not even be turned on from config.json.
		it('exposes require_forwarded_for as a real boolean on the parsed config', () => {
			expect(typeof Config.proxy.require_forwarded_for).toBe('boolean');
		});
	});

	describe('when proxy.require_forwarded_for is on', () => {
		it('rejects a request with no proxy-set client IP header', async () => {
			const response = await request(createApp(enforcing), '/users/@me');
			expect(response.status).toBe(403);
		});

		it('rejects a request whose X-Forwarded-For is present but empty', async () => {
			const response = await request(createApp(enforcing), '/users/@me', {'x-forwarded-for': '   '});
			expect(response.status).toBe(403);
		});

		it('rejects a request whose only client IP header is unparseable', async () => {
			const response = await request(createApp(enforcing), '/users/@me', {'x-forwarded-for': 'not-an-ip'});
			expect(response.status).toBe(403);
		});

		it('allows a request carrying X-Forwarded-For', async () => {
			const response = await request(createApp(enforcing), '/users/@me', {'x-forwarded-for': '203.0.113.7'});
			expect(response.status).toBe(200);
		});

		// The synthetic Request built by AuthLoginService for IP authorization sets X-Forwarded-For and
		// nothing else; a single-entry header must keep passing.
		it('allows a single-entry X-Forwarded-For like the IP-authorization synthetic request', async () => {
			const response = await request(createApp(enforcing), '/users/@me', {'X-Forwarded-For': '198.51.100.4'});
			expect(response.status).toBe(200);
		});

		// nginx sets X-Real-IP on every proxied location and proxy_set_header REPLACES, so this is the
		// unforgeable header and must satisfy the guard on its own.
		it('allows a request carrying only X-Real-IP', async () => {
			const response = await request(createApp(enforcing), '/users/@me', {'x-real-ip': '203.0.113.9'});
			expect(response.status).toBe(200);
		});

		it('allows CF-Connecting-IP only when Cloudflare is trusted', async () => {
			const untrusted = await request(createApp({...enforcing, trustCfConnectingIp: () => false}), '/users/@me', {
				'cf-connecting-ip': '203.0.113.11',
			});
			expect(untrusted.status).toBe(403);

			const trusted = await request(createApp({...enforcing, trustCfConnectingIp: () => true}), '/users/@me', {
				'cf-connecting-ip': '203.0.113.11',
			});
			expect(trusted.status).toBe(200);
		});

		it('exempts the health check path', async () => {
			const response = await request(createApp(enforcing), '/_health');
			expect(response.status).toBe(200);
		});

		it('exempts a configured prefix', async () => {
			const app = createApp({...enforcing, exemptPaths: ['/users']});
			const response = await request(app, '/users/@me');
			expect(response.status).toBe(200);
		});
	});
});
