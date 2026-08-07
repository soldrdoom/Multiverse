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
import type {
	ApplicationCommandListResponse,
	ApplicationCommandResponse,
} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';
import {makeAutoObservable, observable, reaction} from 'mobx';

const logger = new Logger('BotCommandStore');

/**
 * Commands registered by a bot, keyed by the bot's user id (not guild id or
 * application id) — commands are global per bot, so the same list applies
 * everywhere that bot is present, guild channels and DMs alike.
 */
class BotCommandStore {
	private readonly commandsByBotUserId = observable.map<string, Array<ApplicationCommandResponse>>();
	private readonly fetchedBotUserIds = observable.set<string>();
	private readonly fetchingBotUserIds = new Set<string>();
	private globalVersion = 0;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get version(): number {
		return this.globalVersion;
	}

	getCommands(botUserId: string): Array<ApplicationCommandResponse> {
		return this.commandsByBotUserId.get(botUserId) ?? [];
	}

	isFetched(botUserId: string): boolean {
		return this.fetchedBotUserIds.has(botUserId);
	}

	async ensureFetched(botUserId: string): Promise<void> {
		if (this.fetchedBotUserIds.has(botUserId) || this.fetchingBotUserIds.has(botUserId)) {
			return;
		}

		this.fetchingBotUserIds.add(botUserId);

		try {
			const response = await http.get<ApplicationCommandListResponse>(Endpoints.USER_APPLICATION_COMMANDS(botUserId));
			this.commandsByBotUserId.set(botUserId, response.body);
			this.fetchedBotUserIds.add(botUserId);
			this.bumpGlobalVersion();
		} catch (error) {
			logger.error(`Failed to fetch application commands for bot ${botUserId}:`, error);
		} finally {
			this.fetchingBotUserIds.delete(botUserId);
		}
	}

	private bumpGlobalVersion(): void {
		this.globalVersion += 1;
	}

	subscribe(callback: () => void): () => void {
		return reaction(
			() => this.version,
			() => callback(),
			{fireImmediately: true},
		);
	}
}

export default new BotCommandStore();
