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

describe('Bot command visibility', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('returns [] for a non-bot user, never a 404', async () => {
		const account = await createTestAccount(harness);

		const response = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${account.userId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response).toEqual([]);
	});

	test('returns [] for a bot with nothing registered', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		const response = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response).toEqual([]);
	});

	test('returns [] for a wholly unknown user id, never a 404', async () => {
		const account = await createTestAccount(harness);

		const response = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get('/users/999999999999999999/application-commands')
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response).toEqual([]);
	});

	test('returns the registered set for a bot with commands', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		await createBuilder(harness, `Bot ${app.botToken}`)
			.put('/applications/@me/commands')
			.body({
				commands: [
					{name: 'sol', description: 'Get the current SOL price', options: []},
					{name: 'mass', description: 'Bulk delete messages', options: []},
				],
			})
			.expect(HTTP_STATUS.OK)
			.execute();

		const response = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response.map((c) => c.name).sort()).toEqual(['mass', 'sol']);
	});

	test('requires authentication', async () => {
		await createBuilderWithoutAuth(harness)
			.get('/users/123/application-commands')
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});
});
