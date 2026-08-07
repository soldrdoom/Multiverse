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

import {type ApplicationID, createApplicationCommandID, type UserID} from '@fluxer/api/src/BrandedTypes';
import type {ApplicationCommandRow} from '@fluxer/api/src/database/types/ApplicationCommandTypes';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {ApplicationCommand} from '@fluxer/api/src/models/ApplicationCommand';
import type {IApplicationCommandRepository} from '@fluxer/api/src/oauth/repositories/IApplicationCommandRepository';
import {InvalidApplicationCommandError} from '@fluxer/errors/src/domains/oauth/InvalidApplicationCommandError';
import {TooManyApplicationCommandsError} from '@fluxer/errors/src/domains/oauth/TooManyApplicationCommandsError';
import {
	type ApplicationCommand as ApplicationCommandInput,
	MAX_APPLICATION_COMMANDS,
} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';

export class BotCommandService {
	constructor(
		private readonly applicationCommandRepository: IApplicationCommandRepository,
		private readonly snowflakeService: SnowflakeService,
	) {}

	async listForBotUser(botUserId: UserID): Promise<Array<ApplicationCommand>> {
		const rows = await this.applicationCommandRepository.listForBotUser(botUserId);
		return sortByName(rows.map((row) => new ApplicationCommand(row)));
	}

	/**
	 * Replace the full set of global commands for a bot.
	 *
	 * Diffs the incoming set against what's already stored and only writes when
	 * something actually changed (a name added/removed, or a description/options
	 * change for a name that stayed). A bot that re-registers an identical set on
	 * every process start — the expected steady-state case — costs one read and
	 * no write. This diff is the only change-detection; there is no separate
	 * hash column.
	 */
	async bulkOverwrite(params: {
		botUserId: UserID;
		applicationId: ApplicationID;
		commands: Array<ApplicationCommandInput>;
	}): Promise<Array<ApplicationCommand>> {
		this.validateCommands(params.commands);

		const existing = await this.applicationCommandRepository.listForBotUser(params.botUserId);
		const existingByName = new Map(existing.map((row) => [row.name, row]));

		const now = new Date();
		let changed = existing.length !== params.commands.length;
		const rows: Array<ApplicationCommandRow> = [];

		for (const command of params.commands) {
			const existingRow = existingByName.get(command.name);
			const optionsJson = JSON.stringify(command.options);

			if (existingRow && existingRow.description === command.description && existingRow.options === optionsJson) {
				rows.push(existingRow);
				continue;
			}

			changed = true;
			rows.push({
				id: existingRow ? existingRow.id : createApplicationCommandID(await this.snowflakeService.generate()),
				bot_user_id: params.botUserId,
				name: command.name,
				application_id: params.applicationId,
				description: command.description,
				options: optionsJson,
				created_at: existingRow ? existingRow.created_at : now,
				updated_at: now,
			});
		}

		if (changed) {
			await this.applicationCommandRepository.replaceAllForBotUser(params.botUserId, rows);
		}

		return sortByName(rows.map((row) => new ApplicationCommand(row)));
	}

	private validateCommands(commands: Array<ApplicationCommandInput>): void {
		if (commands.length > MAX_APPLICATION_COMMANDS) {
			throw new TooManyApplicationCommandsError();
		}

		const seenCommandNames = new Set<string>();
		for (const command of commands) {
			if (seenCommandNames.has(command.name)) {
				throw new InvalidApplicationCommandError({name: command.name});
			}
			seenCommandNames.add(command.name);

			const seenOptionNames = new Set<string>();
			for (const option of command.options) {
				if (seenOptionNames.has(option.name)) {
					throw new InvalidApplicationCommandError({name: option.name});
				}
				seenOptionNames.add(option.name);

				if (!option.choices || option.choices.length === 0) {
					continue;
				}

				if (option.type !== 'STRING' && option.type !== 'INTEGER') {
					// Choices are a closed set of accepted values; only STRING and
					// INTEGER options have a value domain narrow enough for that to
					// make sense (mirrors why USER/CHANNEL/BOOLEAN can't have them).
					throw new InvalidApplicationCommandError({name: option.name});
				}

				for (const choice of option.choices) {
					const valueMatchesType =
						option.type === 'STRING' ? typeof choice.value === 'string' : typeof choice.value === 'number';
					if (!valueMatchesType) {
						throw new InvalidApplicationCommandError({name: option.name});
					}
				}
			}
		}
	}
}

function sortByName(commands: Array<ApplicationCommand>): Array<ApplicationCommand> {
	return [...commands].sort((a, b) => a.name.localeCompare(b.name));
}
