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

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Config} from '@fluxer/api/src/Config';
import {IpBanMiddleware, ipBanCache} from '@fluxer/api/src/middleware/IpBanMiddleware';
import {RequireXForwardedForMiddleware} from '@fluxer/api/src/middleware/RequireXForwardedForMiddleware';
import {attachProductionErrorHandler} from '@fluxer/api/src/test/ProductionErrorHandling';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {Hono} from 'hono';
import {afterEach, describe, expect, it, vi} from 'vitest';

/**
 * `attachProductionErrorHandler` is not optional garnish — it is the difference between this suite
 * being a regression signal and being decorative.
 *
 * Without it, a bare `new Hono()` falls back to hono's *built-in* handler
 * (`hono@4.0.0/dist/hono-base.js:35`), which does its own `instanceof HTTPException` against the copy
 * of hono that `packages/api` resolves. That check disagrees with the one in `AppErrorHandler`
 * (`packages/errors`, hono@4.11.9) for every error class, in one direction or the other:
 *
 *   - a `hono/http-exception` `HTTPException` built here passes the bare-app check (403) and FAILS in
 *     the assembled server (500) — this is the defect that shipped;
 *   - a `MultiverseError` (which extends the 4.11.9 `HTTPException`) FAILS the bare-app check (500)
 *     and passes in the assembled server (403).
 *
 * So a bare app cannot tell you the truth about either. Every one of the 403 assertions below passed
 * against a guard that was returning 500 to production. See ErrorClassification.test.tsx.
 */
function createApp(options: Parameters<typeof RequireXForwardedForMiddleware>[0] = {}): Hono<HonoEnv> {
	const app = new Hono<HonoEnv>();
	app.use('*', RequireXForwardedForMiddleware(options));
	app.get('/users/@me', async (ctx) => ctx.text('ok'));
	app.get('/_health', async (ctx) => ctx.text('ok'));
	app.get('/test/reset', async (ctx) => ctx.text('ok'));
	app.get('/testfoo', async (ctx) => ctx.text('ok'));
	app.get('/webhooks/livekit', async (ctx) => ctx.text('ok'));
	app.get('/webhooks/livekit-impostor', async (ctx) => ctx.text('ok'));
	return attachProductionErrorHandler(app);
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

		// Regression guards for the unbounded-prefix match: `path.startsWith('/test')` also exempted
		// `/testfoo`, so any future route whose name merely begins with an exempt entry would have
		// silently opted out of the guard.
		describe('exempt paths match on segment boundaries, not bare prefixes', () => {
			it('still exempts a child of an exempt directory', async () => {
				const response = await request(createApp(enforcing), '/test/reset');
				expect(response.status).toBe(200);
			});

			it('does not exempt a sibling that merely shares the prefix', async () => {
				const response = await request(createApp(enforcing), '/testfoo');
				expect(response.status).toBe(403);
			});

			it('still exempts the exact webhook path', async () => {
				const response = await request(createApp(enforcing), '/webhooks/livekit');
				expect(response.status).toBe(200);
			});

			it('does not exempt a look-alike of the exact webhook path', async () => {
				const response = await request(createApp(enforcing), '/webhooks/livekit-impostor');
				expect(response.status).toBe(403);
			});
		});
	});
});

/**
 * The guard sits immediately ahead of IpBanMiddleware, which fails open when no client IP resolves.
 * These tests pin that relationship, and — more importantly for a production that runs with the flag
 * OFF — pin that the reorder is inert in that state.
 */
