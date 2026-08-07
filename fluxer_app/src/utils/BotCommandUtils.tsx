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
import type {BotCommand} from '@app/hooks/useCommands';
import http from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';

const logger = new Logger('BotCommandUtils');

/** Tokens accepted for a BOOLEAN option's trailing text, case-insensitive. */
const BOOLEAN_TRUE_TOKENS = new Set(['true', 'yes', '1']);
const BOOLEAN_FALSE_TOKENS = new Set(['false', 'no', '0']);

export interface BotCommandMatch {
	botCommand: BotCommand;
	options: Record<string, string | number | boolean>;
}

/**
 * Coerces a single trailing-argument string against a declared option's
 * type. Returns `undefined` if the text can't be coerced (caller decides
 * whether that's fatal).
 *
 * USER/CHANNEL are a known, plan-acknowledged limitation: resolving a typed
 * mention out of raw trailing text isn't wired up on the input side yet, so
 * these pass the raw text straight through as a string rather than
 * resolving it to a snowflake. TODO: wire up mention-segment resolution for
 * these two types once the composer exposes matched mention segments to the
 * bot-command match step.
 */
function coerceOptionValue(
	rawValue: string,
	type: 'STRING' | 'INTEGER' | 'USER' | 'CHANNEL' | 'BOOLEAN',
): string | number | boolean | undefined {
	switch (type) {
		case 'STRING':
			return rawValue;
		case 'INTEGER': {
			const parsed = Number(rawValue);
			return Number.isInteger(parsed) ? parsed : undefined;
		}
		case 'BOOLEAN': {
			const normalized = rawValue.trim().toLowerCase();
			if (BOOLEAN_TRUE_TOKENS.has(normalized)) return true;
			if (BOOLEAN_FALSE_TOKENS.has(normalized)) return false;
			return undefined;
		}
		case 'USER':
		case 'CHANNEL':
			// Best-effort passthrough — see doc comment above.
			return rawValue;
		default:
			return undefined;
	}
}

/**
 * Checks whether `content` invokes one of `botCommands`, and if so parses
 * the single trailing argument (if the command declares exactly one
 * option) against that option's declared type.
 *
 * Scope, matching the rest of this feature: a command may have zero options
 * (any trailing text is ignored, matching today's `/sol` behavior) or
 * exactly one option (the entire trailing remainder is that option's raw
 * value — no delimiter/positional-args convention beyond that). Commands
 * declaring more than one option aren't matched here; multi-option
 * positional parsing is a known gap (see the implementation plan).
 *
 * Returns `null` on no match, on a required option missing, or on a
 * provided value that fails to coerce to its declared type — in all of
 * those cases the composer should fall through to treating the input as a
 * plain, unmatched message, the same way `CommandUtils.parseCommand`
 * silently falls through to `{type: 'unknown'}` today rather than showing a
 * dedicated usage-error UI.
 */
export function matchBotCommand(content: string, botCommands: Array<BotCommand>): BotCommandMatch | null {
	const trimmed = content.trim();
	if (!trimmed.startsWith('/')) {
		return null;
	}

	for (const botCommand of botCommands) {
		if (botCommand.options.length > 1) {
			continue;
		}

		const isExactMatch = trimmed === botCommand.name;
		const isPrefixMatch = trimmed.startsWith(`${botCommand.name} `);
		if (!isExactMatch && !isPrefixMatch) {
			continue;
		}

		const trailingText = isPrefixMatch ? trimmed.slice(botCommand.name.length).trim() : '';

		if (botCommand.options.length === 0) {
			return {botCommand, options: {}};
		}

		const option = botCommand.options[0];

		if (!trailingText) {
			if (option.required) {
				return null;
			}
			return {botCommand, options: {}};
		}

		const coerced = coerceOptionValue(trailingText, option.type);
		if (coerced === undefined) {
			return null;
		}

		return {botCommand, options: {[option.name]: coerced}};
	}

	return null;
}

/**
 * POSTs an interaction to the invoked bot. This is an "accepted"
 * acknowledgment, not the bot's reply — the reply arrives later as an
 * ordinary message through the normal gateway/message pipeline.
 */
export async function fireInteraction(
	channelId: string,
	botCommand: BotCommand,
	options: Record<string, string | number | boolean>,
): Promise<void> {
	try {
		await http.post(Endpoints.CHANNEL_INTERACTIONS(channelId), {
			bot_user_id: botCommand.botUserId,
			command_name: botCommand.name.replace(/^\//, ''),
			options,
		});
	} catch (error) {
		logger.error(`Failed to fire interaction for command ${botCommand.name}:`, error);
		throw error;
	}
}
