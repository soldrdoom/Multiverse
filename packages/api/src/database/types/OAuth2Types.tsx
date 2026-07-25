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

export const TEAM_MEMBER_ROLES = ['admin', 'developer', 'read_only'] as const;
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export const TEAM_MEMBERSHIP_STATES = ['invited', 'accepted'] as const;
export type TeamMembershipState = (typeof TEAM_MEMBERSHIP_STATES)[number];

/**
 * A developer team.
 *
 * Teams are purely additive: an application transferred to a team keeps a
 * non-null owner_user_id (rewritten to the team's owner), so every consumer of
 * applications_by_owner keeps working and abuse attribution always resolves to
 * a person. The team owner also holds a member row (role 'admin', state
 * 'accepted') so the by-user index covers them; ownership itself lives here.
 */
export interface ApplicationTeamRow {
	team_id: bigint;
	name: string;
	owner_user_id: UserID;
	created_at: Date;
	version?: number | null;
}

/**
 * One row per (team, user) membership.
 *
 * Membership is invite-based: a row starts in state 'invited' and confers zero
 * capabilities until the invited user accepts. Nobody can be silently added to
 * a team that owns a bot they never consented to.
 */
export interface ApplicationTeamMemberRow {
	team_id: bigint;
	user_id: UserID;
	role: TeamMemberRole;
	membership_state: TeamMembershipState;
	invited_by_user_id: UserID;
	invited_at: Date;
	accepted_at: Date | null;
	version?: number | null;
}

export interface ApplicationTeamByUserRow {
	user_id: UserID;
	team_id: bigint;
}

export interface ApplicationByTeamRow {
	team_id: bigint;
	application_id: ApplicationID;
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

export const APPLICATION_TEAM_COLUMNS = [
	'team_id',
	'name',
	'owner_user_id',
	'created_at',
	'version',
] as const satisfies ReadonlyArray<keyof ApplicationTeamRow>;

export const APPLICATION_TEAM_MEMBER_COLUMNS = [
	'team_id',
	'user_id',
	'role',
	'membership_state',
	'invited_by_user_id',
	'invited_at',
	'accepted_at',
	'version',
] as const satisfies ReadonlyArray<keyof ApplicationTeamMemberRow>;

export const APPLICATION_TEAM_BY_USER_COLUMNS = ['user_id', 'team_id'] as const satisfies ReadonlyArray<
	keyof ApplicationTeamByUserRow
>;

export const APPLICATION_BY_TEAM_COLUMNS = ['team_id', 'application_id'] as const satisfies ReadonlyArray<
	keyof ApplicationByTeamRow
>;
