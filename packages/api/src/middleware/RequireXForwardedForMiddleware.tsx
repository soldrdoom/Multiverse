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
import {Logger} from '@fluxer/api/src/Logger';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {stripApiPrefix} from '@fluxer/api/src/utils/RequestPathUtils';
import {ProxyHeadersRequiredError} from '@fluxer/errors/src/domains/core/ProxyHeadersRequiredError';
import {extractClientIpDetails} from '@fluxer/ip_utils/src/ClientIp';
import {createMiddleware} from 'hono/factory';

interface RequireXForwardedForOptions {
	exemptPaths?: Array<string>;
	/**
	 * Injected so the enforcing branch is reachable from tests without mocking the Config module.
	 * Both default to reading Config lazily, i.e. at request time, not at middleware construction.
	 */
	isEnforced?: () => boolean;
	trustCfConnectingIp?: () => boolean;
}

const defaultExemptPaths: Array<string> = [
	'/_health',
	'/webhooks/livekit',
	'/test',
	'/connections/bluesky/client-metadata.json',
	'/connections/bluesky/jwks.json',
];

/**
 * Rejects requests that did not arrive through the reverse proxy.
 *
 * The guard is "can we determine a client IP the same way every IP-keyed control does", not "is the
 * literal X-Forwarded-For header present". Those differ: `extractClientIpDetails` prefers `X-Real-IP`
 * (unforgeable, because `proxy_set_header` REPLACES) and only falls back to the rightmost
 * `X-Forwarded-For` entry, so a proxy that sets X-Real-IP and nothing else is legitimate and must
 * pass, while a syntactically present but unparseable header must not.
 *
 * Off unless `proxy.require_forwarded_for` is explicitly enabled — see the schema description in
 * `packages/config/src/schema/defs/instance.json`. When it is off this middleware is a no-op and the
 * only thing keeping the app from seeing header-less traffic is the network path to its port.
 *
 * Registered ahead of `IpBanMiddleware` in `packages/api/src/app/MiddlewarePipeline.tsx`, because that
 * middleware fails open on an unresolvable IP; see the comment there.
 */
export function RequireXForwardedForMiddleware({
	exemptPaths = defaultExemptPaths,
	isEnforced = () => !Config.dev.testModeEnabled && Config.proxy.require_forwarded_for,
	trustCfConnectingIp = () => Config.proxy.trust_cf_connecting_ip,
}: RequireXForwardedForOptions = {}) {
	return createMiddleware<HonoEnv>(async (ctx, next) => {
		if (!isEnforced()) {
			await next();
			return;
		}

		const path = stripApiPrefix(ctx.req.path);
		// Segment-bounded, not a bare prefix: `/test` must exempt `/test/reset` but NOT `/testfoo`.
		// Every current entry is either an exact path (`/webhooks/livekit`, the bluesky documents) or a
		// real directory (`/test/...`), so this is strictly a tightening.
		if (exemptPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
			await next();
			return;
		}

		const extracted = extractClientIpDetails(ctx.req.raw, {trustCfConnectingIp: trustCfConnectingIp()});
		if (extracted === null) {
			// This is the only record of the rejection that carries request detail: the guard now runs
			// ahead of MetricsMiddleware (see MiddlewarePipeline), so a rejected request never reaches
			// those counters. Header presence is logged as booleans rather than values — the values are
			// caller-controlled and may be personal data.
			Logger.warn(
				{
					method: ctx.req.method,
					path,
					hasForwardedFor: ctx.req.header('x-forwarded-for') !== undefined,
					hasRealIp: ctx.req.header('x-real-ip') !== undefined,
				},
				'Rejected request without a proxy-set client IP header',
			);
			// A `MultiverseError` subclass, NOT `hono/http-exception`. `packages/api` resolves hono@4.0.0
			// and `packages/errors` (home of `AppErrorHandler`) resolves hono@4.11.9, so an `HTTPException`
			// thrown from here is not an `instanceof` the `HTTPException` the handler checks against, and
			// the rejection rendered as a 500 in the assembled server while unit tests — which build a bare
			// Hono app with no `onError` — saw a correct 403. See ProxyHeadersRequiredError's doc comment.
			throw new ProxyHeadersRequiredError();
		}

		await next();
	});
}
