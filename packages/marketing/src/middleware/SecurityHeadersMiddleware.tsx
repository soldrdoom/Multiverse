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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import type {MiddlewareHandler} from 'hono';
import {createMiddleware} from 'hono/factory';

/**
 * Baseline security headers for marketing-rendered responses.
 *
 * The app already emits a full CSP for its own routes, but marketing shipped none — and marketing is
 * the same origin as the app AND, since the in-app /login page was retired, the only sign-in surface
 * on the instance. That left the one page that takes wallet signatures framable by any origin: an
 * attacker could overlay a decoy and bait a click on the sign-in button.
 *
 * Deliberately NOT a full CSP. `script-src` would need nonces or hashes on the three inline scripts
 * the home page renders (see SiwsConnectScript / HomePageScript / NewsPopupScript), and getting that
 * wrong breaks sign-in for everyone. A policy containing only `frame-ancestors` is valid on its own
 * and closes the clickjacking exposure without touching those scripts — `script-src` is a separate,
 * larger change that should ship on its own.
 *
 * `frame-ancestors` is sent via CSP rather than only X-Frame-Options because XFO is legacy and has no
 * spec; both are set so older agents are covered too.
 */
export function securityHeadersMiddleware(): MiddlewareHandler {
	return createMiddleware(async (c, next) => {
		await next();

		// Never override a policy a downstream handler set deliberately.
		if (!c.res.headers.has('Content-Security-Policy')) {
			c.res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
		}
		if (!c.res.headers.has('X-Frame-Options')) {
			c.res.headers.set('X-Frame-Options', 'DENY');
		}
		if (!c.res.headers.has('X-Content-Type-Options')) {
			c.res.headers.set('X-Content-Type-Options', 'nosniff');
		}
		if (!c.res.headers.has('Referrer-Policy')) {
			c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		}
	});
}
