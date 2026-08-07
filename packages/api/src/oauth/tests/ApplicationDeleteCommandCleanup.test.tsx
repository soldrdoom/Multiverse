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
import {
	createOAuth2Application,
	createUniqueApplicationName,
	deleteOAuth2Application,
} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import type {ApplicationCommandListResponse} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';
import {beforeEach, describe, expect, test} from 'vitest';

describe('Deleting an application cleans up its commands', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('deleting an application with a bot deletes its application_commands rows too', async () => {
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

		const beforeDelete = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(beforeDelete.length).toBe(2);

		await deleteOAuth2Application(harness, account.token, app.application.id, account.password);

		// application_commands is keyed on bot_user_id, not application_id, and
		// so does not cascade automatically on its own — this is exercising the
		// explicit deleteAllForBotUser cleanup call in ApplicationService.deleteApplication.
		const afterDelete = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(afterDelete).toEqual([]);
	});

	test('deleting an application without any registered commands is unaffected', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});

		await deleteOAuth2Application(harness, account.token, app.application.id, account.password);

		const afterDelete = await createBuilder<ApplicationCommandListResponse>(harness, account.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(afterDelete).toEqual([]);
	});
});
