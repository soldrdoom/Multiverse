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

import type {BotCommand} from '@app/hooks/useCommands';
import {matchBotCommand} from '@app/utils/BotCommandUtils';
import {describe, expect, test} from 'vitest';

describe('BotCommandUtils', () => {
	describe('matchBotCommand', () => {
		const solCommand: BotCommand = {
			type: 'bot',
			name: '/sol',
			description: 'Get the current SOL price.',
			botUserId: '111',
			options: [],
		};

		const massCommand: BotCommand = {
			type: 'bot',
			name: '/mass',
			description: 'Mass-delete messages.',
			botUserId: '111',
			options: [
				{
					name: 'count',
					description: 'Number of messages to delete',
					type: 'INTEGER',
					required: false,
				},
			],
		};

		const requiredStringCommand: BotCommand = {
			type: 'bot',
			name: '/echo',
			description: 'Echo back the given text.',
			botUserId: '222',
			options: [
				{
					name: 'text',
					description: 'Text to echo',
					type: 'STRING',
					required: true,
				},
			],
		};

		const boolCommand: BotCommand = {
			type: 'bot',
			name: '/toggle',
			description: 'Toggle something.',
			botUserId: '333',
			options: [
				{
					name: 'enabled',
					description: 'Whether to enable',
					type: 'BOOLEAN',
					required: true,
				},
			],
		};

		const botCommands = [solCommand, massCommand, requiredStringCommand, boolCommand];

		test('returns null for content that does not start with a bot command', () => {
			expect(matchBotCommand('hello world', botCommands)).toBeNull();
			expect(matchBotCommand('/unknown', botCommands)).toBeNull();
		});

		test('matches a zero-option command with an exact name', () => {
			expect(matchBotCommand('/sol', botCommands)).toEqual({botCommand: solCommand, options: {}});
		});

		test('ignores trailing text for a zero-option command', () => {
			expect(matchBotCommand('/sol anything here', botCommands)).toEqual({botCommand: solCommand, options: {}});
		});

		test('matches an optional INTEGER option with no trailing text', () => {
			expect(matchBotCommand('/mass', botCommands)).toEqual({botCommand: massCommand, options: {}});
			expect(matchBotCommand('/mass ', botCommands)).toEqual({botCommand: massCommand, options: {}});
		});

		test('coerces a valid INTEGER trailing argument', () => {
			expect(matchBotCommand('/mass 10', botCommands)).toEqual({
				botCommand: massCommand,
				options: {count: 10},
			});
		});

		test('returns null for a non-integer trailing argument to an INTEGER option', () => {
			expect(matchBotCommand('/mass abc', botCommands)).toBeNull();
		});

		test('returns null for a non-integer (float) trailing argument to an INTEGER option', () => {
			expect(matchBotCommand('/mass 1.5', botCommands)).toBeNull();
		});

		test('passes through a STRING option value as-is', () => {
			expect(matchBotCommand('/echo hello there', botCommands)).toEqual({
				botCommand: requiredStringCommand,
				options: {text: 'hello there'},
			});
		});

		test('returns null when a required option is missing', () => {
			expect(matchBotCommand('/echo', botCommands)).toBeNull();
			expect(matchBotCommand('/echo ', botCommands)).toBeNull();
		});

		test('accepts true/yes/1 as BOOLEAN true tokens, case-insensitively', () => {
			expect(matchBotCommand('/toggle true', botCommands)).toEqual({botCommand: boolCommand, options: {enabled: true}});
			expect(matchBotCommand('/toggle YES', botCommands)).toEqual({botCommand: boolCommand, options: {enabled: true}});
			expect(matchBotCommand('/toggle 1', botCommands)).toEqual({botCommand: boolCommand, options: {enabled: true}});
		});

		test('accepts false/no/0 as BOOLEAN false tokens, case-insensitively', () => {
			expect(matchBotCommand('/toggle false', botCommands)).toEqual({
				botCommand: boolCommand,
				options: {enabled: false},
			});
			expect(matchBotCommand('/toggle NO', botCommands)).toEqual({botCommand: boolCommand, options: {enabled: false}});
			expect(matchBotCommand('/toggle 0', botCommands)).toEqual({botCommand: boolCommand, options: {enabled: false}});
		});

		test('returns null for an unrecognized BOOLEAN token', () => {
			expect(matchBotCommand('/toggle maybe', botCommands)).toBeNull();
		});

		test('does not match a command with more than one option', () => {
			const multiOptionCommand: BotCommand = {
				type: 'bot',
				name: '/multi',
				description: 'Has two options.',
				botUserId: '444',
				options: [
					{name: 'a', description: 'a', type: 'STRING', required: false},
					{name: 'b', description: 'b', type: 'STRING', required: false},
				],
			};

			expect(matchBotCommand('/multi foo', [multiOptionCommand])).toBeNull();
		});

		test('does not match a command name that is only a prefix of another word', () => {
			expect(matchBotCommand('/solar', botCommands)).toBeNull();
		});

		test('passes USER/CHANNEL option values through as raw text (known limitation)', () => {
			const userCommand: BotCommand = {
				type: 'bot',
				name: '/whois',
				description: 'Look up a user.',
				botUserId: '555',
				options: [{name: 'target', description: 'target', type: 'USER', required: true}],
			};

			expect(matchBotCommand('/whois <@123>', [userCommand])).toEqual({
				botCommand: userCommand,
				options: {target: '<@123>'},
			});
		});
	});
});
