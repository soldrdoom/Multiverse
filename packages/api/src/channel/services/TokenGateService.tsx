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

import type {GuildID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {IChannelRepositoryAggregate} from '@fluxer/api/src/channel/repositories/IChannelRepositoryAggregate';
import type {TokenGateCacheService} from '@fluxer/api/src/channel/services/TokenGateCacheService';
import type {IGuildRepositoryAggregate} from '@fluxer/api/src/guild/repositories/IGuildRepositoryAggregate';
import type {Channel} from '@fluxer/api/src/models/Channel';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {TokenGateMatchMode, TokenGateVisibility} from '@fluxer/constants/src/GuildConstants';

export type TokenGateStatus = 'no_gate' | 'satisfied' | 'unsatisfied' | 'unavailable';

export interface TokenGateRecheckResult {
	status: TokenGateStatus;
	gateAddress: string | null;
}

export class TokenGateService {
	constructor(
		private readonly channelRepository: IChannelRepositoryAggregate,
		private readonly userRepository: IUserRepository,
		private readonly cache: TokenGateCacheService,
		private readonly guildRepository: IGuildRepositoryAggregate,
	) {}

	/**
	 * A channel's own gate wins; otherwise it inherits its parent category's
	 * gate; otherwise it inherits the guild's own whole-server gate, if any.
	 * `null` means no gate applies at any of the three tiers.
	 */
	async resolveEffectiveTokenGate(channel: Channel): Promise<string | null> {
		if (channel.tokenGateAddress) return channel.tokenGateAddress;

		if (channel.parentId) {
			const parent = await this.channelRepository.channelData.findUnique(channel.parentId);
			if (parent?.tokenGateAddress) return parent.tokenGateAddress;
		}

		return this.resolveGuildTokenGate(channel.guildId);
	}

	/**
	 * A channel's own visibility choice wins; otherwise its parent category's;
	 * otherwise the guild's own whole-server visibility choice; otherwise
	 * LOCKED. Mirrors `resolveEffectiveTokenGate`'s inheritance shape.
	 */
	async resolveEffectiveTokenGateVisibility(channel: Channel): Promise<number> {
		if (channel.tokenGateVisibility !== null) return channel.tokenGateVisibility;

		if (channel.parentId) {
			const parent = await this.channelRepository.channelData.findUnique(channel.parentId);
			if (parent?.tokenGateVisibility != null) return parent.tokenGateVisibility;
		}

		if (channel.guildId) {
			const guild = await this.guildRepository.findUnique(channel.guildId);
			if (guild) return guild.tokenGateVisibility;
		}

		return TokenGateVisibility.LOCKED;
	}

	/**
	 * A channel's own match-mode choice wins; otherwise its parent category's;
	 * otherwise the guild's own whole-server match mode; otherwise EXACT_ASSET
	 * (the stricter of the two -- a bare address with no explicit mode should
	 * never accidentally widen access to an entire collection). Mirrors
	 * `resolveEffectiveTokenGate`'s inheritance shape.
	 */
	async resolveEffectiveTokenGateMatchMode(channel: Channel): Promise<number> {
		if (channel.tokenGateMatchMode !== null) return channel.tokenGateMatchMode;

		if (channel.parentId) {
			const parent = await this.channelRepository.channelData.findUnique(channel.parentId);
			if (parent?.tokenGateMatchMode != null) return parent.tokenGateMatchMode;
		}

		if (channel.guildId) {
			const guild = await this.guildRepository.findUnique(channel.guildId);
			if (guild?.tokenGateMatchMode != null) return guild.tokenGateMatchMode;
		}

		return TokenGateMatchMode.EXACT_ASSET;
	}

	/** The guild's own whole-server gate address, if channel/category-level gates don't apply. `null` if the guild has none, or `guildId` is null (e.g. a DM channel). */
	private async resolveGuildTokenGate(guildId: GuildID | null): Promise<string | null> {
		if (!guildId) return null;
		const guild = await this.guildRepository.findUnique(guildId);
		return guild?.tokenGateAddress ?? null;
	}

	/** Does this user currently satisfy the effective gate (own or inherited) on this channel? */
	async isChannelUnlockedForUser({channel, userId}: {channel: Channel; userId: UserID}): Promise<TokenGateStatus> {
		const gateAddress = await this.resolveEffectiveTokenGate(channel);
		if (!gateAddress) return 'no_gate';

		const user = await this.userRepository.findUnique(userId);
		if (!user?.solanaAddress) return 'unsatisfied';

		const matchMode = await this.resolveEffectiveTokenGateMatchMode(channel);
		return this.cache.check({wallet: user.solanaAddress, gateAddress, matchMode});
	}

	/** Force a fresh DAS lookup for this user's wallet, bypassing the cache, and return the fresh result. */
	async recheckAccess({channel, userId}: {channel: Channel; userId: UserID}): Promise<TokenGateRecheckResult> {
		const gateAddress = await this.resolveEffectiveTokenGate(channel);
		if (!gateAddress) return {status: 'no_gate', gateAddress: null};

		const user = await this.userRepository.findUnique(userId);
		if (!user?.solanaAddress) return {status: 'unsatisfied', gateAddress};

		const matchMode = await this.resolveEffectiveTokenGateMatchMode(channel);
		await this.cache.invalidate({wallet: user.solanaAddress, gateAddress, matchMode});
		const status = await this.cache.check({wallet: user.solanaAddress, gateAddress, matchMode});
		return {status, gateAddress};
	}
}
