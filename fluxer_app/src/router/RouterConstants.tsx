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

import {Routes} from '@app/Routes';

const AUTO_REDIRECT_EXEMPT_PATHS = new Set<string>([
	Routes.RESET_PASSWORD,
	Routes.AUTHORIZE_IP,
	Routes.EMAIL_REVERT,
	Routes.VERIFY_EMAIL,
	Routes.OAUTH_AUTHORIZE,
	Routes.REPORT,
	Routes.SOLANA_ONBOARDING,
]);

const AUTO_REDIRECT_EXEMPT_PREFIXES = ['/invite/', '/gift/', '/theme/', '/oauth2/'];

/**
 * First path segment of every literal (non-templated) top-level route this app
 * registers. Derived from Routes.tsx rather than hand-duplicated, so a new
 * top-level route added there is automatically excluded from being treated as
 * a bare vanity code below — without this, a route like `/pending` could get
 * misidentified as someone's custom invite link.
 */
const RESERVED_TOP_LEVEL_SEGMENTS: ReadonlySet<string> = new Set(
	(Object.values(Routes) as ReadonlyArray<unknown>)
		.filter((value): value is string => typeof value === 'string')
		.map((path) => path.split('/').filter(Boolean)[0])
		.filter((segment): segment is string => Boolean(segment) && !segment.includes(':')),
);

/** 2-32 chars, alphanumeric + internal hyphens — matches the vanity code format guilds can set. */
const BARE_VANITY_CODE_PATTERN = /^\/([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)\/?$/i;

/**
 * True for a bare top-level path (e.g. `/official`) that's shaped like a guild
 * vanity code and isn't already claimed by a known route — the signal used to
 * render the invite-landing page in place at a root-level custom URL instead
 * of bouncing to /login, without needing every possible vanity code enumerated
 * up front (unresolvable codes still 404 inside that page, same as
 * /invite/:code today).
 */
export const isBareVanityCodePath = (pathname: string): boolean => {
	const match = BARE_VANITY_CODE_PATTERN.exec(pathname);
	if (!match) return false;
	return !RESERVED_TOP_LEVEL_SEGMENTS.has(match[1].toLowerCase());
};

export const isAutoRedirectExemptPath = (pathname: string): boolean => {
	if (AUTO_REDIRECT_EXEMPT_PATHS.has(pathname)) {
		return true;
	}

	if (AUTO_REDIRECT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return true;
	}

	return isBareVanityCodePath(pathname);
};
