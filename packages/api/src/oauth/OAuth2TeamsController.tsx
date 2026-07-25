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

import {DefaultUserOnly, LoginRequiredAllowSuspicious} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {SudoModeMiddleware} from '@fluxer/api/src/middleware/SudoModeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {TeamIdParam, TeamIdUserIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	TeamCreateRequest,
	TeamListResponse,
	TeamMemberInviteRequest,
	TeamMemberListResponse,
	TeamMemberResponse,
	TeamMemberUpdateRequest,
	TeamResponse,
	TeamUpdateRequest,
} from '@fluxer/schema/src/domains/oauth/TeamSchemas';

/**
 * Developer teams.
 *
 * The whole surface is DefaultUserOnly: teams are a developer-portal concept
 * and bots have no business managing their own owning team. Path params are
 * named team_id/user_id to match the ::team_id/::user_id placeholders in the
 * scaffolded OAUTH_DEV_TEAM* rate-limit buckets — a mismatched name would
 * silently collapse every team into one shared bucket.
 */
export function OAuth2TeamsController(app: HonoApp) {
	app.get(
		'/teams',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAMS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_teams',
			summary: 'List teams',
			responseSchema: TeamListResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Lists every developer team the current user belongs to, including pending invites. Each entry carries the caller’s role and membership state.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx.get('oauth2TeamsRequestService').listTeams(userId);
			return ctx.json(response);
		},
	);

	app.post(
		'/teams',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_CREATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('json', TeamCreateRequest),
		OpenAPI({
			operationId: 'create_team',
			summary: 'Create team',
			responseSchema: TeamResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description: 'Creates a developer team owned by the current user. Requires a claimed account.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx.get('oauth2TeamsRequestService').createTeam(userId, ctx.req.valid('json'));
			return ctx.json(response);
		},
	);

	app.get(
		'/teams/:team_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAMS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdParam),
		OpenAPI({
			operationId: 'get_team',
			summary: 'Get team',
			responseSchema: TeamResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description: 'Retrieves a team. Restricted to the owner and accepted members.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx.get('oauth2TeamsRequestService').getTeam(userId, ctx.req.valid('param').team_id);
			return ctx.json(response);
		},
	);

	app.patch(
		'/teams/:team_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_UPDATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdParam),
		Validator('json', TeamUpdateRequest),
		OpenAPI({
			operationId: 'update_team',
			summary: 'Update team',
			responseSchema: TeamResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description: 'Renames a team. Restricted to the owner and admins.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx
				.get('oauth2TeamsRequestService')
				.updateTeam(userId, ctx.req.valid('param').team_id, ctx.req.valid('json'));
			return ctx.json(response);
		},
	);

	app.delete(
		'/teams/:team_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_DELETE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', TeamIdParam),
		OpenAPI({
			operationId: 'delete_team',
			summary: 'Delete team',
			responseSchema: null,
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Deletes a team. Owner only, requires sudo mode, and refused while the team still owns applications — transfer them away first.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			await ctx.get('oauth2TeamsRequestService').deleteTeam(userId, ctx.req.valid('param').team_id);
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/teams/:team_id/members',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_MEMBERS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdParam),
		OpenAPI({
			operationId: 'list_team_members',
			summary: 'List team members',
			responseSchema: TeamMemberListResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Lists the members of a team, including pending invites. Restricted to the owner and accepted members.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx.get('oauth2TeamsRequestService').listMembers(userId, ctx.req.valid('param').team_id);
			return ctx.json(response);
		},
	);

	app.post(
		'/teams/:team_id/members',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_MEMBER_ADD),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdParam),
		Validator('json', TeamMemberInviteRequest),
		OpenAPI({
			operationId: 'invite_team_member',
			summary: 'Invite team member',
			responseSchema: TeamMemberResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Invites a user to a team by ID or by username and discriminator. Restricted to the owner and admins. The invitee has no access until they accept.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx
				.get('oauth2TeamsRequestService')
				.inviteMember(userId, ctx.req.valid('param').team_id, ctx.req.valid('json'));
			return ctx.json(response);
		},
	);

	// Registered before the :user_id routes so '@me' never parses as a user ID.
	app.post(
		'/teams/:team_id/members/@me/accept',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_MEMBER_ADD),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdParam),
		OpenAPI({
			operationId: 'accept_team_invite',
			summary: 'Accept team invite',
			responseSchema: TeamMemberResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description: "Accepts the current user's pending invite to a team. Idempotent for already-accepted members.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx.get('oauth2TeamsRequestService').acceptInvite(userId, ctx.req.valid('param').team_id);
			return ctx.json(response);
		},
	);

	app.patch(
		'/teams/:team_id/members/:user_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_MEMBER_ADD),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdUserIdParam),
		Validator('json', TeamMemberUpdateRequest),
		OpenAPI({
			operationId: 'update_team_member',
			summary: 'Update team member role',
			responseSchema: TeamMemberResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				"Changes a member's role. Restricted to the owner and admins; the owner's own row cannot be changed.",
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const params = ctx.req.valid('param');
			const response = await ctx
				.get('oauth2TeamsRequestService')
				.updateMemberRole(userId, params.team_id, params.user_id, ctx.req.valid('json'));
			return ctx.json(response);
		},
	);

	app.delete(
		'/teams/:team_id/members/:user_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_TEAM_MEMBER_REMOVE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', TeamIdUserIdParam),
		OpenAPI({
			operationId: 'remove_team_member',
			summary: 'Remove team member',
			responseSchema: null,
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Removes a member from a team. Owner and admins may remove anyone but the owner; any member may remove themselves, which also declines a pending invite.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const params = ctx.req.valid('param');
			await ctx.get('oauth2TeamsRequestService').removeMember(userId, params.team_id, params.user_id);
			return ctx.body(null, 204);
		},
	);
}
