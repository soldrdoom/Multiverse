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
import type {HonoApp, HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {SudoVerificationSchema} from '@fluxer/schema/src/domains/auth/AuthSchemas';
import {
	ApplicationIdParam,
	ClientIdParam,
	ClientIdTokenIdParam,
} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	ApplicationCreateRequest,
	ApplicationListResponse,
	ApplicationResponse,
	ApplicationUpdateRequest,
	BotProfileResponse,
	BotProfileUpdateRequest,
	BotTokenCreateRequest,
	BotTokenCreateResponse,
	BotTokenListResponse,
	BotTokenResetResponse,
} from '@fluxer/schema/src/domains/oauth/OAuthSchemas';
import {ApplicationTeamTransferRequest} from '@fluxer/schema/src/domains/oauth/TeamSchemas';
import type {Context} from 'hono';

export function OAuth2ApplicationsController(app: HonoApp) {
	const listApplicationsHandler = async (ctx: Context<HonoEnv>) => {
		const userId = ctx.get('user').id;
		const response = await ctx.get('oauth2ApplicationsRequestService').listApplications(userId);
		return ctx.json(response);
	};

	app.get(
		'/users/@me/applications',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENTS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_user_applications',
			summary: 'List user applications',
			responseSchema: ApplicationListResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Lists all OAuth2 applications owned by the authenticated user. Includes application credentials, metadata, and configuration.',
		}),
		listApplicationsHandler,
	);

	app.get(
		'/oauth2/applications/@me',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENTS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		OpenAPI({
			operationId: 'list_user_applications',
			summary: 'List user applications',
			responseSchema: ApplicationListResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Lists all OAuth2 applications owned by the authenticated user. Includes application credentials, metadata, and configuration.',
		}),
		listApplicationsHandler,
	);

	app.post(
		'/oauth2/applications',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_CREATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('json', ApplicationCreateRequest),
		OpenAPI({
			operationId: 'create_oauth_application',
			summary: 'Create OAuth2 application',
			responseSchema: ApplicationResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Creates a new OAuth2 application (client). Returns client credentials including ID and secret. Application can be used for authorization flows and API access.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const body = ctx.req.valid('json');
			const response = await ctx.get('oauth2ApplicationsRequestService').createApplication(userId, body);
			return ctx.json(response);
		},
	);

	app.get(
		'/oauth2/applications/:id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENTS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', ApplicationIdParam),
		OpenAPI({
			operationId: 'get_oauth_application',
			summary: 'Get application',
			responseSchema: ApplicationResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Retrieves details of a specific OAuth2 application owned by the user. Returns full application configuration and credentials.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx
				.get('oauth2ApplicationsRequestService')
				.getApplication(userId, ctx.req.valid('param').id);
			return ctx.json(response);
		},
	);

	app.patch(
		'/oauth2/applications/:id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_UPDATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', ApplicationIdParam),
		Validator('json', ApplicationUpdateRequest),
		OpenAPI({
			operationId: 'update_oauth_application',
			summary: 'Update application',
			responseSchema: ApplicationResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Modifies OAuth2 application configuration such as name, description, and redirect URIs. Does not rotate credentials.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const body = ctx.req.valid('json');
			const response = await ctx
				.get('oauth2ApplicationsRequestService')
				.updateApplication(userId, ctx.req.valid('param').id, body);
			return ctx.json(response);
		},
	);

	app.delete(
		'/oauth2/applications/:id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_DELETE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ApplicationIdParam),
		Validator('json', SudoVerificationSchema),
		OpenAPI({
			operationId: 'delete_oauth_application',
			summary: 'Delete application',
			responseSchema: null,
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Permanently deletes an OAuth2 application. Requires sudo mode authentication. Invalidates all issued tokens and revokes all user authorizations.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			await ctx.get('oauth2ApplicationsRequestService').deleteApplication({
				ctx,
				userId: user.id,
				body,
				applicationId: ctx.req.valid('param').id,
			});
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/oauth2/applications/:client_id/bot/tokens',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_BOT_TOKENS_LIST),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', ClientIdParam),
		OpenAPI({
			operationId: 'list_bot_tokens',
			summary: 'List bot tokens',
			responseSchema: BotTokenListResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Lists the bot tokens issued for an application. Returns only metadata — name, preview, and usage timestamps. Token secrets are never returned after creation.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const response = await ctx
				.get('oauth2ApplicationsRequestService')
				.listBotTokens(userId, ctx.req.valid('param').client_id);
			return ctx.json(response);
		},
	);

	app.post(
		'/oauth2/applications/:client_id/bot/tokens',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_BOT_TOKENS_CREATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ClientIdParam),
		Validator('json', BotTokenCreateRequest),
		OpenAPI({
			operationId: 'create_bot_token',
			summary: 'Create bot token',
			responseSchema: BotTokenCreateResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Issues an additional named bot token for an application. Requires sudo mode authentication. The secret is returned once in this response and cannot be retrieved again. Existing tokens continue to work.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			const response = await ctx.get('oauth2ApplicationsRequestService').createBotToken({
				ctx,
				userId: user.id,
				body,
				applicationId: ctx.req.valid('param').client_id,
			});
			return ctx.json(response);
		},
	);

	app.delete(
		'/oauth2/applications/:client_id/bot/tokens/:token_id',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_BOT_TOKEN_REVOKE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ClientIdTokenIdParam),
		Validator('json', SudoVerificationSchema),
		OpenAPI({
			operationId: 'revoke_bot_token',
			summary: 'Revoke bot token',
			responseSchema: null,
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				"Revokes a single bot token, leaving the application's other tokens working. Requires sudo mode authentication. Revocation takes effect immediately for REST requests. Gateway sessions already connected with the revoked token are not disconnected: they remain active until they next drop, after which the token can no longer open or resume a session (beyond the gateway's ~10-second resume window). Restart the bot process to terminate its sessions sooner.",
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const params = ctx.req.valid('param');
			const body = ctx.req.valid('json');
			await ctx.get('oauth2ApplicationsRequestService').revokeBotToken({
				ctx,
				userId: user.id,
				body,
				applicationId: params.client_id,
				tokenId: params.token_id,
			});
			return ctx.body(null, 204);
		},
	);

	app.patch(
		'/oauth2/applications/:client_id/team',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_UPDATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ClientIdParam),
		Validator('json', ApplicationTeamTransferRequest),
		OpenAPI({
			operationId: 'transfer_application_team',
			summary: 'Transfer application to team',
			responseSchema: ApplicationResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				"Transfers an application to a developer team (or detaches it with a null team_id). Owner only, requires sudo mode, and requires admin rights on the destination team. The application's owner becomes the team's owner; it is never null.",
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			const response = await ctx.get('oauth2ApplicationsRequestService').transferApplicationToTeam({
				ctx,
				userId: user.id,
				body,
				applicationId: ctx.req.valid('param').client_id,
			});
			return ctx.json(response);
		},
	);

	app.post(
		'/oauth2/applications/:id/bot/reset-token',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_ROTATE_SECRET),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ApplicationIdParam),
		Validator('json', SudoVerificationSchema),
		OpenAPI({
			operationId: 'reset_bot_token',
			summary: 'Reset bot token',
			responseSchema: BotTokenResetResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Rotates the bot token for an OAuth2 application. Requires sudo mode authentication. Invalidates all previously issued bot tokens. Used for security rotation and compromise mitigation.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			const applicationId = ctx.req.valid('param').id;
			const response = await ctx.get('oauth2RequestService').resetBotToken({
				ctx,
				userId: user.id,
				body,
				applicationId,
			});
			return ctx.json(response);
		},
	);

	app.post(
		'/oauth2/applications/:id/client-secret/reset',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_ROTATE_SECRET),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		SudoModeMiddleware,
		Validator('param', ApplicationIdParam),
		Validator('json', SudoVerificationSchema),
		OpenAPI({
			operationId: 'reset_client_secret',
			summary: 'Reset client secret',
			responseSchema: ApplicationResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Rotates the client secret for an OAuth2 application. Requires sudo mode authentication. Essential security operation for protecting client credentials. Existing access tokens remain valid.',
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			const applicationId = ctx.req.valid('param').id;
			const response = await ctx.get('oauth2RequestService').resetClientSecret({
				ctx,
				userId: user.id,
				body,
				applicationId,
			});
			return ctx.json(response);
		},
	);

	app.patch(
		'/oauth2/applications/:id/bot',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_CLIENT_UPDATE),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		Validator('param', ApplicationIdParam),
		Validator('json', BotProfileUpdateRequest),
		OpenAPI({
			operationId: 'update_bot_profile',
			summary: 'Update bot profile',
			responseSchema: BotProfileResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['OAuth2'],
			description:
				'Modifies bot profile information such as name, avatar, and status. Changes apply to the bot account associated with this OAuth2 application.',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const body = ctx.req.valid('json');
			const response = await ctx
				.get('oauth2ApplicationsRequestService')
				.updateBotProfile(userId, ctx.req.valid('param').id, body);
			return ctx.json(response);
		},
	);
}
