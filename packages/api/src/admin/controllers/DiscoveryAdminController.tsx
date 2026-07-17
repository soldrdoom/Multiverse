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

import {createGuildID, type GuildID} from '@fluxer/api/src/BrandedTypes';
import {SYSTEM_USER_ID} from '@fluxer/api/src/constants/Core';
import type {GuildDiscoveryRow} from '@fluxer/api/src/database/types/GuildDiscoveryTypes';
import {Logger} from '@fluxer/api/src/Logger';
import {requireAdminACL} from '@fluxer/api/src/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp, HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {UserChannelService} from '@fluxer/api/src/user/services/UserChannelService';
import type {UserPermissionUtils} from '@fluxer/api/src/utils/UserPermissionUtils';
import {Validator} from '@fluxer/api/src/Validator';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {GuildIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	DiscoveryAdminListQuery,
	DiscoveryAdminRejectRequest,
	DiscoveryAdminRemoveRequest,
	DiscoveryAdminReviewRequest,
	DiscoveryApplicationResponse,
} from '@fluxer/schema/src/domains/guild/GuildDiscoverySchemas';
import type {Context} from 'hono';
import {z} from 'zod';

function mapDiscoveryRowToResponse(row: GuildDiscoveryRow, guildName?: string) {
	return {
		guild_id: row.guild_id.toString(),
		guild_name: guildName ?? null,
		status: row.status,
		description: row.description,
		category_type: row.category_type,
		applied_at: row.applied_at.toISOString(),
		reviewed_at: row.removed_at?.toISOString() ?? row.reviewed_at?.toISOString() ?? null,
		review_reason: row.removal_reason ?? row.review_reason ?? null,
	};
}

async function resolveGuildName(ctx: Context<HonoEnv>, guildId: GuildID): Promise<string | null> {
	return ctx.get('discoveryService').getGuildName(guildId);
}

/**
 * Best-effort: send a system DM to the guild owner notifying them of a discovery decision.
 * Failures are logged but do not affect the HTTP response.
 */
async function sendDiscoveryDm(
	ctx: Context<HonoEnv>,
	guildId: GuildID,
	message: string,
): Promise<void> {
	try {
		const guildService = ctx.get('guildService');
		const guild = await guildService.getGuildSystem(guildId);
		const ownerId = guild.ownerId;

		const userRepository = ctx.get('userRepository');
		const systemUser = await userRepository.findUnique(SYSTEM_USER_ID);
		if (!systemUser) {
			Logger.warn({guildId: guildId.toString()}, '[discovery] System user not found, skipping DM notification');
			return;
		}

		const channelService = ctx.get('channelService');
		const channelRepository = ctx.get('channelRepository');
		const gatewayService = ctx.get('gatewayService');
		const mediaService = ctx.get('mediaService');
		const snowflakeService = ctx.get('snowflakeService');
		const limitConfigService = ctx.get('limitConfigService');
		const userCacheService = ctx.get('userCacheService');
		const requestCache = ctx.get('requestCache');

		// Construct UserChannelService inline — same pattern as SystemDmExecutor.
		// userPermissionUtils is not called by ensureDmOpenForBothUsers so we can pass null safely.
		const userChannelService = new UserChannelService(
			userRepository,
			userRepository,
			userRepository,
			channelService,
			channelRepository,
			gatewayService,
			mediaService,
			snowflakeService,
			null as unknown as UserPermissionUtils,
			limitConfigService,
		);

		const channel = await userChannelService.ensureDmOpenForBothUsers({
			userId: SYSTEM_USER_ID,
			recipientId: ownerId,
			userCacheService,
			requestCache,
		});

		await channelService.sendMessage({
			user: systemUser,
			channelId: channel.id,
			data: {content: message},
			requestCache,
		});
	} catch (error) {
		Logger.warn(
			{guildId: guildId.toString(), error: error instanceof Error ? error.message : String(error)},
			'[discovery] Failed to send DM notification to guild owner',
		);
	}
}

