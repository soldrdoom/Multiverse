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

import {createUserID} from '@fluxer/api/src/BrandedTypes';
import {BotOnly, DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {UserIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	ApplicationCommandListResponse,
	BulkOverwriteCommandsRequest,
} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';

/**
 * Bot application commands (real "/" slash commands for bots).
 *
 * Deliberately separate from OAuth2ApplicationsController: these two routes
 * are the only ones in the bot-platform surface that a bot itself calls
 * (bulkOverwrite) or that intentionally never require ownership (list, which
 * returns [] rather than 404 for any user id).
 */
export function BotCommandController(app: HonoApp) {
	app.put(
		'/applications/@me/commands',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_BOT_COMMANDS_OVERWRITE),
		BotOnly,
		Validator('json', BulkOverwriteCommandsRequest),
		OpenAPI({
			operationId: 'bulk_overwrite_application_commands',
			summary: 'Bulk overwrite application commands',
			responseSchema: ApplicationCommandListResponse,
			statusCode: 200,
			// botToken only: this is the one endpoint in the bot-platform surface a
			// bot calls directly, and the only auth scheme that should ever reach
			// it. There is deliberately no SudoModeMiddleware here — sudo mode is a
			// human-session/MFA concept, and this route never carries one.
			security: ['botToken'],
			tags: ['OAuth2'],
			description:
				"Replaces the calling bot's full set of global application commands with the given set. Re-registering an identical set is a cheap no-op. Global commands are visible to every guild/DM the bot is present in; there is no per-guild command list.",
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const body = ctx.req.valid('json');
			const response = await ctx.get('botCommandRequestService').bulkOverwrite({
				botUserId: user.id,
				rawBotToken: ctx.get('authToken'),
				body,
			});
			return ctx.json(response);
		},
	);

	app.get(
		'/users/:user_id/application-commands',
		RateLimitMiddleware(RateLimitConfigs.OAUTH_DEV_BOT_COMMANDS_LIST),
		LoginRequired,
		// Bots never call this directly — they know what they registered from
		// their own bulkOverwrite call. This is a client-facing lookup (the web
		// client uses it to populate the "/" command picker for a bot present in
		// a channel), so DefaultUserOnly here keeps the documented `security`
		// below (no botToken) and the actual middleware chain in agreement,
		// rather than a route that would technically still accept a bot token if
		// one were sent but never advertises that it does.
		DefaultUserOnly,
		Validator('param', UserIdParam),
		OpenAPI({
			operationId: 'list_user_application_commands',
			summary: 'List a user’s application commands',
			responseSchema: ApplicationCommandListResponse,
			statusCode: 200,
			// No OAuth2ScopeMiddleware runs on this route, so a bearer (OAuth2
			// access) token is rejected by LoginRequired before the handler ever
			// runs (ensureOAuth2BearerRouteSupport requires oauthBearerAllowed,
			// which only OAuth2ScopeMiddleware sets) — bearerToken is deliberately
			// left out of this list rather than copied from routes that list it
			// without actually supporting it.
			security: ['sessionToken'],
			tags: ['OAuth2'],
			description:
				"Lists the global application commands registered by a user's bot. Always returns an empty array — never a 404 — for a non-bot user or a bot with nothing registered.",
		}),
		async (ctx) => {
			const userId = createUserID(ctx.req.valid('param').user_id);
			const response = await ctx.get('botCommandRequestService').listForUser(userId);
			return ctx.json(response);
		},
	);
}
