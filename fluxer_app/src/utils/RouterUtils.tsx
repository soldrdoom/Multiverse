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

import {Logger} from '@app/lib/Logger';
import {createBrowserHistory} from '@app/lib/router/History';
import type {HistoryAdapter} from '@app/lib/router/RouterTypes';

const logger = new Logger('RouterUtils');

export const history: HistoryAdapter | null = createBrowserHistory();

export function transitionTo(path: string) {
	logger.info('transitionTo', path);
	if (history) {
		const current = history.getLocation().url.pathname;
		if (current === path) return;
		history.push(new URL(path, window.location.origin));
	}
}

export function replaceWith(path: string) {
	logger.info('replaceWith', path);
	if (history) {
		const current = history.getLocation().url.pathname;
		if (current === path) return;
		history.replace(new URL(path, window.location.origin));
	}
}

/**
 * Hands a signed-out visitor to the marketing front page, which is this instance's sign-in surface.
 *
 * This must be a full document navigation, not a router transition: marketing is a separate
 * server-rendered app that owns `/`, and the SPA's own `/` route only exists to bounce authenticated
 * users into the client. Using `replaceWith('/')` here would re-enter that route and land the user
 * back on `/login`, which is the loop this replaced.
 *
 * `redirectTo` is where the visitor was actually trying to go. It survives as a query param so the
 * marketing sign-in can return them there instead of stranding them on the front page. Only
 * same-origin paths are forwarded — anything else is dropped rather than becoming an open redirect.
 */
export function redirectToMarketingSignIn(redirectTo?: string | null): void {
	const target = sanitizeSameOriginPath(redirectTo);
	const url = target === null ? '/' : `/?redirect_to=${encodeURIComponent(target)}`;
	logger.info('redirectToMarketingSignIn', url);
	window.location.assign(url);
}

function sanitizeSameOriginPath(rawPath: string | null | undefined): string | null {
	if (!rawPath) return null;
	// Reject anything that could leave the origin: absolute URLs, protocol-relative `//evil.com`,
	// and backslash variants that some browsers normalise into a host.
	if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.startsWith('/\\')) return null;
	try {
		const resolved = new URL(rawPath, window.location.origin);
		if (resolved.origin !== window.location.origin) return null;
		// Re-check after normalisation: '/..//evil.example.com' passes the raw-prefix test above but
		// URL() resolves it to the protocol-relative '//evil.example.com'.
		if (resolved.pathname.charAt(1) === '/') return null;
		// Sending someone back to the sign-in surface after signing in is a loop, not a destination.
		if (resolved.pathname === '/' || resolved.pathname === '/login' || resolved.pathname === '/register') {
			return null;
		}
		return `${resolved.pathname}${resolved.search}${resolved.hash}`;
	} catch {
		return null;
	}
}

export function getHistory() {
	return history;
}
