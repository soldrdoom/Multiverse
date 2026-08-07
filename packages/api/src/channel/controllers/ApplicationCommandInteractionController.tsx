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

import {createChannelID, createUserID} from '@fluxer/api/src/BrandedTypes';
import {DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {InteractionCreateRequest, InteractionResponse} from '@fluxer/schema/src/domains/channel/InteractionSchemas';
import {ChannelIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';

/**
 * Deliberately separate from MessageInteractionController/MessageInteractionService
 * — that pair is about message reactions/pins/read-state and predates this
 * feature; it has nothing to do with bots.
 */
export function ApplicationCommandInteractionController(app: HonoApp) {
	app.post(
		'/channels/:channel_id/interactions',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_INTERACTION_CREATE),
		LoginRequired,
		// Blocks bot-to-bot command invocation for this first cut, per the
		// approved plan.
		DefaultUserOnly,
		Validator('param', ChannelIdParam),
		Validator('json', InteractionCreateRequest),
		OpenAPI({
			operationId: 'create_application_command_interaction',
			summary: 'Invoke a bot application command',
			responseSchema: InteractionResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: ['Channels', 'Bots'],
			description:
				"Invokes one of a bot's registered global application commands in a channel. Validates the given options against the command's declared option definitions and delivers an INTERACTION_CREATE dispatch directly to the bot's own gateway session (not a channel/guild broadcast). Returns an acknowledgment of the interaction, not the bot's reply — the bot replies with an ordinary message a moment later.",
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const body = ctx.req.valid('json');

			const response = await ctx.get('applicationCommandInteractionService').createInteraction({
				user,
				channelId,
				botUserId: createUserID(body.bot_user_id),
				commandName: body.command_name,
				options: body.options,
			});

			return ctx.json(response);
		},
	);
}
