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

import {createAuthHarness, createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createUserID, type UserID} from '@fluxer/api/src/BrandedTypes';
import {Db, deleteOneOrMany, fetchMany, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {UserRow} from '@fluxer/api/src/database/types/UserTypes';
import {Users} from '@fluxer/api/src/Tables';
import type {ApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {UserDataRepository} from '@fluxer/api/src/user/repositories/account/crud/UserDataRepository';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

const SELECT_ALL_USER_ROWS_CQL = Users.selectCql({columns: ['user_id', 'username']});

/**
 * The exact production stub: a `users` row carrying only the columns a
 * fire-and-forget activity write touches — no username, no discriminator, no
 * flags. `isUsableUserRow` rejects it, so it is dropped on the way out of the
 * repository, and the drop is what this file guards.
 */
async function replaceWithPartialRow(userId: UserID): Promise<void> {
	await deleteOneOrMany(Users.deleteByPk({user_id: userId}));
	await upsertOne(
		Users.patchByPk(
			{user_id: userId},
			{
				last_active_at: Db.set(new Date()),
				last_active_ip: Db.set('203.0.113.7'),
			},
		),
	);
}

async function countRawUserRows(): Promise<number> {
	const rows = await fetchMany<Partial<UserRow>>(SELECT_ALL_USER_ROWS_CQL, {});
	return rows.length;
}

async function createAccountIds(harness: ApiTestHarness, count: number): Promise<Array<UserID>> {
	const ids: Array<UserID> = [];
	for (let index = 0; index < count; index++) {
		const account = await createTestAccount(harness);
		ids.push(createUserID(BigInt(account.userId)));
	}
	// Snowflakes are monotonic, and both the paginated CQL's cursor predicate and
	// the local backend's scan order key off user_id, so creation order is page
	// order. The assertions below depend on that.
	return ids;
}

/**
 * The pagination loop every consumer of `listAllUsersPaginated` writes:
 * `RefreshSearchIndex.tsx:126` and `SearchWarmup.tsx:136` use
 * `hasMore = items.length === BATCH_SIZE`, while
 * `KVAccountDeletionQueueService.tsx:95`, `ProcessInactivityDeletions.tsx:181`
 * and `KVActivityTracker.tsx:102` use `length === 0 -> break`. Both forms are
 * "a short page means the table is exhausted", and both take the next cursor
 * from the last returned user.
 */
async function drainLikeAConsumer(
	repository: UserDataRepository,
	batchSize: number,
): Promise<{visited: Array<UserID>; iterations: number}> {
	const visited: Array<UserID> = [];
	let cursor: UserID | undefined;
	let hasMore = true;
	let iterations = 0;

	while (hasMore) {
		iterations++;
		// Guards the other half of the invariant: a non-advancing cursor would spin
		// here rather than terminating early.
		expect(iterations).toBeLessThan(50);

		const page = await repository.listAllUsersPaginated(batchSize, cursor);
		if (page.length > 0) {
			for (const user of page) {
				visited.push(user.id);
			}
			cursor = page[page.length - 1]!.id;
		}

		hasMore = page.length === batchSize;
	}

	return {visited, iterations};
}

describe('listAllUsersPaginated with partial user rows', () => {
	let harness: ApiTestHarness;
	let repository: UserDataRepository;

	beforeAll(async () => {
		harness = await createAuthHarness();
	});

	beforeEach(async () => {
		await harness.reset();
		repository = new UserDataRepository();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('returns a full page even when the page contains a stub row', async () => {
		const [first, stub, third] = await createAccountIds(harness, 3);
		await replaceWithPartialRow(stub);
		expect(await countRawUserRows()).toBe(3);

		const page = await repository.listAllUsersPaginated(2);

		// Before the fix: the stub was dropped and the page came back at length 1,
		// which every consumer reads as "last page" — `third` was never seen.
		expect(page.map((user) => user.id)).toEqual([first, third]);
		expect(page).toHaveLength(2);
	});

	it('does not stall or terminate when an entire page is stub rows', async () => {
		const [stubOne, stubTwo, third, fourth] = await createAccountIds(harness, 4);
		await replaceWithPartialRow(stubOne);
		await replaceWithPartialRow(stubTwo);

		const page = await repository.listAllUsersPaginated(2);

		// Before the fix: an all-stub page returned [], and `length === 0 -> break`
		// aborted the whole sweep — including the account-deletion queue rebuild.
		expect(page.map((user) => user.id)).toEqual([third, fourth]);
	});

	it('lets a consumer-shaped loop reach every live account past the stubs', async () => {
		const ids = await createAccountIds(harness, 5);
		await replaceWithPartialRow(ids[1]);
		await replaceWithPartialRow(ids[3]);
		expect(await countRawUserRows()).toBe(5);

		const {visited} = await drainLikeAConsumer(repository, 2);

		expect(visited).toEqual([ids[0], ids[2], ids[4]]);
	});

	it('still reports exhaustion with a short page once the stubs are behind it', async () => {
		const ids = await createAccountIds(harness, 3);
		await replaceWithPartialRow(ids[2]);

		const page = await repository.listAllUsersPaginated(10);

		expect(page.map((user) => user.id)).toEqual([ids[0], ids[1]]);
		expect(page.length).toBeLessThan(10);
		expect(await repository.listAllUsersPaginated(10, page[page.length - 1]!.id)).toHaveLength(0);
	});
});
