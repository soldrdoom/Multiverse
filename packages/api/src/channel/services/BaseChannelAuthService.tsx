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
import {userIdToChannelId} from '@fluxer/api/src/BrandedTypes';
import type {IChannelRepositoryAggregate} from '@fluxer/api/src/channel/repositories/IChannelRepositoryAggregate';
import type {AuthenticatedChannel} from '@fluxer/api/src/channel/services/AuthenticatedChannel';
import {DMPermissionValidator} from '@fluxer/api/src/channel/services/DMPermissionValidator';
import type {TokenGateService} from '@fluxer/api/src/channel/services/TokenGateService';
import {SYSTEM_USER_ID} from '@fluxer/api/src/constants/Core';
import type {IGuildRepositoryAggregate} from '@fluxer/api/src/guild/repositories/IGuildRepositoryAggregate';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {Channel} from '@fluxer/api/src/models/Channel';
import type {User} from '@fluxer/api/src/models/User';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {TokenGateRequirementNotMetError} from '@fluxer/errors/src/domains/channel/TokenGateRequirementNotMetError';
import {TokenGateUnavailableError} from '@fluxer/errors/src/domains/channel/TokenGateUnavailableError';
import {UnknownChannelError} from '@fluxer/errors/src/domains/channel/UnknownChannelError';
import {AccessDeniedError} from '@fluxer/errors/src/domains/core/AccessDeniedError';
import {MissingPermissionsError} from '@fluxer/errors/src/domains/core/MissingPermissionsError';
import {UnknownGuildError} from '@fluxer/errors/src/domains/guild/UnknownGuildError';
import type {GuildResponse} from '@fluxer/schema/src/domains/guild/GuildResponseSchemas';

export interface ChannelAuthOptions {
	errorOnMissingGuild: 'unknown_channel' | 'missing_permissions';
	validateTokenGate: boolean;
}

export abstract class BaseChannelAuthService {
	protected abstract readonly options: ChannelAuthOptions;
	protected dmPermissionValidator: DMPermissionValidator;

	constructor(
		protected channelRepository: IChannelRepositoryAggregate,
		protected userRepository: IUserRepository,
		protected guildRepository: IGuildRepositoryAggregate,
		protected gatewayService: IGatewayService,
		protected tokenGateService: TokenGateService,
	) {
		this.dmPermissionValidator = new DMPermissionValidator({
			userRepository: this.userRepository,
			guildRepository: this.guildRepository,
		});
	}

	async getChannelAuthenticated({
		userId,
		channelId,
	}: {
		userId: UserID;
		channelId: ChannelID;
	}): Promise<AuthenticatedChannel> {
		if (this.isPersonalNotesChannel({userId, channelId})) {
			const channel = await this.channelRepository.channelData.findUnique(channelId);
			if (!channel) throw new UnknownChannelError();
			return this.getRealPersonalNotesChannelAuth({channel, userId});
		}

		const channel = await this.channelRepository.channelData.findUnique(channelId);
		if (!channel) throw new UnknownChannelError();

		if (!channel.guildId) {
			const recipients = await this.userRepository.listUsers(Array.from(channel.recipientIds));
			return this.getDMChannelAuth({channel, recipients, userId});
		}

		return this.getGuildChannelAuth({channel, userId});
	}

	isPersonalNotesChannel({userId, channelId}: {userId: UserID; channelId: ChannelID}): boolean {
		return userIdToChannelId(userId) === channelId;
	}

	protected async getRealPersonalNotesChannelAuth({
		channel,
		userId,
	}: {
		channel: Channel;
		userId: UserID;
	}): Promise<AuthenticatedChannel> {
		if (!this.isPersonalNotesChannel({userId, channelId: channel.id})) {
			throw new UnknownChannelError();
		}

		if (channel.type !== ChannelTypes.DM_PERSONAL_NOTES) {
			throw new UnknownChannelError();
		}

		return {
			channel,
			guild: null,
			member: null,
			hasPermission: async () => true,
			checkPermission: async () => {},
		};
	}

