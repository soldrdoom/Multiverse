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
import type {InteractionResponse} from '@fluxer/bot_sdk/src/types/Api.generated';
import type {Logger} from 'pino';
import type {MessageSender} from './MessageHandler';
import {MASS_DELETE_MAX, type ModerationProvider} from './ModerationService';
import type {PriceProvider} from './SolPriceService';

// I.R.I.S.'s two real "/" commands, registered as structured application
// commands (see fluxer_vanguard's application-commands plan, Stage 4/5). The
// backend bulk-overwrite diffs before writing, so calling this on every
// process start is idempotent and cheap.
const COMMAND_DEFINITIONS = [
	{name: 'sol', description: 'Get the current SOL price', options: []},
	{
		name: 'mass',
		description: 'Delete this command plus the N messages before it',
		options: [
			{
				name: 'count',
				description: '1-100',
				type: 'INTEGER' as const,
				required: false,
			},
		],
	},
];

// Moved from MessageHandler.tsx verbatim: these are only used by the
// interaction-driven handlers now, not the regex-matched message path.
const SOL_PRICE_ERROR_REPLY = "Couldn't fetch the SOL price right now — try again in a bit.";
const MASS_FORBIDDEN_REPLY = 'Only server administrators can use /mass.';
// Kept distinct from MASS_DELETE_ERROR_REPLY on purpose: a permission-check
// failure means I.R.I.S. itself couldn't read guild/role data (its own bot
// role is missing a permission, e.g. Manage Roles), which is a different fix
// than a delete failure (its bot role is missing Manage Messages/Admin) —
// collapsing these into one message cost a live-log dive to tell apart once.
const MASS_PERMISSION_CHECK_ERROR_REPLY = "Couldn't verify your permissions right now — try again in a bit.";
const MASS_DELETE_ERROR_REPLY = 'Something went wrong deleting those messages — try again in a bit.';

function formatSolPriceReply(usd: number, change24h: number): string {
	const arrow = change24h >= 0 ? '▲' : '▼';
	return `SOL is currently $${usd.toFixed(2)} USD (${arrow} ${Math.abs(change24h).toFixed(2)}% 24h)`;
}

function massUsageReply(): string {
	return `Usage: /mass <count> — deletes the command message plus the <count> messages before it in this channel (1-${MASS_DELETE_MAX}). Server administrators only.`;
}

/**
 * Registers I.R.I.S.'s application commands and dispatches `INTERACTION_CREATE`
 * events to their handlers. Replaces the regex-matched `/sol` and `/mass`
 * paths that used to live in `MessageHandler.tsx` — the gating, bounds, and
 * reply copy are unchanged, only the trigger (a real interaction instead of a
 * `MESSAGE_CREATE` regex match) and the count source (`data.options.count`,
 * already typed, instead of parsed text) are different.
 */
export class CommandRegistry {
	constructor(
		private readonly apiBaseUrl: string,
		private readonly restClient: MessageSender,
		private readonly log: Logger,
		private readonly priceProvider: PriceProvider,
		private readonly moderationProvider: ModerationProvider,
	) {}

	async registerCommands(client: FluxerClient): Promise<void> {
		try {
			await client.api.bulkOverwriteGlobalCommands(COMMAND_DEFINITIONS);
			this.log.info({commands: COMMAND_DEFINITIONS.map((c) => c.name)}, 'Registered application commands');
		} catch (err) {
			this.log.error({err}, 'Failed to register application commands');
		}
	}

	handleInteraction(data: InteractionResponse): void {
		switch (data.command.name) {
			case 'sol':
				this.handleSolCommand(data).catch((err) => {
					this.log.error({err}, 'Failed to handle /sol interaction');
				});
				return;
			case 'mass':
				this.handleMassCommand(data).catch((err) => {
					this.log.error({err}, 'Failed to handle /mass interaction');
				});
				return;
			default:
				this.log.warn({command: data.command.name}, 'Unknown interaction command');
		}
	}

	private async handleSolCommand(data: InteractionResponse): Promise<void> {
		const {channel_id: channelId} = data;
		this.log.info({channelId}, 'Handling /sol command');
		try {
			const {usd, change24h} = await this.priceProvider.getSolPrice();
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, formatSolPriceReply(usd, change24h));
		} catch (err) {
			this.log.error({err, channelId}, 'Failed to fetch SOL price');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, SOL_PRICE_ERROR_REPLY);
		}
	}

	private async handleMassCommand(data: InteractionResponse): Promise<void> {
		const {id: interactionId, channel_id: channelId, guild_id: guildId, user} = data;

		// /mass is meaningless without a guild to check Administrator against
		// (mirrors the original regex path, which only ever reached
		// handleMassCommand inside `if (message.guild_id)`); a DM invocation has
		// no server admins to check, so it's treated the same as "not an admin".
		if (!guildId) {
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_FORBIDDEN_REPLY);
			return;
		}

		// `data.options` is a loosely-typed `Record<string, string | number |
		// boolean>` on the wire; the option is declared INTEGER, so a present
		// value should arrive as `number`, but guard against anything else
		// (missing entirely, or a mistyped value) by treating it as invalid.
		const rawCount = data.options.count;
		const count: number | null = rawCount === undefined ? null : typeof rawCount === 'number' ? rawCount : Number.NaN;

		if (count === null) {
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, massUsageReply());
			return;
		}
		if (!Number.isInteger(count) || count < 1 || count > MASS_DELETE_MAX) {
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, massUsageReply());
			return;
		}

		this.log.info({guildId, channelId, requestedBy: user.id, count}, '/mass command invoked');

		let isAdmin: boolean;
		try {
			isAdmin = await this.moderationProvider.isGuildAdministrator(guildId, user.id);
		} catch (err) {
			this.log.error({err, guildId, channelId, requestedBy: user.id}, 'Failed to verify /mass permission');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_PERMISSION_CHECK_ERROR_REPLY);
			return;
		}
		if (!isAdmin) {
			this.log.warn(
				{guildId, channelId, requestedBy: user.id},
				'/mass denied: requester is not a server administrator',
			);
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_FORBIDDEN_REPLY);
			return;
		}

		try {
			const deletedCount = await this.moderationProvider.massDeleteMessages({
				channelId,
				commandMessageId: interactionId,
				count,
			});
			this.log.info({guildId, channelId, requestedBy: user.id, deletedCount}, '/mass completed');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, `🗑️ Deleted up to ${deletedCount} message(s).`);
		} catch (err) {
			this.log.error({err, guildId, channelId, requestedBy: user.id}, '/mass failed');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_DELETE_ERROR_REPLY);
		}
	}
}
