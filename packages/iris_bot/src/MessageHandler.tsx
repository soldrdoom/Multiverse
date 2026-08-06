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

import type {Logger} from 'pino';
import {MASS_DELETE_MAX, type ModerationProvider} from './ModerationService';
import type {PriceProvider} from './SolPriceService';

/**
 * The message-sending contract this handler was written against (the deleted
 * local RestClient's `sendMessage`). index.tsx adapts @fluxer/bot_sdk to this
 * interface so the handler's logic stays untouched.
 */
export interface MessageSender {
	sendMessage(apiBaseUrl: string, channelId: string, content: string): Promise<void>;
}

/**
 * Resolves a channel's numeric type. index.tsx adapts the SDK's getChannel;
 * implementations should throw on failure so the handler can fail closed.
 */
export interface ChannelTypeResolver {
	getChannelType(channelId: string): Promise<number>;
}

interface MessageCreatePayload {
	id: string;
	channel_id: string;
	guild_id?: string;
	author: {id: string; bot?: boolean};
	content: string;
	encrypted_content?: string | null;
}

// ChannelTypes.DM in packages/constants/src/ChannelConstants.tsx. Kept as a
// local constant so iris_bot doesn't re-grow a @fluxer/constants dependency
// (dropped in the 1.6a transport swap) for a single value.
const DM_CHANNEL_TYPE = 1;

// I.R.I.S. doesn't discuss the platform beyond this canned deflection — with
// no model behind it there is nothing to hallucinate, but the deflection stays
// so platform questions get a consistent, deliberate answer.
const PLATFORM_KEYWORDS = [
	'multiverse',
	'self-host',
	'self host',
	'selfhost',
	'whitepaper',
	'white paper',
	'roadmap',
	'tokenomics',
	'plutonium',
	'identity vault',
	'agplv3',
	'agpl',
	'csam',
];
const PLATFORM_DEFLECTION =
	"I can't get into that right now — ask my creator directly! Happy to chat about anything else though.";

// The LLM was removed for now (2026-07-26): every non-platform DM gets this
// fixed line instead of a generated reply. Guild and group-DM messages get no
// reply at all — a canned bot answering shared channels would be noise.
const LIGHTWEIGHT_REPLY =
	"I'm running in lightweight mode right now, so I can't hold a real conversation — but I'm still here, and smarter days are coming!";

// I.R.I.S.'s first real command. Unlike the canned deflection/lightweight
// replies above, /sol answers in guild channels too, not just DMs — it's a
// deliberate exception to the "guild traffic is read but never answered"
// rule below, not a loosening of it.
const SOL_COMMAND_PATTERN = /^\/sol$/i;
const SOL_PRICE_ERROR_REPLY = "Couldn't fetch the SOL price right now — try again in a bit.";

// I.R.I.S.'s first destructive command, gated on guild Administrator (owner
// or a role with the ADMINISTRATOR bit — see ModerationService.tsx). Like
// /sol it only makes sense outside DMs, but unlike /sol it stays inside the
// guild gate below: it's meaningless without a guild to check permissions
// against, so it doesn't need a bypass.
const MASS_COMMAND_PATTERN = /^\/mass(?:\s+(\d+))?$/i;
const MASS_FORBIDDEN_REPLY = 'Only server administrators can use /mass.';
// Kept distinct from MASS_DELETE_ERROR_REPLY on purpose: a permission-check
// failure means I.R.I.S. itself couldn't read guild/role data (its own bot
// role is missing a permission, e.g. Manage Roles), which is a different fix
// than a delete failure (its bot role is missing Manage Messages/Admin) —
// collapsing these into one message cost a live-log dive to tell apart once.
const MASS_PERMISSION_CHECK_ERROR_REPLY = "Couldn't verify your permissions right now — try again in a bit.";
const MASS_DELETE_ERROR_REPLY = 'Something went wrong deleting those messages — try again in a bit.';

