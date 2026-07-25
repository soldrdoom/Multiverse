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

import type {ChannelID, GuildID, UserID} from '@fluxer/api/src/BrandedTypes';
import {mapChannelToResponse} from '@fluxer/api/src/channel/ChannelMappers';
import type {IChannelRepository} from '@fluxer/api/src/channel/IChannelRepository';
import type {TokenGateService} from '@fluxer/api/src/channel/services/TokenGateService';
import type {GuildAuditLogService} from '@fluxer/api/src/guild/GuildAuditLogService';
import type {IGuildRepositoryAggregate} from '@fluxer/api/src/guild/repositories/IGuildRepositoryAggregate';
import {ChannelOperationsService} from '@fluxer/api/src/guild/services/channel/ChannelOperationsService';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import type {UserCacheService} from '@fluxer/api/src/infrastructure/UserCacheService';
import type {LimitConfigService} from '@fluxer/api/src/limits/LimitConfigService';
import type {RequestCache} from '@fluxer/api/src/middleware/RequestCacheMiddleware';
import type {ICacheService} from '@fluxer/cache/src/ICacheService';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {TokenGateVisibility} from '@fluxer/constants/src/GuildConstants';
import {MissingPermissionsError} from '@fluxer/errors/src/domains/core/MissingPermissionsError';
import type {ChannelCreateRequest} from '@fluxer/schema/src/domains/channel/ChannelRequestSchemas';
import type {ChannelResponse} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

export class GuildChannelService {
	private readonly channelOps: ChannelOperationsService;

	constructor(
		private readonly channelRepository: IChannelRepository,
		guildRepository: IGuildRepositoryAggregate,
		private readonly userCacheService: UserCacheService,
		private readonly gatewayService: IGatewayService,
		cacheService: ICacheService,
		snowflakeService: SnowflakeService,
		guildAuditLogService: GuildAuditLogService,
		limitConfigService: LimitConfigService,
		private readonly tokenGateService: TokenGateService,
	) {
		this.channelOps = new ChannelOperationsService(
			channelRepository,
			guildRepository,
			userCacheService,
			gatewayService,
			cacheService,
			snowflakeService,
			guildAuditLogService,
			limitConfigService,
		);
	}

	async getChannels(params: {
		userId: UserID;
		guildId: GuildID;
		requestCache: RequestCache;
	}): Promise<Array<ChannelResponse>> {
		const guildData = await this.gatewayService.getGuildData({guildId: params.guildId, userId: params.userId});
		const isGuildOwner = guildData.owner_id === params.userId.toString();
		const viewableChannelIds = await this.gatewayService.getViewableChannels({
			guildId: params.guildId,
			userId: params.userId,
		});
		const channels = await this.channelRepository.listGuildChannels(params.guildId);
		const viewableChannels = channels.filter((channel) => viewableChannelIds.includes(channel.id));

		const responses = await Promise.all(
			viewableChannels.map(async (channel) => {
				if (isGuildOwner) {
					const effectiveGate = await this.tokenGateService.resolveEffectiveTokenGate(channel);
					return mapChannelToResponse({
						channel,
						currentUserId: null,
						userCacheService: this.userCacheService,
						requestCache: params.requestCache,
						tokenGateSatisfied: effectiveGate ? true : undefined,
					});
				}
				const [gateStatus, effectiveVisibility] = await Promise.all([
					this.tokenGateService.isChannelUnlockedForUser({channel, userId: params.userId}),
					this.tokenGateService.resolveEffectiveTokenGateVisibility(channel),
				]);
				const hideGatedChannel = effectiveVisibility === TokenGateVisibility.HIDDEN;
				if (hideGatedChannel && (gateStatus === 'unsatisfied' || gateStatus === 'unavailable')) {
					return null;
				}
				return mapChannelToResponse({
					channel,
					currentUserId: null,
					userCacheService: this.userCacheService,
					requestCache: params.requestCache,
					tokenGateSatisfied: gateStatus === 'no_gate' ? undefined : gateStatus === 'satisfied',
				});
			}),
		);

		return responses.filter((response): response is ChannelResponse => response !== null);
	}

	async createChannel(
		params: {userId: UserID; guildId: GuildID; data: ChannelCreateRequest; requestCache: RequestCache},
		auditLogReason?: string | null,
	): Promise<ChannelResponse> {
		await this.checkPermission({
			userId: params.userId,
			guildId: params.guildId,
			permission: Permissions.MANAGE_CHANNELS,
		});
		return this.channelOps.createChannel(params, auditLogReason);
	}

	async updateChannelPositions(
		params: {
			userId: UserID;
			guildId: GuildID;
			updates: Array<{
				channelId: ChannelID;
				position?: number;
				parentId: ChannelID | null | undefined;
				precedingSiblingId: ChannelID | null | undefined;
				lockPermissions: boolean;
			}>;
			requestCache: RequestCache;
		},
		auditLogReason?: string | null,
	): Promise<void> {
		await this.checkPermission({
			userId: params.userId,
			guildId: params.guildId,
			permission: Permissions.MANAGE_CHANNELS,
		});
		await this.channelOps.updateChannelPositionsByList({
			userId: params.userId,
			guildId: params.guildId,
			updates: params.updates,
			requestCache: params.requestCache,
			auditLogReason: auditLogReason ?? null,
		});
	}

	async sanitizeTextChannelNames(params: {guildId: GuildID; requestCache: RequestCache}): Promise<void> {
		await this.channelOps.sanitizeTextChannelNames(params);
	}

	private async checkPermission(params: {userId: UserID; guildId: GuildID; permission: bigint}): Promise<void> {
		const hasPermission = await this.gatewayService.checkPermission({
			guildId: params.guildId,
			userId: params.userId,
			permission: params.permission,
		});
		if (!hasPermission) throw new MissingPermissionsError();
	}
}
