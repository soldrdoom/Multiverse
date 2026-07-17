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

export const isAutoRedirectExemptPath = (pathname: string): boolean => {
	if (AUTO_REDIRECT_EXEMPT_PATHS.has(pathname)) {
		return true;
	}

	return AUTO_REDIRECT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
};
