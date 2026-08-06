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

import type {FluxerClient} from '@fluxer/bot_sdk/src/index';

/**
 * Permissions.ADMINISTRATOR in packages/constants/src/ChannelConstants.tsx.
 * Kept as a local constant rather than a @fluxer/constants dependency, same
 * rationale as MessageHandler's DM_CHANNEL_TYPE: one bit doesn't justify
 * re-growing the dependency this package dropped in the 1.6a transport swap.
 * ADMINISTRATOR is the one permission that bypasses channel overwrites
 * entirely, so checking it needs only guild-level role data below — no
 * channel permission_overwrites resolution required.
 */
const ADMINISTRATOR_PERMISSION = 1n << 3n;

// Server-enforced ceiling (MessageDeleteService.performBulkDelete): requests
// over 100 message_ids are rejected outright.
export const MASS_DELETE_MAX = 100;

export interface ModerationProvider {
	/** True if `userId` is the guild owner or holds a role with ADMINISTRATOR. */
	isGuildAdministrator(guildId: string, userId: string): Promise<boolean>;

	/**
	 * Deletes `commandMessageId` plus up to `count` messages preceding it in
	 * `channelId`, capped at MASS_DELETE_MAX total. Returns the number of
	 * message IDs submitted for deletion (the server returns 204 with no
	 * body, so this is "requested", not a confirmed-deleted count — some IDs
	 * may already not exist and are silently skipped server-side).
	 */
	massDeleteMessages(params: {channelId: string; commandMessageId: string; count: number}): Promise<number>;
}

export class ApiModerationProvider implements ModerationProvider {
	constructor(private readonly client: FluxerClient) {}

	async isGuildAdministrator(guildId: string, userId: string): Promise<boolean> {
		const guild = await this.client.api.getGuild(guildId);
		if (guild.owner_id === userId) return true;

		const [member, roles] = await Promise.all([
			this.client.api.getGuildMember(guildId, userId),
			this.client.api.listGuildRoles(guildId),
		]);

		// The @everyone role's id is the guild's own id (guildIdToRoleId in
		// packages/api/src/BrandedTypes.tsx just rebrands it) — it isn't
		// listed in member.roles, so it has to be added in explicitly.
		const memberRoleIds = new Set(member.roles);
		memberRoleIds.add(guildId);

		let combined = 0n;
		for (const role of roles) {
			if (memberRoleIds.has(role.id)) {
				combined |= BigInt(role.permissions);
			}
		}
		return (combined & ADMINISTRATOR_PERMISSION) !== 0n;
	}

	async massDeleteMessages(params: {channelId: string; commandMessageId: string; count: number}): Promise<number> {
		const {channelId, commandMessageId, count} = params;
		const priorLimit = Math.min(count, MASS_DELETE_MAX - 1);
		const priorMessages =
			priorLimit > 0
				? await this.client.api.listMessages(channelId, {limit: priorLimit, before: commandMessageId})
				: [];

		const ids = [commandMessageId, ...priorMessages.map((m) => m.id)].slice(0, MASS_DELETE_MAX);
		await this.client.api.bulkDeleteMessages(channelId, ids);
		return ids.length;
	}
}
