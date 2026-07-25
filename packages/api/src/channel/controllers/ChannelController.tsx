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
import type {HonoApp, HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {
	ChannelUpdateRequest,
	DeleteChannelQuery,
	PermissionOverwriteCreateRequest,
	TokenGateSetRequest,
	TokenGateVisibilitySetRequest,
} from '@fluxer/schema/src/domains/channel/ChannelRequestSchemas';
import {
	ChannelResponse,
	RtcRegionResponse,
	TokenGateRecheckResponse,
} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import {
	ChannelIdOverwriteIdParam,
	ChannelIdParam,
	ChannelIdUserIdParam,
} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import type {Context} from 'hono';
import {z} from 'zod';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ChannelController(app: HonoApp) {
	app.get(
		'/channels/:channel_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_GET),
		LoginRequired,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'get_channel',
			summary: 'Fetch a channel',
			description:
				'Retrieves the channel object including metadata, member list, and settings. Requires the user to be a member of the channel with view permissions.',
			responseSchema: ChannelResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const requestCache = ctx.get('requestCache');
			const channelRequestService = ctx.get('channelRequestService');
			return ctx.json(
				await channelRequestService.getChannelResponse({
					userId,
					channelId,
					requestCache,
				}),
			);
		},
	);

	app.get(
		'/channels/:channel_id/rtc-regions',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_GET),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'list_rtc_regions',
			summary: 'List RTC regions',
			description:
				'Returns available voice and video calling regions for the channel, used to optimise connection quality. Requires membership with call permissions.',
			responseSchema: z.array(RtcRegionResponse),
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const channelRequestService = ctx.get('channelRequestService');
			return ctx.json(await channelRequestService.listRtcRegions({userId, channelId}));
		},
	);

	app.patch(
		'/channels/:channel_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdParam, {
			post: async (result, ctx: Context<HonoEnv>) => {
				if (!result.success) {
					return undefined;
				}
				const channelId = createChannelID(result.data.channel_id);
				const existing = await ctx.get('channelService').getChannel({
					userId: ctx.get('user').id,
					channelId,
				});
				ctx.set('channelUpdateType', existing.type);
				return undefined;
			},
		}),
		Validator('json', ChannelUpdateRequest, {
			pre: async (raw: unknown, ctx: Context<HonoEnv>) => {
				const channelType = ctx.get('channelUpdateType');
				if (channelType === undefined) {
					throw new Error('Missing channel type for update validation');
				}
				const body = isPlainObject(raw) ? raw : {};
				return {...body, type: channelType};
			},
		}),
		OpenAPI({
			operationId: 'update_channel',
			summary: 'Update channel settings',
			description:
				'Modifies channel properties such as name, description, topic, nsfw flag, and slowmode. Requires management permissions in the channel.',
			responseSchema: ChannelResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const data = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const channelRequestService = ctx.get('channelRequestService');
			return ctx.json(
				await channelRequestService.updateChannel({
					userId,
					channelId,
					data,
					requestCache,
				}),
			);
		},
	);

	app.delete(
		'/channels/:channel_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_DELETE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('query', DeleteChannelQuery),
		OpenAPI({
			operationId: 'delete_channel',
			summary: 'Delete a channel',
			description:
				'Permanently removes a channel and all its content. Only server administrators or the channel owner can delete channels.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const {silent} = ctx.req.valid('query');
			const requestCache = ctx.get('requestCache');
			const channelRequestService = ctx.get('channelRequestService');
			await channelRequestService.deleteChannel({userId, channelId, requestCache, silent});
			return ctx.body(null, 204);
		},
	);

	app.put(
		'/channels/:channel_id/recipients/:user_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdUserIdParam),
		OpenAPI({
			operationId: 'add_group_dm_recipient',
			summary: 'Add recipient to group DM',
			description:
				'Adds a user to a group direct message channel. The requesting user must be a member of the group DM.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const recipientId = createUserID(ctx.req.valid('param').user_id);
			const requestCache = ctx.get('requestCache');

			await ctx.get('channelService').groupDms.addRecipientToChannel({
				userId,
				channelId,
				recipientId,
				requestCache,
			});

			return ctx.body(null, 204);
		},
	);

	app.delete(
		'/channels/:channel_id/recipients/:user_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdUserIdParam),
		Validator('query', DeleteChannelQuery),
		OpenAPI({
			operationId: 'remove_group_dm_recipient',
			summary: 'Remove recipient from group DM',
			description:
				'Removes a user from a group direct message channel. The requesting user must be a member with appropriate permissions.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const recipientId = createUserID(ctx.req.valid('param').user_id);
			const {silent} = ctx.req.valid('query');
			const requestCache = ctx.get('requestCache');
			await ctx
				.get('channelService')
				.removeRecipientFromChannel({userId, channelId, recipientId, requestCache, silent});
			return ctx.body(null, 204);
		},
	);

	app.put(
		'/channels/:channel_id/permissions/:overwrite_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdOverwriteIdParam),
		Validator('json', PermissionOverwriteCreateRequest),
		OpenAPI({
			operationId: 'set_channel_permission_overwrite',
			summary: 'Set permission overwrite for channel',
			description:
				'Creates or updates permission overrides for a role or user in the channel. Allows fine-grained control over who can view, send messages, or manage the channel.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const overwriteId = ctx.req.valid('param').overwrite_id;
			const data = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');

			await ctx.get('channelService').setChannelPermissionOverwrite({
				userId,
				channelId,
				overwriteId,
				overwrite: {
					type: data.type,
					allow_: data.allow ? data.allow : 0n,
					deny_: data.deny ? data.deny : 0n,
				},
				requestCache,
			});
			return ctx.body(null, 204);
		},
	);

	app.delete(
		'/channels/:channel_id/permissions/:overwrite_id',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdOverwriteIdParam),
		OpenAPI({
			operationId: 'delete_channel_permission_overwrite',
			summary: 'Delete permission overwrite',
			description:
				'Removes a permission override from a role or user in the channel, restoring default permissions. Requires channel management rights.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const overwriteId = ctx.req.valid('param').overwrite_id;
			const requestCache = ctx.get('requestCache');
			await ctx.get('channelService').deleteChannelPermissionOverwrite({userId, channelId, overwriteId, requestCache});
			return ctx.body(null, 204);
		},
	);

	app.put(
		'/channels/:channel_id/token-gate',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('json', TokenGateSetRequest),
		OpenAPI({
			operationId: 'set_channel_token_gate',
			summary: 'Set the tokengate for a channel or category',
			description:
				'Requires members to hold an NFT satisfying the given address to view this channel/category, per match_mode (exact mint by default, or any asset in the collection). Categories with a gate are inherited by child channels that have no gate of their own. Requires Manage Channels.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const {address, match_mode: matchMode} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');

			await ctx.get('channelService').setChannelTokenGate({userId, channelId, address, matchMode, requestCache});
			return ctx.body(null, 204);
		},
	);

	app.delete(
		'/channels/:channel_id/token-gate',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'delete_channel_token_gate',
			summary: 'Clear the tokengate for a channel or category',
			description:
				"Removes this channel/category's own tokengate. A channel with no gate of its own falls back to its parent category's gate, if any. Requires Manage Channels.",
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const requestCache = ctx.get('requestCache');

			await ctx.get('channelService').clearChannelTokenGate({userId, channelId, requestCache});
			return ctx.body(null, 204);
		},
	);

	app.put(
		'/channels/:channel_id/token-gate/visibility',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_UPDATE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('json', TokenGateVisibilitySetRequest),
		OpenAPI({
			operationId: 'set_channel_token_gate_visibility',
			summary: 'Set how a channel/category appears to members who fail its tokengate',
			description:
				"Sets this channel/category's own choice for whether members who don't satisfy its effective tokengate see it locked (visible, not enterable) or hidden entirely. A channel with no explicit choice of its own falls back to its parent category's choice, then to LOCKED. Requires Manage Channels.",
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);
			const {visibility} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');

			await ctx.get('channelService').setChannelTokenGateVisibility({userId, channelId, visibility, requestCache});
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/channels/:channel_id/token-gate/recheck',
		RateLimitMiddleware(RateLimitConfigs.CHANNEL_TOKEN_GATE_RECHECK),
		LoginRequired,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'recheck_channel_token_gate',
			summary: 'Recheck the current user’s access to a gated channel',
			description:
				"Forces a fresh on-chain lookup for the requesting user's linked wallet against this channel's effective tokengate, bypassing the cached result. Intended for a user who just acquired the required NFT and wants immediate access without waiting for the cache to expire.",
			responseSchema: TokenGateRecheckResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: 'Channels',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			const result = await ctx.get('channelService').recheckChannelTokenGateAccess({userId, channelId});
			return ctx.json(
				{
					satisfied: result.status === 'satisfied',
					gate_address: result.gateAddress,
				},
				200,
			);
		},
	);
}