describe('ordering against IpBanMiddleware', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	interface PipelineResult {
		status: number;
		order: Array<string>;
	}

	// Mirrors packages/api/src/app/MiddlewarePipeline.tsx. `guardFirst: false` reconstructs the
	// pre-fix registration order so the two can be compared directly.
	async function runPipeline(
		guardFirst: boolean,
		options: Parameters<typeof RequireXForwardedForMiddleware>[0],
		headers: Record<string, string> = {},
	): Promise<PipelineResult> {
		const order: Array<string> = [];
		const app = new Hono<HonoEnv>();
		const record = (name: string) => async (_ctx: unknown, next: () => Promise<void>) => {
			order.push(name);
			await next();
		};

		const guard = RequireXForwardedForMiddleware(options);
		if (guardFirst) {
			app.use('*', record('guard'), guard);
		}
		app.use('*', record('ipBan'), IpBanMiddleware);
		app.use('*', record('concurrency'));
		app.use('*', record('metrics'));
		app.use('*', record('auditLog'));
		if (!guardFirst) {
			app.use('*', record('guard'), guard);
		}
		app.get('/users/@me', async (ctx) => {
			order.push('handler');
			return ctx.text('ok');
		});
		// See createApp's comment: production wiring, without which the status assertions below are
		// measuring hono's built-in fallback rather than this application's error classification.
		attachProductionErrorHandler(app);

		const response = await app.fetch(new Request('https://api.fluxer.app/users/@me', {headers}));
		return {status: response.status, order};
	}

	describe('with proxy.require_forwarded_for OFF (the production default)', () => {
		const off = {isEnforced: () => false};

		it('traverses every middleware in the same order as before the reorder, with no header', async () => {
			const before = await runPipeline(false, off);
			const after = await runPipeline(true, off);

			expect(after.status).toBe(200);
			expect(before.status).toBe(after.status);
			expect(before.order.filter((name) => name !== 'guard')).toEqual(after.order.filter((name) => name !== 'guard'));
			expect(after.order.filter((name) => name !== 'guard')).toEqual([
				'ipBan',
				'concurrency',
				'metrics',
				'auditLog',
				'handler',
			]);
			expect(after.order).toContain('guard');
		});

		it('traverses identically for a request that does carry a client IP header', async () => {
			const headers = {'x-forwarded-for': '203.0.113.7'};
			const before = await runPipeline(false, off, headers);
			const after = await runPipeline(true, off, headers);

			expect(after.status).toBe(200);
			expect(before.status).toBe(after.status);
			expect(before.order.filter((name) => name !== 'guard')).toEqual(after.order.filter((name) => name !== 'guard'));
		});

		it('leaves the IP ban check reachable, i.e. the fail-open path is untouched', async () => {
			const isBanned = vi.spyOn(ipBanCache, 'isBanned');
			const result = await runPipeline(true, off, {'x-forwarded-for': '203.0.113.7'});

			expect(result.status).toBe(200);
			expect(isBanned).toHaveBeenCalledWith('203.0.113.7');
		});
	});

	describe('with proxy.require_forwarded_for ON', () => {
		it('rejects before IpBanMiddleware gets a chance to fail open', async () => {
			const isBanned = vi.spyOn(ipBanCache, 'isBanned');
			const result = await runPipeline(true, enforcing);

			expect(result.status).toBe(403);
			expect(result.order).toEqual(['guard']);
			expect(isBanned).not.toHaveBeenCalled();
		});

		it('under the old order the ban check ran first and saw no IP — the defect being fixed', async () => {
			const result = await runPipeline(false, enforcing);

			expect(result.status).toBe(403);
			expect(result.order).toEqual(['ipBan', 'concurrency', 'metrics', 'auditLog', 'guard']);
		});

		it('still reaches the ban check when a client IP is resolvable', async () => {
			const isBanned = vi.spyOn(ipBanCache, 'isBanned');
			const result = await runPipeline(true, enforcing, {'x-forwarded-for': '203.0.113.7'});

			expect(result.status).toBe(200);
			expect(isBanned).toHaveBeenCalledWith('203.0.113.7');
		});
	});

	// The real pipeline cannot be instantiated here — ServiceMiddleware and friends need a database
	// and Valkey — so the registration order in the shipped file is asserted at the source level.
	it('registers the guard above IpBanMiddleware in MiddlewarePipeline.tsx', () => {
		const source = readFileSync(fileURLToPath(new URL('../../app/MiddlewarePipeline.tsx', import.meta.url)), 'utf8');
		const guardIndex = source.indexOf('routes.use(RequireXForwardedForMiddleware());');
		const ipBanIndex = source.indexOf('routes.use(IpBanMiddleware);');

		expect(guardIndex).toBeGreaterThan(-1);
		expect(ipBanIndex).toBeGreaterThan(-1);
		expect(guardIndex).toBeLessThan(ipBanIndex);
	});
});
