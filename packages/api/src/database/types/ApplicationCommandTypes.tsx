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

import type {ApplicationCommandID, ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';

export const APPLICATION_COMMAND_OPTION_TYPES = ['STRING', 'INTEGER', 'USER', 'CHANNEL', 'BOOLEAN'] as const;
export type ApplicationCommandOptionType = (typeof APPLICATION_COMMAND_OPTION_TYPES)[number];

export interface ApplicationCommandOptionChoice {
	name: string;
	value: string | number;
}

export interface ApplicationCommandOptionDefinition {
	name: string;
	description: string;
	type: ApplicationCommandOptionType;
	required: boolean;
	choices?: Array<ApplicationCommandOptionChoice>;
}

/**
 * One row per registered global bot command.
 *
 * Keyed on (bot_user_id, name) rather than application_id: both read paths this
 * feature needs (a bot resolving its own commands from its token-derived user
 * id, and a client resolving a guild member's commands from that member's user
 * id) arrive with a bot user id in hand, never an application_id
 * (`BotTokenService.resolveToken` resolves a token straight to a UserID and
 * discards application_id). application_id is kept as a plain display/audit
 * column, parsed off the bot token the same way `OAuth2RequestService.getApplicationsMe`
 * does.
 *
 * `id` is a snowflake synthesized at registration time. It is not part of the
 * primary key — the primary key is (bot_user_id, name), so re-registering the
 * same command name replaces the row in place and keeps read paths a single
 * partition query.
 *
 * `options` is `JSON.stringify(Array<ApplicationCommandOptionDefinition>)`,
 * the same convention `guild_audit_logs.changes` uses for structured data
 * that doesn't need to be queried on directly.
 */
export interface ApplicationCommandRow {
	id: ApplicationCommandID;
	bot_user_id: UserID;
	name: string;
	application_id: ApplicationID;
	description: string;
	options: string;
	created_at: Date;
	updated_at: Date;
}

export const APPLICATION_COMMAND_COLUMNS = [
	'id',
	'bot_user_id',
	'name',
	'application_id',
	'description',
	'options',
	'created_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof ApplicationCommandRow>;