function mentionsPlatform(content: string): boolean {
	const lower = content.toLowerCase();
	return PLATFORM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isSolCommand(content: string): boolean {
	return SOL_COMMAND_PATTERN.test(content.trim());
}

function formatSolPriceReply(usd: number, change24h: number): string {
	const arrow = change24h >= 0 ? '▲' : '▼';
	return `SOL is currently $${usd.toFixed(2)} USD (${arrow} ${Math.abs(change24h).toFixed(2)}% 24h)`;
}

/** `undefined` = not a /mass invocation at all; `null` = /mass with no/bad count; else the parsed count. */
function parseMassCommand(content: string): number | null | undefined {
	const match = MASS_COMMAND_PATTERN.exec(content.trim());
	if (!match) return undefined;
	if (match[1] === undefined) return null;
	return Number(match[1]);
}

function massUsageReply(): string {
	return `Usage: /mass <count> — deletes the command message plus the <count> messages before it in this channel (1-${MASS_DELETE_MAX}). Server administrators only.`;
}

export class MessageHandler {
	private readonly channelTypes = new Map<string, number>();

	constructor(
		private readonly botUserId: string,
		private readonly apiBaseUrl: string,
		private readonly restClient: MessageSender,
		private readonly channelResolver: ChannelTypeResolver,
		private readonly log: Logger,
		private readonly priceProvider: PriceProvider,
		private readonly moderationProvider: ModerationProvider,
	) {}

	handleDispatch(eventType: string, data: unknown): void {
		if (eventType !== 'MESSAGE_CREATE') return;
		this.handleMessageCreate(data as MessageCreatePayload).catch((err) => {
			this.log.error({err}, 'Failed to handle MESSAGE_CREATE');
		});
	}

	private async handleMessageCreate(message: MessageCreatePayload): Promise<void> {
		if (message.author.id === this.botUserId) return;
		if (message.author.bot) return;

		if (!message.content) {
			if (message.encrypted_content) {
				this.log.info({channelId: message.channel_id}, 'Skipping end-to-end encrypted message, cannot read content');
			}
			return;
		}

		// Checked ahead of the guild gate below: /sol is the one command that
		// answers in guild channels too, not just DMs.
		if (isSolCommand(message.content)) {
			await this.handleSolCommand(message.channel_id);
			return;
		}

		if (message.guild_id) {
			const massCount = parseMassCommand(message.content);
			if (massCount !== undefined) {
				await this.handleMassCommand(message, message.guild_id, massCount);
			}
			// Guild traffic is read but never answered (beyond /sol and /mass).
			return;
		}

		// Strictly 1:1 DMs: the absence of guild_id alone also matches group
		// DMs (they ride the presence dispatch path), so resolve the channel
		// type and fail closed if it can't be determined.
		if (!(await this.isDirectMessageChannel(message.channel_id))) return;

		this.log.info({channelId: message.channel_id}, 'Replying to message');

		const reply = mentionsPlatform(message.content) ? PLATFORM_DEFLECTION : LIGHTWEIGHT_REPLY;
		await this.restClient.sendMessage(this.apiBaseUrl, message.channel_id, reply);
	}

	private async handleSolCommand(channelId: string): Promise<void> {
		this.log.info({channelId}, 'Handling /sol command');
		try {
			const {usd, change24h} = await this.priceProvider.getSolPrice();
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, formatSolPriceReply(usd, change24h));
		} catch (err) {
			this.log.error({err, channelId}, 'Failed to fetch SOL price');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, SOL_PRICE_ERROR_REPLY);
		}
	}

	private async handleMassCommand(message: MessageCreatePayload, guildId: string, count: number | null): Promise<void> {
		const {channel_id: channelId, author} = message;

		if (count === null) {
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, massUsageReply());
			return;
		}
		if (!Number.isInteger(count) || count < 1 || count > MASS_DELETE_MAX) {
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, massUsageReply());
			return;
		}

		this.log.info({guildId, channelId, requestedBy: author.id, count}, '/mass command invoked');

		let isAdmin: boolean;
		try {
			isAdmin = await this.moderationProvider.isGuildAdministrator(guildId, author.id);
		} catch (err) {
			this.log.error({err, guildId, channelId, requestedBy: author.id}, 'Failed to verify /mass permission');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_PERMISSION_CHECK_ERROR_REPLY);
			return;
		}
		if (!isAdmin) {
			this.log.warn(
				{guildId, channelId, requestedBy: author.id},
				'/mass denied: requester is not a server administrator',
			);
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_FORBIDDEN_REPLY);
			return;
		}

		try {
			const deletedCount = await this.moderationProvider.massDeleteMessages({
				channelId,
				commandMessageId: message.id,
				count,
			});
			this.log.info({guildId, channelId, requestedBy: author.id, deletedCount}, '/mass completed');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, `🗑️ Deleted up to ${deletedCount} message(s).`);
		} catch (err) {
			this.log.error({err, guildId, channelId, requestedBy: author.id}, '/mass failed');
			await this.restClient.sendMessage(this.apiBaseUrl, channelId, MASS_DELETE_ERROR_REPLY);
		}
	}

	private async isDirectMessageChannel(channelId: string): Promise<boolean> {
		const cached = this.channelTypes.get(channelId);
		if (cached !== undefined) return cached === DM_CHANNEL_TYPE;

		try {
			const type = await this.channelResolver.getChannelType(channelId);
			this.channelTypes.set(channelId, type);
			return type === DM_CHANNEL_TYPE;
		} catch (err) {
			this.log.warn({err, channelId}, 'Could not resolve channel type; not replying');
			return false;
		}
	}
}