	protected async getDMChannelAuth({
		channel,
		recipients,
		userId,
	}: {
		channel: Channel;
		recipients: Array<User>;
		userId: UserID;
	}): Promise<AuthenticatedChannel> {
		if (userId === SYSTEM_USER_ID) {
			return {
				channel,
				guild: null,
				member: null,
				hasPermission: async () => true,
				checkPermission: async () => {},
			};
		}

		const isRecipient = recipients.some((recipient) => recipient.id === userId);
		if (!isRecipient) throw new UnknownChannelError();

		return {
			channel,
			guild: null,
			member: null,
			hasPermission: async () => true,
			checkPermission: async () => {},
		};
	}

	async validateDMSendPermissions({channelId, userId}: {channelId: ChannelID; userId: UserID}): Promise<void> {
		const channel = await this.channelRepository.channelData.findUnique(channelId);
		if (!channel) throw new UnknownChannelError();

		if (channel.type === ChannelTypes.GROUP_DM || channel.type === ChannelTypes.DM_PERSONAL_NOTES) {
			return;
		}

		const recipients = await this.userRepository.listUsers(Array.from(channel.recipientIds));
		await this.dmPermissionValidator.validate({recipients, userId});
	}

	protected async getGuildChannelAuth({
		channel,
		userId,
	}: {
		channel: Channel;
		userId: UserID;
	}): Promise<AuthenticatedChannel> {
		const guildId = channel.guildId!;
		const guildDataResult = await this.fetchGuildDataOrThrow({guildId, userId});
		const guildMemberResult = await this.gatewayService.getGuildMember({guildId, userId});

		if (!guildDataResult) {
			this.throwGuildAccessError();
		}
		if (!guildMemberResult.success || !guildMemberResult.memberData) {
			this.throwGuildAccessError();
		}

		const hasPermission = async (permission: bigint): Promise<boolean> => {
			return await this.gatewayService.checkPermission({guildId, userId, permission, channelId: channel.id});
		};

		const checkPermission = async (permission: bigint): Promise<void> => {
			const allowed = await hasPermission(permission);
			if (!allowed) throw new MissingPermissionsError();
		};

		await checkPermission(Permissions.VIEW_CHANNEL);

		const isGuildOwner = guildDataResult!.owner_id === userId.toString();

		if (this.options.validateTokenGate && !isGuildOwner) {
			const gateStatus = await this.tokenGateService.isChannelUnlockedForUser({channel, userId});
			if (gateStatus === 'unsatisfied') throw new TokenGateRequirementNotMetError();
			if (gateStatus === 'unavailable') throw new TokenGateUnavailableError();
		}

		return {
			channel,
			guild: guildDataResult!,
			member: guildMemberResult.memberData!,
			hasPermission,
			checkPermission,
		};
	}

	protected throwGuildAccessError(): never {
		if (this.options.errorOnMissingGuild === 'missing_permissions') {
			throw new MissingPermissionsError();
		}
		throw new UnknownChannelError();
	}

	private async fetchGuildDataOrThrow(params: {guildId: GuildID; userId: UserID}): Promise<GuildResponse | null> {
		const {guildId, userId} = params;
		try {
			return await this.gatewayService.getGuildData({guildId, userId});
		} catch (error) {
			await this.handleGuildAccessError(error, guildId);
			return null;
		}
	}

	private async handleGuildAccessError(error: unknown, guildId: GuildID): Promise<void> {
		if (error instanceof UnknownGuildError) {
			if (await this.guildExists(guildId)) {
				throw new AccessDeniedError();
			}
			throw new UnknownGuildError();
		}
		throw error;
	}

	private async guildExists(guildId: GuildID): Promise<boolean> {
		const guild = await this.guildRepository.findUnique(guildId);
		return guild !== null;
	}
}
