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

import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {
	createNamedStringLiteralUnion,
	createStringType,
	SnowflakeStringType,
} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

/** Maximum number of commands a single bulk-overwrite call may register. */
export const MAX_APPLICATION_COMMANDS = 100;
/** Maximum number of options a single command may declare. */
export const MAX_APPLICATION_COMMAND_OPTIONS = 25;
/** Maximum number of choices a single option may declare. */
export const MAX_APPLICATION_COMMAND_OPTION_CHOICES = 25;

const APPLICATION_COMMAND_NAME_REGEX = /^[a-z0-9_]+$/;

export const ApplicationCommandOptionTypeSchema = createNamedStringLiteralUnion(
	[
		['STRING', 'STRING', 'A text value'],
		['INTEGER', 'INTEGER', 'A whole number value'],
		['USER', 'USER', 'A user ID, resolved against who/what is visible in the invoking context'],
		['CHANNEL', 'CHANNEL', 'A channel ID, resolved against what is visible in the invoking context'],
		['BOOLEAN', 'BOOLEAN', 'A true/false value'],
	] as const,
	'The data type of a command option',
);

export type ApplicationCommandOptionType = z.infer<typeof ApplicationCommandOptionTypeSchema>;

export const ApplicationCommandOptionChoiceSchema = z.object({
	name: createStringType(1, 100).describe('The user-facing label for this choice'),
	value: z.union([createStringType(1, 100), z.number()]).describe('The value submitted when this choice is picked'),
});

export type ApplicationCommandOptionChoice = z.infer<typeof ApplicationCommandOptionChoiceSchema>;

export const ApplicationCommandOptionSchema = z.object({
	name: createStringType(1, 32).describe('The option name, as referenced in the options map'),
	description: createStringType(1, 100).describe('A short description of the option'),
	type: ApplicationCommandOptionTypeSchema,
	required: z.boolean().default(false).describe('Whether the option must be supplied to invoke the command'),
	choices: z
		.array(ApplicationCommandOptionChoiceSchema)
		.max(MAX_APPLICATION_COMMAND_OPTION_CHOICES)
		.optional()
		.describe('A closed set of accepted values for this option'),
});

export type ApplicationCommandOption = z.infer<typeof ApplicationCommandOptionSchema>;

export const ApplicationCommandSchema = z.object({
	name: createStringType(1, 32)
		.refine((value) => APPLICATION_COMMAND_NAME_REGEX.test(value), ValidationErrorCodes.INVALID_FORMAT)
		.describe('The command name, lowercase letters/digits/underscores only'),
	description: createStringType(1, 100).describe('A short description of what the command does'),
	options: z
		.array(ApplicationCommandOptionSchema)
		.max(MAX_APPLICATION_COMMAND_OPTIONS)
		.default([])
		.describe('The typed options this command accepts'),
});

export type ApplicationCommand = z.infer<typeof ApplicationCommandSchema>;

export const BulkOverwriteCommandsRequest = z.object({
	commands: z
		.array(ApplicationCommandSchema)
		.max(MAX_APPLICATION_COMMANDS)
		.describe('The full set of global commands to register, replacing any existing set'),
});

export type BulkOverwriteCommandsRequest = z.infer<typeof BulkOverwriteCommandsRequest>;

export const ApplicationCommandResponse = ApplicationCommandSchema.extend({
	id: SnowflakeStringType.describe('The unique identifier of the command'),
	application_id: SnowflakeStringType.describe("The command's owning application"),
});

export type ApplicationCommandResponse = z.infer<typeof ApplicationCommandResponse>;

export const ApplicationCommandListResponse = z.array(ApplicationCommandResponse);

export type ApplicationCommandListResponse = z.infer<typeof ApplicationCommandListResponse>;
