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

import type {ChannelID, UserID} from '@fluxer/api/src/BrandedTypes';
import {createChannelID, createUserID} from '@fluxer/api/src/BrandedTypes';
import type {IChannelRepository} from '@fluxer/api/src/channel/IChannelRepository';
import {ApplicationCommandInteractionAuthService} from '@fluxer/api/src/channel/services/interaction/ApplicationCommandInteractionAuthService';
import {MessageMentionService} from '@fluxer/api/src/channel/services/message/MessageMentionService';
import type {TokenGateService} from '@fluxer/api/src/channel/services/TokenGateService';
import type {
	ApplicationCommandOptionDefinition,
	ApplicationCommandRow,
} from '@fluxer/api/src/database/types/ApplicationCommandTypes';
import type {IGuildRepositoryAggregate} from '@fluxer/api/src/guild/repositories/IGuildRepositoryAggregate';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {ApplicationCommand} from '@fluxer/api/src/models/ApplicationCommand';
import type {Channel} from '@fluxer/api/src/models/Channel';
import type {User} from '@fluxer/api/src/models/User';
import type {IApplicationCommandRepository} from '@fluxer/api/src/oauth/repositories/IApplicationCommandRepository';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {mapUserToPartialResponse} from '@fluxer/api/src/user/UserMappers';
import {Permissions, TEXT_BASED_CHANNEL_TYPES} from '@fluxer/constants/src/ChannelConstants';
import {BotNotInChannelError} from '@fluxer/errors/src/domains/channel/BotNotInChannelError';
import {CannotSendMessageToNonTextChannelError} from '@fluxer/errors/src/domains/channel/CannotSendMessageToNonTextChannelError';
import {InvalidInteractionOptionError} from '@fluxer/errors/src/domains/channel/InvalidInteractionOptionError';
import {UnknownApplicationCommandError} from '@fluxer/errors/src/domains/channel/UnknownApplicationCommandError';
import type {InteractionOptions, InteractionResponse} from '@fluxer/schema/src/domains/channel/InteractionSchemas';
import type {IWorkerService} from '@fluxer/worker/src/contracts/IWorkerService';

type InteractionOptionValue = InteractionOptions[string];

export class ApplicationCommandInteractionService {
	private readonly authService: ApplicationCommandInteractionAuthService;
	private readonly mentionService: MessageMentionService;

	constructor(
		private readonly channelRepository: IChannelRepository,
		userRepository: IUserRepository,
		private readonly guildRepository: IGuildRepositoryAggregate,
		private readonly gatewayService: IGatewayService,
		tokenGateService: TokenGateService,
		private readonly applicationCommandRepository: IApplicationCommandRepository,
		private readonly snowflakeService: SnowflakeService,
		workerService: IWorkerService,
	) {
		this.authService = new ApplicationCommandInteractionAuthService(
			channelRepository,
			userRepository,
			guildRepository,
			gatewayService,
			tokenGateService,
		);
		this.mentionService = new MessageMentionService(userRepository, guildRepository, workerService);
	}

	/**
	 * Validate and deliver an interaction, then return the same payload that
	 * was dispatched. This is an "accepted" acknowledgment, not the bot's
	 * actual reply — the bot's reply is a separate, later, ordinary
	 * `sendMessage` call that renders through the normal message pipeline.
	 */
	async createInteraction(params: {
		user: User;
		channelId: ChannelID;
		botUserId: UserID;
		commandName: string;
		options: InteractionOptions;
	}): Promise<InteractionResponse> {
		const authChannel = await this.authService.getChannelAuthenticated({
			userId: params.user.id,
			channelId: params.channelId,
		});
		// Invoking a command is treated like sending a message to the channel: no
		// dedicated "use application commands" permission exists yet.
		await authChannel.checkPermission(Permissions.SEND_MESSAGES);

		const {channel} = authChannel;
		this.ensureTextChannel(channel);

		const commandRow = await this.findCommandRow(params.botUserId, params.commandName);
		const command = new ApplicationCommand(commandRow);

		await this.assertBotInScope({channel, botUserId: params.botUserId});

		const resolvedOptions = await this.resolveOptions({
			command,
			channel,
			userId: params.user.id,
			rawOptions: params.options,
		});

		const interactionId = await this.snowflakeService.generate();

		const payload: InteractionResponse = {
			id: interactionId.toString(),
			application_id: command.applicationId.toString(),
			channel_id: channel.id.toString(),
			guild_id: channel.guildId ? channel.guildId.toString() : undefined,
			command: {name: command.name},
			options: resolvedOptions,
			user: mapUserToPartialResponse(params.user),
		};

		// Point-to-point, not dispatchGuild: this delivers only to the bot's own
		// gateway sessions, regardless of whether the invoking channel is a
		// guild channel, DM, or group DM. dispatchGuild would broadcast the
		// interaction — including option values — to every session in the
		// guild, which is both wasteful and a privacy leak for what should be a
		// point-to-point action.
		await this.gatewayService.dispatchPresence({
			userId: params.botUserId,
			event: 'INTERACTION_CREATE',
			data: payload,
		});

		return payload;
	}

