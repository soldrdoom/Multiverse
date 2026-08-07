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

import {UserPartialResponse} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {createStringType, SnowflakeStringType, SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

const InteractionOptionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const InteractionOptionsSchema = z.record(z.string(), InteractionOptionValueSchema);

export type InteractionOptions = z.infer<typeof InteractionOptionsSchema>;

export const InteractionCreateRequest = z.object({
	bot_user_id: SnowflakeType.describe('The user ID of the bot to invoke a command on'),
	command_name: createStringType(1, 32).describe('The name of the registered command to invoke'),
	// nullish, not just an object default: the shared request Validator
	// normalizes an empty `{}` body field to `null` before this schema ever
	// sees it, so an omitted/empty options map must tolerate both undefined
	// and null, not just undefined.
	options: InteractionOptionsSchema.nullish()
		.transform((value) => value ?? {})
		.describe('The option values to pass to the command'),
});

export type InteractionCreateRequest = z.infer<typeof InteractionCreateRequest>;

/**
 * Doubles as the shape of the `INTERACTION_CREATE` gateway dispatch payload
 * delivered to the invoked bot's own session — kept self-contained so it can
 * be imported directly by bot_sdk's generated gateway event types.
 */
export const InteractionResponse = z.object({
	id: SnowflakeStringType.describe('The unique identifier of this interaction'),
	application_id: SnowflakeStringType.describe('The invoked command’s owning application'),
	channel_id: SnowflakeStringType.describe('The channel the command was invoked in'),
	guild_id: SnowflakeStringType.optional().describe('The guild the command was invoked in, if any'),
	command: z.object({
		name: z.string().describe('The invoked command’s name'),
	}),
	options: InteractionOptionsSchema.describe('The validated option values the command was invoked with'),
	user: UserPartialResponse.describe('The user who invoked the command'),
});

export type InteractionResponse = z.infer<typeof InteractionResponse>;
