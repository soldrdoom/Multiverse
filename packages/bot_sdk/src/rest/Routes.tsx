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

import type {
	ApplicationsMeResponse,
	ChannelResponse,
	GatewayBotResponse,
	GuildMemberResponse,
	GuildResponse,
	GuildRoleResponse,
	MessageResponseSchema,
	UserPrivateResponse,
} from '../types/Api.generated';
import {BotEndpoints} from './Endpoints.generated';
import type {RestClient} from './RestClient';

/**
 * Ergonomic facade over the generated endpoint map. Deliberately small: it
 * covers what I.R.I.S. needs plus application self-service, and anything else
 * is reachable through `rest.callEndpoint(BotEndpoints.<operationId>, …)`.
 */

export interface SendMessagePayload {
	content: string;
	nonce?: string;
	[key: string]: unknown;
}

export class Routes {
	constructor(private readonly rest: RestClient) {}

	/** `POST /channels/:channel_id/messages`. Accepts a plain string or a full payload. */
	sendMessage(channelId: string, message: string | SendMessagePayload): Promise<MessageResponseSchema> {
		const body = typeof message === 'string' ? {content: message} : message;
		return this.rest.callEndpoint<MessageResponseSchema>(BotEndpoints.send_message, {
			params: {channel_id: channelId},
			body,
		});
	}

	/** `GET /channels/:channel_id`. */
	getChannel(channelId: string): Promise<ChannelResponse> {
		return this.rest.callEndpoint<ChannelResponse>(BotEndpoints.get_channel, {params: {channel_id: channelId}});
	}

	/** `GET /channels/:channel_id/messages`. */
	listMessages(
		channelId: string,
		options?: {limit?: number; before?: string; after?: string; around?: string},
	): Promise<Array<MessageResponseSchema>> {
		return this.rest.callEndpoint<Array<MessageResponseSchema>>(BotEndpoints.list_messages, {
			params: {channel_id: channelId},
			query: {limit: options?.limit, before: options?.before, after: options?.after, around: options?.around},
		});
	}

	/**
	 * `POST /channels/:channel_id/messages/bulk-delete`. Destructive and
	 * non-idempotent — deliberately not `retryable`. A blind retry after an
	 * ambiguous network failure could re-issue the delete against a
	 * different message set than intended; silence on ambiguous failure is
	 * safer than a surprise retry here.
	 */
	bulkDeleteMessages(channelId: string, messageIds: Array<string>): Promise<void> {
		return this.rest.callEndpoint<void>(BotEndpoints.bulk_delete_messages, {
			params: {channel_id: channelId},
			body: {message_ids: messageIds},
		});
	}

	/** `GET /guilds/:guild_id`. */
	getGuild(guildId: string): Promise<GuildResponse> {
		return this.rest.callEndpoint<GuildResponse>(BotEndpoints.get_guild, {params: {guild_id: guildId}});
	}

	/** `GET /guilds/:guild_id/members/:user_id`. */
	getGuildMember(guildId: string, userId: string): Promise<GuildMemberResponse> {
		return this.rest.callEndpoint<GuildMemberResponse>(BotEndpoints.get_guild_member, {
			params: {guild_id: guildId, user_id: userId},
		});
	}

	/** `GET /guilds/:guild_id/roles`. */
	listGuildRoles(guildId: string): Promise<Array<GuildRoleResponse>> {
		return this.rest.callEndpoint<Array<GuildRoleResponse>>(BotEndpoints.list_guild_roles, {
			params: {guild_id: guildId},
		});
	}

	/** `GET /users/@me` — the bot's own user. */
	getCurrentUser(): Promise<UserPrivateResponse> {
		return this.rest.callEndpoint<UserPrivateResponse>(BotEndpoints.get_current_user);
	}

	/** `GET /applications/@me` — the application this bot token belongs to. */
	getCurrentApplication(): Promise<ApplicationsMeResponse> {
		return this.rest.callEndpoint<ApplicationsMeResponse>(BotEndpoints.get_current_user_applications);
	}

	/**
	 * `GET /gateway/bot`. Hand-written path: the operation is public in the
	 * spec (`security: []`), so it is intentionally absent from the generated
	 * bot-only endpoint map. Note the contract from the platform docs:
	 * `shards` is authoritative and currently always 1 — read it, don't
	 * assume.
	 */
	getGatewayBot(): Promise<GatewayBotResponse> {
		return this.rest.request<GatewayBotResponse>('GET', '/gateway/bot');
	}
}
