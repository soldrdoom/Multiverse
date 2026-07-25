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

import type {ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';

export interface ApplicationRow {
	application_id: ApplicationID;
	owner_user_id: UserID;
	name: string;
	description: string | null;
	icon_hash: string | null;
	tags: Set<string> | null;
	privacy_policy_url: string | null;
	terms_of_service_url: string | null;
	team_id: bigint | null;
	bot_user_id: UserID | null;
	bot_is_public: boolean | null;
	bot_require_code_grant?: boolean | null;
	oauth2_redirect_uris: Set<string>;
	client_secret_hash: string | null;
	bot_token_hash: string | null;
	bot_token_preview: string | null;
	bot_token_created_at: Date | null;
	client_secret_created_at: Date | null;
	version?: number | null;
}

export interface ApplicationByOwnerRow {
	owner_user_id: UserID;
	application_id: ApplicationID;
}

/**
 * One row per issued bot token.
 *
 * Keyed on lookup_hash — the SHA-256 of the token secret — so authenticating a
 * request is a single point read with no key derivation. The secret is 256 bits
 * of CSPRNG output, so it has nothing to stretch: password hashing exists to
 * make low-entropy secrets expensive to guess, and applying it per request here
 * only bought latency.
 */
export interface ApplicationBotTokenRow {
	lookup_hash: string;
	token_id: bigint;
	application_id: ApplicationID;
	bot_user_id: UserID;
	name: string;
	preview: string;
	created_at: Date;
	created_by_user_id: UserID;
	last_used_at: Date | null;
	version?: number | null;
}

export interface ApplicationBotTokenByApplicationRow {
	application_id: ApplicationID;
	token_id: bigint;
	lookup_hash: string;
}

export interface OAuth2AuthorizationCodeRow {
	code: string;
	application_id: ApplicationID;
	user_id: UserID;
	redirect_uri: string;
	scope: Set<string>;
	nonce: string | null;
	created_at: Date;
}

export interface OAuth2AccessTokenRow {
	token_: string;
	application_id: ApplicationID;
	user_id: UserID | null;
	scope: Set<string>;
	created_at: Date;
}

export interface OAuth2AccessTokenByUserRow {
	user_id: UserID;
	token_: string;
}

export interface OAuth2RefreshTokenRow {
	token_: string;
	application_id: ApplicationID;
	user_id: UserID;
	scope: Set<string>;
	created_at: Date;
}

export interface OAuth2RefreshTokenByUserRow {
	user_id: UserID;
	token_: string;
}

export const APPLICATION_COLUMNS = [
	'application_id',
	'owner_user_id',
	'name',
	'description',
	'icon_hash',
	'tags',
	'privacy_policy_url',
	'terms_of_service_url',
	'team_id',
	'bot_user_id',
	'bot_is_public',
	'bot_require_code_grant',
	'oauth2_redirect_uris',
	'client_secret_hash',
	'bot_token_hash',
	'bot_token_preview',
	'bot_token_created_at',
	'client_secret_created_at',
	'version',
] as const satisfies ReadonlyArray<keyof ApplicationRow>;

export const OAUTH2_AUTHORIZATION_CODE_COLUMNS = [
	'code',
	'application_id',
	'user_id',
	'redirect_uri',
	'scope',
	'nonce',
	'created_at',
] as const satisfies ReadonlyArray<keyof OAuth2AuthorizationCodeRow>;

export const OAUTH2_ACCESS_TOKEN_COLUMNS = [
	'token_',
	'application_id',
	'user_id',
	'scope',
	'created_at',
] as const satisfies ReadonlyArray<keyof OAuth2AccessTokenRow>;

export const OAUTH2_REFRESH_TOKEN_COLUMNS = [
	'token_',
	'application_id',
	'user_id',
	'scope',
	'created_at',
] as const satisfies ReadonlyArray<keyof OAuth2RefreshTokenRow>;

export const APPLICATION_BOT_TOKEN_COLUMNS = [
	'lookup_hash',
	'token_id',
	'application_id',
	'bot_user_id',
	'name',
	'preview',
	'created_at',
	'created_by_user_id',
	'last_used_at',
	'version',
] as const satisfies ReadonlyArray<keyof ApplicationBotTokenRow>;

export const APPLICATION_BOT_TOKEN_BY_APPLICATION_COLUMNS = [
	'application_id',
	'token_id',
	'lookup_hash',
] as const satisfies ReadonlyArray<keyof ApplicationBotTokenByApplicationRow>;
