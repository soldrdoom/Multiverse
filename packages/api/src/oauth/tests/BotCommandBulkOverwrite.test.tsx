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

import {createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createOAuth2Application, createUniqueApplicationName} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '@fluxer/api/src/test/TestRequestBuilder';
import type {ApplicationCommandListResponse} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';
import {beforeEach, describe, expect, test} from 'vitest';

async function bulkOverwrite(
	harness: ApiTestHarness,
	botToken: string,
	commands: Array<Record<string, unknown>>,
): Promise<ApplicationCommandListResponse> {
	return createBuilder<ApplicationCommandListResponse>(harness, `Bot ${botToken}`)
		.put('/applications/@me/commands')
		.body({commands})
		.expect(HTTP_STATUS.OK)
		.execute();
}

describe('Bot command bulk overwrite', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('registers commands and lists them back', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		const result = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
			{
				name: 'mass',
				description: 'Bulk delete messages',
				options: [{name: 'count', description: 'How many messages', type: 'INTEGER', required: false}],
			},
		]);

		expect(result.map((c) => c.name).sort()).toEqual(['mass', 'sol']);
		expect(result.every((c) => c.application_id === app.application.id)).toBe(true);
		expect(result.every((c) => c.id)).toBe(true);
	});

	test('replace semantics: a second overwrite with a subset removes the dropped command', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
			{name: 'mass', description: 'Bulk delete messages', options: []},
		]);

		const replaced = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
		]);

		expect(replaced.map((c) => c.name)).toEqual(['sol']);

		const listed = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(listed.map((c) => c.name)).toEqual(['sol']);
	});

	test('re-registering an unchanged payload is a no-op: ids and descriptions stay stable', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		const first = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
		]);

		const second = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
		]);

		expect(second[0]!.id).toBe(first[0]!.id);
		expect(second[0]!.description).toBe(first[0]!.description);
	});

	test('changing a description updates the row but keeps the id', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		const first = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price', options: []},
		]);

		const second = await bulkOverwrite(harness, app.botToken, [
			{name: 'sol', description: 'Get the current SOL price, in USD', options: []},
		]);

		expect(second[0]!.id).toBe(first[0]!.id);
		expect(second[0]!.description).toBe('Get the current SOL price, in USD');
	});

	test('BotOnly rejects a human-session caller', async () => {
		const account = await createTestAccount(harness);

		await createBuilder(harness, account.token)
			.put('/applications/@me/commands')
			.body({commands: []})
			.expect(HTTP_STATUS.FORBIDDEN, 'ACCESS_DENIED')
			.execute();
	});

	test('rejects an unauthenticated caller', async () => {
		await createBuilderWithoutAuth(harness)
			.put('/applications/@me/commands')
			.body({commands: []})
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});

	test('rejects a command name with invalid characters', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		await createBuilder(harness, `Bot ${app.botToken}`)
			.put('/applications/@me/commands')
			.body({commands: [{name: 'Not-Valid!', description: 'bad name', options: []}]})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});
});