export function DiscoveryAdminController(app: HonoApp) {
	app.get(
		'/admin/discovery/applications',
		RateLimitMiddleware(RateLimitConfigs.DISCOVERY_ADMIN_LIST),
		requireAdminACL(AdminACLs.DISCOVERY_REVIEW),
		Validator('query', DiscoveryAdminListQuery),
		OpenAPI({
			operationId: 'list_discovery_applications',
			summary: 'List discovery applications',
			description: 'List discovery applications filtered by status. Requires DISCOVERY_REVIEW permission.',
			responseSchema: z.array(DiscoveryApplicationResponse),
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const query = ctx.req.valid('query');
			const discoveryService = ctx.get('discoveryService');

			const rows = await discoveryService.listByStatus({
				status: query.status,
				limit: query.limit,
			});

			const responses = await Promise.all(
				rows.map(async (row) => {
					const guildName = await resolveGuildName(ctx, row.guild_id);
					return mapDiscoveryRowToResponse(row, guildName);
				}),
			);

			return ctx.json(responses);
		},
	);

	app.post(
		'/admin/discovery/applications/:guild_id/approve',
		RateLimitMiddleware(RateLimitConfigs.DISCOVERY_ADMIN_ACTION),
		requireAdminACL(AdminACLs.DISCOVERY_REVIEW),
		Validator('param', GuildIdParam),
		Validator('json', DiscoveryAdminReviewRequest),
		OpenAPI({
			operationId: 'approve_discovery_application',
			summary: 'Approve discovery application',
			description: 'Approve a pending discovery application. Requires DISCOVERY_REVIEW permission.',
			responseSchema: DiscoveryApplicationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const {guild_id} = ctx.req.valid('param');
			const guildId = createGuildID(guild_id);
			const data = ctx.req.valid('json');
			const adminUserId = ctx.get('adminUserId');
			const discoveryService = ctx.get('discoveryService');

			const row = await discoveryService.approve({
				guildId,
				adminUserId,
				reason: data.reason,
			});

			const guildName = await resolveGuildName(ctx, guildId);
			return ctx.json(mapDiscoveryRowToResponse(row, guildName));
		},
	);

	app.post(
		'/admin/discovery/applications/:guild_id/reject',
		RateLimitMiddleware(RateLimitConfigs.DISCOVERY_ADMIN_ACTION),
		requireAdminACL(AdminACLs.DISCOVERY_REVIEW),
		Validator('param', GuildIdParam),
		Validator('json', DiscoveryAdminRejectRequest),
		OpenAPI({
			operationId: 'reject_discovery_application',
			summary: 'Reject discovery application',
			description: 'Reject a pending discovery application. Requires DISCOVERY_REVIEW permission.',
			responseSchema: DiscoveryApplicationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const {guild_id} = ctx.req.valid('param');
			const guildId = createGuildID(guild_id);
			const data = ctx.req.valid('json');
			const adminUserId = ctx.get('adminUserId');
			const discoveryService = ctx.get('discoveryService');

			const row = await discoveryService.reject({
				guildId,
				adminUserId,
				reason: data.reason,
			});

			// Notify the guild owner via system DM.
			const dmLines = [
				`Your server's Discovery application has been **rejected**.`,
				``,
				data.reason ? `**Reason:** ${data.reason}` : `No reason was provided.`,
				``,
				`You may edit your application and reapply at any time.`,
			];
			void sendDiscoveryDm(ctx, guildId, dmLines.join('\n'));

			const guildName = await resolveGuildName(ctx, guildId);
			return ctx.json(mapDiscoveryRowToResponse(row, guildName));
		},
	);

	app.post(
		'/admin/discovery/guilds/:guild_id/remove',
		RateLimitMiddleware(RateLimitConfigs.DISCOVERY_ADMIN_ACTION),
		requireAdminACL(AdminACLs.DISCOVERY_REMOVE),
		Validator('param', GuildIdParam),
		Validator('json', DiscoveryAdminRemoveRequest),
		OpenAPI({
			operationId: 'remove_from_discovery',
			summary: 'Remove guild from discovery',
			description: 'Remove an approved guild from discovery. Requires DISCOVERY_REMOVE permission.',
			responseSchema: DiscoveryApplicationResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const {guild_id} = ctx.req.valid('param');
			const guildId = createGuildID(guild_id);
			const data = ctx.req.valid('json');
			const adminUserId = ctx.get('adminUserId');
			const discoveryService = ctx.get('discoveryService');

			const row = await discoveryService.remove({
				guildId,
				adminUserId,
				reason: data.reason,
			});

			// Notify the guild owner via system DM.
			const dmLines = [
				`Your server has been **removed from Discovery**.`,
				``,
				data.reason ? `**Reason:** ${data.reason}` : `No reason was provided.`,
			];
			void sendDiscoveryDm(ctx, guildId, dmLines.join('\n'));

			const guildName = await resolveGuildName(ctx, guildId);
			return ctx.json(mapDiscoveryRowToResponse(row, guildName));
		},
	);
}
