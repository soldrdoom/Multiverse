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

import {createTestAccount, loginAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {deleteAccount, expectDataExists} from '@fluxer/api/src/user/tests/UserTestUtils';
import {beforeEach, describe, expect, test} from 'vitest';

describe('Account Delete Auto Cancel on Login', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('logging in after account deletion cancels the deletion', async () => {
		const account = await createTestAccount(harness);

		await deleteAccount(harness, account.token, account.password);

		const login = await loginAccount(harness, account);
		expect(login.token).not.toBe('');

		const data = await expectDataExists(harness, account.userId);
		expect(data.hasSelfDeletedFlag).toBe(false);
		expect(data.pendingDeletionAt).toBeNull();
	});
});
