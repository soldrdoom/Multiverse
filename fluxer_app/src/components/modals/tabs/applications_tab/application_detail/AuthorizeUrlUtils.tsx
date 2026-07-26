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

import {Endpoints} from '@app/Endpoints';

/**
 * The scope list for a plain "add this bot to a server" invite. Kept as a
 * constant so BotInviteSection and any future caller agree on what a bot invite
 * is, and so the server-side `isBotOnly` branch in `OAuth2Service.authorizeAndConsent`
 * (bot-only scope is the one case that does not require a redirect URI) stays
 * discoverable from the client.
 */
export const BOT_INVITE_SCOPES: ReadonlyArray<string> = ['bot'];

export interface AuthorizeUrlParams {
	clientId: string;
	scopes: ReadonlyArray<string>;
	/** Already-formatted permission bitfield string; omitted when null/empty. */
	permissions?: string | null;
	/** When present, `response_type=code` is added alongside it. */
	redirectUri?: string | null;
}

/**
 * Assembles an `/oauth2/authorize` URL against the current origin.
 *
 * This is pure URL assembly — it deliberately holds no opinion about which
 * combinations are *valid*. The OAuth2 URL Builder keeps its own validation
 * (redirect URI required unless bot-only, etc.) because those rules are builder
 * UI affordances, not properties of the URL.
 */
export function buildAuthorizeUrl({clientId, scopes, permissions, redirectUri}: AuthorizeUrlParams): string {
	const authorizeUrl = new URL(Endpoints.OAUTH_AUTHORIZE, window.location.origin);
	authorizeUrl.searchParams.set('client_id', clientId);

	if (scopes.length > 0) {
		authorizeUrl.searchParams.set('scope', scopes.join(' '));
	}

	if (permissions) {
		authorizeUrl.searchParams.set('permissions', permissions);
	}

	if (redirectUri) {
		authorizeUrl.searchParams.set('redirect_uri', redirectUri);
		authorizeUrl.searchParams.set('response_type', 'code');
	}

	return authorizeUrl.toString();
}
