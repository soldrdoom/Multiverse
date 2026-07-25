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

import type {
	ApplicationBotTokenRow,
	ApplicationTeamMemberRow,
	ApplicationTeamRow,
} from '@fluxer/api/src/database/types/OAuth2Types';
import {getGlobalLimitConfigSnapshot} from '@fluxer/api/src/limits/LimitConfigService';
import {resolveLimitSafe} from '@fluxer/api/src/limits/LimitConfigUtils';
import {createLimitMatchContext} from '@fluxer/api/src/limits/LimitMatchContextBuilder';
import type {Application} from '@fluxer/api/src/models/Application';
import type {User} from '@fluxer/api/src/models/User';
import type {ApplicationBotResponse, ApplicationResponse} from '@fluxer/api/src/oauth/OAuth2Types';
import {mapUserToPartialResponse} from '@fluxer/api/src/user/UserMappers';
import type {BotTokenResponse} from '@fluxer/schema/src/domains/oauth/OAuthSchemas';
import type {
	TeamMemberResponse,
	TeamResponse,
	TeamWithMembershipResponse,
} from '@fluxer/schema/src/domains/oauth/TeamSchemas';

export function mapBotUserToResponse(user: User, opts?: {token?: string}): ApplicationBotResponse {
	const partial = mapUserToPartialResponse(user);
	const snapshot = getGlobalLimitConfigSnapshot();
	const ctx = createLimitMatchContext({user});
	const hasAnimatedBanner = resolveLimitSafe(snapshot, ctx, 'feature_animated_banner', 0);
	const bannerHash = !user.isBot && hasAnimatedBanner === 0 ? null : user.bannerHash;
	return {
		id: partial.id,
		username: partial.username,
		discriminator: partial.discriminator,
		avatar: partial.avatar,
		banner: bannerHash,
		bio: user.bio ?? null,
		token: opts?.token,
		mfa_enabled: (user.authenticatorTypes?.size ?? 0) > 0,
		authenticator_types: user.authenticatorTypes ? Array.from(user.authenticatorTypes) : [],
		flags: partial.flags,
	};
}

export function mapApplicationToResponse(
	application: Application,
	options?: {
		botUser?: User | null;
		botToken?: string;
		clientSecret?: string | null;
	},
): ApplicationResponse {
	const baseResponse: ApplicationResponse = {
		id: application.applicationId.toString(),
		name: application.name,
		description: application.description,
		icon: application.iconHash,
		tags: Array.from(application.tags),
		privacy_policy_url: application.privacyPolicyUrl,
		terms_of_service_url: application.termsOfServiceUrl,
		team_id: application.teamId?.toString() ?? null,
		redirect_uris: Array.from(application.oauth2RedirectUris),
		bot_public: application.botIsPublic,
		bot_require_code_grant: application.botRequireCodeGrant,
	};

	if (options?.botUser) {
		baseResponse.bot = mapBotUserToResponse(options.botUser, {token: options.botToken});
	}

	if (options?.clientSecret) {
		return {
			...baseResponse,
			client_secret: options.clientSecret,
		};
	}

	return baseResponse;
}

export function mapBotTokenResetResponse(user: User, token: string) {
	return {
		token,
		bot: mapBotUserToResponse(user),
	};
}

export function mapBotProfileToResponse(user: User) {
	return {
		id: user.id.toString(),
		username: user.username,
		discriminator: user.discriminator.toString().padStart(4, '0'),
		global_name: user.globalName,
		avatar: user.avatarHash,
		banner: user.bannerHash,
		bio: user.bio,
	};
}

export function mapTeamToResponse(team: ApplicationTeamRow): TeamResponse {
	return {
		id: team.team_id.toString(),
		name: team.name,
		owner_user_id: team.owner_user_id.toString(),
		created_at: team.created_at.toISOString(),
	};
}

export function mapTeamWithMembershipToResponse(
	team: ApplicationTeamRow,
	membership: ApplicationTeamMemberRow,
): TeamWithMembershipResponse {
	return {
		...mapTeamToResponse(team),
		role: membership.role,
		membership_state: membership.membership_state,
	};
}

export function mapTeamMemberToResponse(member: ApplicationTeamMemberRow, user: User): TeamMemberResponse {
	return {
		team_id: member.team_id.toString(),
		user: mapUserToPartialResponse(user),
		role: member.role,
		membership_state: member.membership_state,
		invited_at: member.invited_at.toISOString(),
		accepted_at: member.accepted_at ? member.accepted_at.toISOString() : null,
	};
}

export function mapBotTokenToResponse(row: ApplicationBotTokenRow): BotTokenResponse {
	return {
		id: row.token_id.toString(),
		name: row.name,
		preview: row.preview,
		created_at: row.created_at.toISOString(),
		created_by_user_id: row.created_by_user_id.toString(),
		last_used_at: row.last_used_at ? row.last_used_at.toISOString() : null,
	};
}
