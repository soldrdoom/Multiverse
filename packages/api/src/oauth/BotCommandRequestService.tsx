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

import type {UserID} from '@fluxer/api/src/BrandedTypes';
import type {BotCommandService} from '@fluxer/api/src/oauth/BotCommandService';
import {parseBotToken} from '@fluxer/api/src/oauth/BotTokenService';
import {InvalidTokenError} from '@fluxer/errors/src/domains/core/InvalidTokenError';
import type {
	ApplicationCommandListResponse,
	BulkOverwriteCommandsRequest,
} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';

/**
 * Thin controller-facing wrapper, modeled on
 * OAuth2ApplicationsRequestService.createBotToken minus the sudo-mode step:
 * sudo mode is a human-session/MFA concept, and no bot-token-authenticated
 * endpoint uses SudoModeMiddleware today.
 */
export class BotCommandRequestService {
	constructor(private readonly botCommandService: BotCommandService) {}

	/**
	 * `rawBotToken` is the token as it appears on the wire (without the `Bot `
	 * prefix) — `ctx.get('authToken')`, already set by UserMiddleware for the
	 * request that authenticated as this bot. application_id is parsed off of
	 * it the same way `OAuth2RequestService.getApplicationsMe` does, rather
	 * than re-deriving it, since the two are not guaranteed to stay a trivial
	 * rebrand of each other forever.
	 */
	async bulkOverwrite(params: {
		botUserId: UserID;
		rawBotToken: string | undefined;
		body: BulkOverwriteCommandsRequest;
	}): Promise<ApplicationCommandListResponse> {
		const parsed = params.rawBotToken ? parseBotToken(params.rawBotToken) : null;
		if (!parsed) {
			throw new InvalidTokenError();
		}

		const commands = await this.botCommandService.bulkOverwrite({
			botUserId: params.botUserId,
			applicationId: parsed.applicationId,
			commands: params.body.commands,
		});

		return commands.map((command) => command.toResponse());
	}

	/**
	 * Always returns an empty array for a user id with nothing registered —
	 * that's every non-bot user, and every bot that hasn't called
	 * bulkOverwrite yet — never a 404. Commands are only ever written for an
	 * actual bot's user id, so a human user id naturally has no rows.
	 */
	async listForUser(userId: UserID): Promise<ApplicationCommandListResponse> {
		const commands = await this.botCommandService.listForBotUser(userId);
		return commands.map((command) => command.toResponse());
	}
}
