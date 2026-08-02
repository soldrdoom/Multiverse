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
 * Regression coverage for a whole class of defect, not just one middleware.
 *
 * `packages/api/package.json` pins `hono: 4.0.0` while every other workspace package — including
 * `packages/errors`, which owns `AppErrorHandler` — resolves the catalog's `4.11.9`. pnpm therefore
 * installs two copies (`node_modules/.pnpm/hono@4.0.0` and `hono@4.11.9`) and `packages/api` gets the
 * old one. An `HTTPException` constructed inside `packages/api` is consequently NOT an `instanceof`
 * the `HTTPException` that `AppErrorHandler` checks against (`ErrorHandlers.tsx:307`), so it falls
 * past every classification branch and renders as a generic 500.
 *
 * That shipped: `RequireXForwardedForMiddleware` threw `HTTPException(403)` and production returned
 * 500 with `INTERNAL_SERVER_ERROR` for header-less callers. Its 22-test suite asserted 403 and passed
 * the whole time, because it builds a bare `new Hono()` with no `onError` — Hono's *built-in* fallback
 * in `hono-base` does its own `instanceof` check against the 4.0.0 class, which of course succeeds.
 * The tests never crossed the version boundary, so they asserted behaviour the assembled server did
 * not produce.
 *
 * The fix for the tests is to wire `AppErrorHandler` exactly as `packages/api/src/App.tsx:58,67` does.
 * That single line makes the test process traverse the same two-module boundary as production.
 */

import {readdirSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RequireXForwardedForMiddleware} from '@fluxer/api/src/middleware/RequireXForwardedForMiddleware';
import {attachProductionErrorHandler} from '@fluxer/api/src/test/ProductionErrorHandling';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {AppErrorHandler} from '@fluxer/errors/src/domains/core/ErrorHandlers';
import {ProxyHeadersRequiredError} from '@fluxer/errors/src/domains/core/ProxyHeadersRequiredError';
import {IpBannedError} from '@fluxer/errors/src/domains/moderation/IpBannedError';
import {MultiverseError} from '@fluxer/errors/src/FluxerError';
import {Hono} from 'hono';
// Imported ONLY to prove the boundary below. This is the single allowlisted `hono/http-exception`
// import under `packages/api/src` — see the source-level guard at the bottom of this file.
import {HTTPException} from 'hono/http-exception';
import {beforeAll, describe, expect, it} from 'vitest';

/**
 * `MultiverseError extends HTTPException`, so the prototype of the class object IS the exact
 * `HTTPException` constructor that `packages/errors` (and therefore `AppErrorHandler`) uses. Comparing
 * it against the one `packages/api` resolves tells us at runtime whether the duplication is live,
 * without hardcoding a version number that a future dedupe would falsify.
 */
const errorsPackageHTTPException = Object.getPrototypeOf(MultiverseError) as typeof HTTPException;
const honoIsDuplicated = !(new HTTPException(403) instanceof errorsPackageHTTPException);

/** Mirrors the production wiring: routes, then `onError(AppErrorHandler)` (App.tsx:58). */
function createAppWithProductionErrorHandler(
	register: (app: Hono<HonoEnv>) => void,
): (path: string, headers?: Record<string, string>) => Promise<Response> {
	const app = new Hono<HonoEnv>();
	register(app);
	attachProductionErrorHandler(app);
	return async (requestPath, headers = {}) => app.fetch(new Request(`https://api.fluxer.app${requestPath}`, {headers}));
}

async function readBody(response: Response): Promise<{code?: string; message?: string}> {
	return (await response.json()) as {code?: string; message?: string};
}

describe('error classification through the real AppErrorHandler', () => {
	// Control: `IpBannedError` is the shape that has always rendered correctly in production, because
	// `MultiverseError` lives in `packages/errors` and so is a single class no matter who throws it.
	// If this test ever fails, the harness itself is wrong and nothing else in this file means anything.
	it('renders a MultiverseError thrown from packages/api at its own status and code', async () => {
		const request = createAppWithProductionErrorHandler((app) => {
			app.get('/users/@me', () => {
				throw new IpBannedError();
			});
		});

		const response = await request('/users/@me');
		expect(response.status).toBe(403);
		expect((await readBody(response)).code).toBe('IP_BANNED');
	});

	// The bug, executable. A raw hono `HTTPException` built inside `packages/api` cannot be classified
	// by a handler that lives in `packages/errors`. Written to stay honest if the versions are ever
	// aligned, rather than pinning 500 forever.
	it(
		honoIsDuplicated
			? 'degrades a raw hono HTTPException thrown from packages/api to 500 — the duplication is live'
			: 'renders a raw hono HTTPException at its own status — hono is no longer duplicated',
		async () => {
			const request = createAppWithProductionErrorHandler((app) => {
				app.get('/users/@me', () => {
					throw new HTTPException(403, {message: 'Forbidden'});
				});
			});

			const response = await request('/users/@me');
			expect(response.status).toBe(honoIsDuplicated ? 500 : 403);
			expect((await readBody(response)).code).toBe(honoIsDuplicated ? 'INTERNAL_SERVER_ERROR' : 'FORBIDDEN');
		},
	);

	// The direct regression test. This is the assertion that was missing: it fails on the shipped code
	// (500/INTERNAL_SERVER_ERROR) and passes on the fix, whereas the existing suite passed on both.
	it('renders the X-Forwarded-For guard rejection as 403 FORBIDDEN', async () => {
		const request = createAppWithProductionErrorHandler((app) => {
			app.use('*', RequireXForwardedForMiddleware({isEnforced: () => true}));
			app.get('/users/@me', (ctx) => ctx.text('ok'));
		});

		const response = await request('/users/@me');

		expect(response.status).toBe(403);
		const body = await readBody(response);
		expect(body.code).toBe('FORBIDDEN');
		expect(body.message).not.toBe('Internal server error.');
	});

	it('still lets a proxied request through the guard when the real handler is wired', async () => {
		const request = createAppWithProductionErrorHandler((app) => {
			app.use('*', RequireXForwardedForMiddleware({isEnforced: () => true}));
			app.get('/users/@me', (ctx) => ctx.text('ok'));
		});

		const response = await request('/users/@me', {'x-forwarded-for': '203.0.113.7'});
		expect(response.status).toBe(200);
	});

	// `AppErrorHandler` only calls `captureException` for errors that are neither `MultiverseError` nor
	// `isExpected`. Under the old `HTTPException` throw, every header-less probe was Sentry noise as
	// well as a wrong status; a `MultiverseError` is classified as expected and is not captured.
	it('classifies the guard rejection as an expected error, not an unhandled one', () => {
		expect(new ProxyHeadersRequiredError()).toBeInstanceOf(MultiverseError);
		expect(new ProxyHeadersRequiredError().status).toBe(403);
		expect(new ProxyHeadersRequiredError().code).toBe('FORBIDDEN');
	});
});