	private async findCommandRow(botUserId: UserID, commandName: string): Promise<ApplicationCommandRow> {
		const rows = await this.applicationCommandRepository.listForBotUser(botUserId);
		const row = rows.find((candidate) => candidate.name === commandName);
		if (!row) {
			throw new UnknownApplicationCommandError();
		}
		return row;
	}

	private async assertBotInScope({channel, botUserId}: {channel: Channel; botUserId: UserID}): Promise<void> {
		if (channel.guildId) {
			const member = await this.guildRepository.getMember(channel.guildId, botUserId);
			if (!member) {
				throw new BotNotInChannelError();
			}
			return;
		}

		if (!channel.recipientIds.has(botUserId)) {
			throw new BotNotInChannelError();
		}
	}

	private ensureTextChannel(channel: Channel): void {
		if (!TEXT_BASED_CHANNEL_TYPES.has(channel.type)) {
			throw new CannotSendMessageToNonTextChannelError();
		}
	}

	private async resolveOptions(params: {
		command: ApplicationCommand;
		channel: Channel;
		userId: UserID;
		rawOptions: InteractionOptions;
	}): Promise<InteractionOptions> {
		const {command, channel, userId, rawOptions} = params;
		const declaredByName = new Map(command.options.map((option) => [option.name, option]));

		for (const key of Object.keys(rawOptions)) {
			if (!declaredByName.has(key)) {
				throw new InvalidInteractionOptionError({name: key});
			}
		}

		const resolved: InteractionOptions = {};

		for (const option of command.options) {
			const rawValue = rawOptions[option.name];
			if (rawValue === undefined) {
				if (option.required) {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				continue;
			}

			resolved[option.name] = await this.coerceOptionValue({option, channel, userId, rawValue});
		}

		return resolved;
	}

	private async coerceOptionValue(params: {
		option: ApplicationCommandOptionDefinition;
		channel: Channel;
		userId: UserID;
		rawValue: InteractionOptionValue;
	}): Promise<InteractionOptionValue> {
		const {option, channel, userId, rawValue} = params;

		switch (option.type) {
			case 'STRING': {
				if (typeof rawValue !== 'string') {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				this.assertChoice(option, rawValue);
				return rawValue;
			}
			case 'INTEGER': {
				if (typeof rawValue !== 'number' || !Number.isInteger(rawValue)) {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				this.assertChoice(option, rawValue);
				return rawValue;
			}
			case 'BOOLEAN': {
				if (typeof rawValue !== 'boolean') {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				return rawValue;
			}
			case 'USER': {
				if (typeof rawValue !== 'string') {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				const userId = this.parseSnowflakeOrThrow(rawValue, option.name, createUserID);
				const {validUserIds} = await this.mentionService.validateMentions({
					userMentions: new Set([userId]),
					roleMentions: new Set(),
					channel,
				});
				if (validUserIds.length === 0) {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				return rawValue;
			}
			case 'CHANNEL': {
				if (typeof rawValue !== 'string') {
					throw new InvalidInteractionOptionError({name: option.name});
				}
				await this.assertChannelVisible(rawValue, channel, userId, option.name);
				return rawValue;
			}
			default:
				throw new InvalidInteractionOptionError({name: option.name});
		}
	}

	private assertChoice(option: ApplicationCommandOptionDefinition, value: string | number): void {
		if (!option.choices || option.choices.length === 0) {
			return;
		}
		const allowed = option.choices.some((choice) => choice.value === value);
		if (!allowed) {
			throw new InvalidInteractionOptionError({name: option.name});
		}
	}

	private parseSnowflakeOrThrow<T>(value: string, optionName: string, brand: (id: bigint) => T): T {
		try {
			return brand(BigInt(value));
		} catch {
			throw new InvalidInteractionOptionError({name: optionName});
		}
	}

	private async assertChannelVisible(
		value: string,
		invokingChannel: Channel,
		userId: UserID,
		optionName: string,
	): Promise<void> {
		const targetChannelId = this.parseSnowflakeOrThrow(value, optionName, createChannelID);

		const target = await this.channelRepository.findUnique(targetChannelId);
		if (!target) {
			throw new InvalidInteractionOptionError({name: optionName});
		}

		// A CHANNEL option can only reference a channel in the same scope as the
		// one the command was invoked from: another channel in the same guild,
		// or — in a DM/group DM, where there is no "other channel" to reference
		// — the invoking channel itself.
		const sameScope = invokingChannel.guildId
			? target.guildId === invokingChannel.guildId
			: target.id === invokingChannel.id;

		if (!sameScope) {
			throw new InvalidInteractionOptionError({name: optionName});
		}

		// Same-guild scope alone isn't enough: the target channel may carry
		// per-member/per-role overwrites that hide it from the invoking user.
		// Without this, any guild member could pass a private/staff-only
		// channel's id as a CHANNEL option value and use it as an oracle to
		// confirm the channel's existence, even though they can't otherwise see
		// it. The invoking channel itself is always visible by construction
		// (auth already ran against it), so this only matters for the
		// guild-scoped, different-target-channel case.
		if (target.guildId && target.id !== invokingChannel.id) {
			const canView = await this.gatewayService.checkPermission({
				guildId: target.guildId,
				userId,
				permission: Permissions.VIEW_CHANNEL,
				channelId: target.id,
			});
			if (!canView) {
				throw new InvalidInteractionOptionError({name: optionName});
			}
		}
	}
}
