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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import ChannelStore from '@app/stores/ChannelStore';
import InviteStore from '@app/stores/InviteStore';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {Channel} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import type {Invite} from '@fluxer/schema/src/domains/invite/InviteSchemas';

const logger = new Logger('Channels');

export interface ChannelRtcRegion {
	id: string;
	name: string;
	emoji: string;
}

export async function create(
	guildId: string,
	params: Pick<Channel, 'name' | 'url' | 'type' | 'parent_id' | 'bitrate' | 'user_limit'>,
) {
	try {
		const response = await http.post<Channel>(Endpoints.GUILD_CHANNELS(guildId), params);
		return response.body;
	} catch (error) {
		logger.error('Failed to create channel:', error);
		throw error;
	}
}

export async function update(
	channelId: string,
	params: Partial<Pick<Channel, 'name' | 'topic' | 'url' | 'nsfw' | 'icon' | 'owner_id' | 'rtc_region'>>,
) {
	try {
		const response = await http.patch<Channel>(Endpoints.CHANNEL(channelId), params);
		return response.body;
	} catch (error) {
		logger.error(`Failed to update channel ${channelId}:`, error);
		throw error;
	}
}

export async function updateGroupDMNickname(channelId: string, userId: string, nickname: string | null) {
	try {
		const response = await http.patch<Channel>({
			url: Endpoints.CHANNEL(channelId),
			body: {
				nicks: {
					[userId]: nickname,
				},
			},
		});
		return response.body;
	} catch (error) {
		logger.error(`Failed to update nickname for user ${userId} in channel ${channelId}:`, error);
		throw error;
	}
}

export interface RemoveChannelOptions {
	optimistic?: boolean;
}

export async function remove(channelId: string, silent?: boolean, options?: RemoveChannelOptions) {
	const channel = ChannelStore.getChannel(channelId);
	const isPrivateChannel =
		channel != null && !channel.guildId && (channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM);
	const shouldOptimisticallyRemove = options?.optimistic ?? isPrivateChannel;

	if (shouldOptimisticallyRemove) {
		ChannelStore.removeChannelOptimistically(channelId);
	}

	try {
		await http.delete({
			url: Endpoints.CHANNEL(channelId),
			query: silent ? {silent: true} : undefined,
		});
		if (shouldOptimisticallyRemove) {
			ChannelStore.clearOptimisticallyRemovedChannel(channelId);
		}
	} catch (error) {
		if (shouldOptimisticallyRemove) {
			ChannelStore.rollbackChannelDeletion(channelId);
		}
		logger.error(`Failed to delete channel ${channelId}:`, error);
		throw error;
	}
}

export async function updatePermissionOverwrites(
	channelId: string,
	permissionOverwrites: Array<{id: string; type: 0 | 1; allow: string; deny: string}>,
) {
	try {
		const response = await http.patch<Channel>({
			url: Endpoints.CHANNEL(channelId),
			body: {permission_overwrites: permissionOverwrites},
		});
		return response.body;
	} catch (error) {
		logger.error(`Failed to update permission overwrites for channel ${channelId}:`, error);
		throw error;
	}
}

export async function setTokenGate(channelId: string, address: string, matchMode: number) {
	try {
		await http.put({url: Endpoints.CHANNEL_TOKEN_GATE(channelId), body: {address, match_mode: matchMode}});
	} catch (error) {
		logger.error(`Failed to set token gate for channel ${channelId}:`, error);
		throw error;
	}
}

export async function clearTokenGate(channelId: string) {
	try {
		await http.delete({url: Endpoints.CHANNEL_TOKEN_GATE(channelId)});
	} catch (error) {
		logger.error(`Failed to clear token gate for channel ${channelId}:`, error);
		throw error;
	}
}

export async function setTokenGateVisibility(channelId: string, visibility: number) {
	try {
		await http.put({url: Endpoints.CHANNEL_TOKEN_GATE_VISIBILITY(channelId), body: {visibility}});
	} catch (error) {
		logger.error(`Failed to set token gate visibility for channel ${channelId}:`, error);
		throw error;
	}
}

export interface TokenGateRecheckResult {
	satisfied: boolean;
	gate_address: string | null;
}

export async function recheckTokenGateAccess(channelId: string): Promise<TokenGateRecheckResult> {
	try {
		const response = await http.post<TokenGateRecheckResult>({url: Endpoints.CHANNEL_TOKEN_GATE_RECHECK(channelId)});
		ChannelStore.applyTokenGateRecheckResult(channelId, response.body.satisfied, response.body.gate_address);
		return response.body;
	} catch (error) {
		logger.error(`Failed to recheck token gate access for channel ${channelId}:`, error);
		throw error;
	}
}

export async function fetchChannelInvites(channelId: string): Promise<Array<Invite>> {
	try {
		InviteStore.handleChannelInvitesFetchPending(channelId);
		const response = await http.get<Array<Invite>>({url: Endpoints.CHANNEL_INVITES(channelId)});
		const data = response.body ?? [];
		InviteStore.handleChannelInvitesFetchSuccess(channelId, data);
		return data;
	} catch (error) {
		logger.error(`Failed to fetch invites for channel ${channelId}:`, error);
		InviteStore.handleChannelInvitesFetchError(channelId);
		throw error;
	}
}

export async function fetchRtcRegions(channelId: string): Promise<Array<ChannelRtcRegion>> {
	try {
		const response = await http.get<Array<ChannelRtcRegion>>({url: Endpoints.CHANNEL_RTC_REGIONS(channelId)});
		return response.body ?? [];
	} catch (error) {
		logger.error(`Failed to fetch RTC regions for channel ${channelId}:`, error);
		throw error;
	}
}