/**
 * Full-fidelity reproduction of the deployed topology.
 *
 * The tests above cross the boundary at the error handler. Production crosses it at the *router* too:
 * `fluxer_server/src/Routes.tsx:70` builds `new Hono()` from hono@4.11.9 and `:551` mounts this
 * package's app — a hono@4.0.0 instance — with `app.route('/api', apiService.app)`. So the request
 * that 500'd traversed a 4.11.9 outer router, a 4.0.0 sub-app, and a 4.11.9 error handler.
 *
 * The outer hono is resolved through `packages/errors`' own resolution rather than hardcoded, so this
 * keeps working (and quietly becomes a same-version mount) if `packages/api` is aligned to the catalog.
 */
describe('mounted into the outer router the way fluxer_server mounts it', () => {
	// Structurally typed rather than imported: this is deliberately the *other* copy of hono, which has
	// no shared type identity with the one this package imports. That mismatch is the subject under test,
	// so naming only the three members used keeps it out of the typechecker's way.
	interface OuterRouter {
		route: (path: string, app: unknown) => unknown;
		onError: (handler: unknown) => unknown;
		fetch: (request: Request) => Promise<Response>;
	}

	let OuterHono: new () => OuterRouter;

	beforeAll(async () => {
		const require = createRequire(fileURLToPath(new URL('../../../../errors/package.json', import.meta.url)));
		const outerHonoModule = (await import(require.resolve('hono'))) as {Hono: new () => OuterRouter};
		OuterHono = outerHonoModule.Hono;
	});

	it('returns 403 FORBIDDEN through a 4.11.9 outer router mounting this 4.0.0 sub-app', async () => {
		const inner = new Hono<HonoEnv>();
		inner.use('*', RequireXForwardedForMiddleware({isEnforced: () => true}));
		inner.get('/users/@me', (ctx) => ctx.text('ok'));
		attachProductionErrorHandler(inner);

		const outer = new OuterHono();
		outer.route('/api', inner);
		outer.onError(AppErrorHandler);

		const response: Response = await outer.fetch(new Request('https://api.fluxer.app/api/users/@me'));

		expect(response.status).toBe(403);
		expect(((await response.json()) as {code?: string}).code).toBe('FORBIDDEN');
	});

	it('still serves a proxied request through the same mount', async () => {
		const inner = new Hono<HonoEnv>();
		inner.use('*', RequireXForwardedForMiddleware({isEnforced: () => true}));
		inner.get('/users/@me', (ctx) => ctx.text('ok'));
		attachProductionErrorHandler(inner);

		const outer = new OuterHono();
		outer.route('/api', inner);
		outer.onError(AppErrorHandler);

		const response: Response = await outer.fetch(
			new Request('https://api.fluxer.app/api/users/@me', {headers: {'x-forwarded-for': '203.0.113.7'}}),
		);
		expect(response.status).toBe(200);
	});
});

/**
 * The structural half. The test above catches this one throw site; this catches the next one somebody
 * adds. While `packages/api` resolves a different hono than `packages/errors`, *any* `HTTPException`
 * thrown from this package is a latent 500 — so the package simply must not construct them. Typed
 * errors from `packages/errors` are the only correct mechanism here.
 *
 * If `packages/api` is ever aligned to the catalog hono this guard becomes unnecessary but stays
 * harmless, and the throwing style it enforces is the house pattern regardless.
 */
describe('no packages/api source imports hono/http-exception', () => {
	const apiSrc = fileURLToPath(new URL('../..', import.meta.url));

	// This file, which imports it deliberately to prove the boundary exists.
	const allowlist = new Set(['middleware/tests/ErrorClassification.test.tsx']);

	// Matches real module resolution only — static `from '…'`, bare side-effect `import '…'`, dynamic
	// `import('…')` and `require('…')`. Prose mentioning the specifier (there are explanatory comments
	// at the fixed throw sites) is not an offence.
	const importPattern = /(?:from|import|require)\s*\(?\s*['"]hono\/http-exception['"]/;

	it('has no un-allowlisted imports', () => {
		const offenders: Array<string> = [];

		for (const entry of readdirSync(apiSrc, {recursive: true, withFileTypes: true})) {
			if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) {
				continue;
			}

			const absolute = path.join(entry.parentPath, entry.name);
			const relative = path.relative(apiSrc, absolute).split(path.sep).join('/');
			if (allowlist.has(relative)) {
				continue;
			}

			if (importPattern.test(readFileSync(absolute, 'utf8'))) {
				offenders.push(relative);
			}
		}

		expect(offenders).toEqual([]);
	});
});
