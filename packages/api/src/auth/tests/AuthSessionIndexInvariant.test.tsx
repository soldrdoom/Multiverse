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
import {AuthSessions, AuthSessionsByUserId, Users} from '@fluxer/api/src/Tables';
import type {ApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {UserDataRepository} from '@fluxer/api/src/user/repositories/account/crud/UserDataRepository';
import {AuthSessionRepository} from '@fluxer/api/src/user/repositories/auth/AuthSessionRepository';
import {UserRepository} from '@fluxer/api/src/user/repositories/UserRepository';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

const SELECT_SESSION_ROWS_CQL = AuthSessions.selectCql({columns: ['session_id_hash', 'user_id']});

const SELECT_SESSION_ROW_BY_HASH_CQL = AuthSessions.selectCql({
	columns: ['session_id_hash', 'user_id', 'approx_last_used_at'],
	where: AuthSessions.where.eq('session_id_hash'),
	limit: 1,
});

const SELECT_INDEX_ENTRIES_CQL = AuthSessionsByUserId.selectCql({
	columns: ['session_id_hash'],
	where: AuthSessionsByUserId.where.eq('user_id'),
});

const DELETE_INDEX_ENTRIES_CQL = AuthSessionsByUserId.deleteCql({
	where: AuthSessionsByUserId.where.eq('user_id'),
});

const SELECT_USER_ROW_CQL = Users.selectCql({
	columns: ['user_id', 'username', 'discriminator', 'last_active_at'],
	where: Users.where.eq('user_id'),
	limit: 1,
});

async function listSessionRowsForUser(userId: UserID): Promise<Array<{session_id_hash: Buffer; user_id: UserID}>> {
	const rows = await fetchMany<{session_id_hash: Buffer; user_id: UserID}>(SELECT_SESSION_ROWS_CQL, {});
	return rows.filter((row) => row.user_id === userId);
}

async function listIndexEntriesForUser(userId: UserID): Promise<Array<{session_id_hash: Buffer}>> {
	return fetchMany<{session_id_hash: Buffer}>(SELECT_INDEX_ENTRIES_CQL, {user_id: userId});
}

/**
 * Reproduces the production shape: an `auth_sessions` row whose
 * `auth_sessions_by_user_id` entry is gone, which is what makes a session
 * invisible to every revocation path.
 */
async function orphanAllSessionsOf(userId: UserID): Promise<void> {
	await deleteOneOrMany(DELETE_INDEX_ENTRIES_CQL, {user_id: userId});
}

describe('Auth session / user-index invariant', () => {
	let harness: ApiTestHarness;

	beforeAll(async () => {
		harness = await createAuthHarness();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('does not honour a session that is unreachable from the user session index', async () => {
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		await createBuilder(harness, account.token).get('/users/@me').expect(200).execute();
		expect(await listSessionRowsForUser(userId)).toHaveLength(1);

		await orphanAllSessionsOf(userId);

		await createBuilder(harness, account.token).get('/users/@me').expect(401).execute();
	});

	it('cleans up the orphaned credential row when it is rejected', async () => {
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		await orphanAllSessionsOf(userId);
		await createBuilder(harness, account.token).get('/users/@me').expect(401).execute();

		expect(await listSessionRowsForUser(userId)).toHaveLength(0);
	});

	it('revokes every session on deleteAllAuthSessions, including one missing from the index', async () => {
		const repository = new AuthSessionRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		// A second session that IS indexed, so the two halves of the invariant are
		// exercised together rather than the orphan being the only row.
		const secondSession = await createBuilder<{token: string}>(harness, '')
			.post('/auth/login')
			.body({email: account.email, password: account.password})
			.execute();

		expect(await listIndexEntriesForUser(userId)).toHaveLength(2);

		// Drop only the first session's index entry: it is now invisible to
		// deleteAllAuthSessions' enumeration, which is exactly the H1 condition.
		const indexEntries = await listIndexEntriesForUser(userId);
		const firstSessionRows = await listSessionRowsForUser(userId);
		expect(firstSessionRows).toHaveLength(2);
		const orphanHash = indexEntries[0].session_id_hash;
		await deleteOneOrMany(
			AuthSessionsByUserId.deleteByPk({
				user_id: userId,
				session_id_hash: orphanHash,
			}),
		);

		await repository.deleteAllAuthSessions(userId);

		expect(await listIndexEntriesForUser(userId)).toHaveLength(0);
		await createBuilder(harness, account.token).get('/users/@me').expect(401).execute();
		await createBuilder(harness, secondSession.token).get('/users/@me').expect(401).execute();
	});

	it('does not resurrect a revoked session when a last-used write lands after revocation', async () => {
		const repository = new AuthSessionRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		const [session] = await listSessionRowsForUser(userId);
		expect(session).toBeDefined();

		await repository.deleteAllAuthSessions(userId);

		// The unawaited write issued by UserMiddleware for an in-flight request.
		await repository.updateAuthSessionLastUsed(session.session_id_hash);

		// Asserted on the raw primary key, not on rows carrying this user_id: a
		// resurrected row is partial and would not carry user_id at all.
		const resurrected = await fetchMany<{session_id_hash: Buffer}>(SELECT_SESSION_ROW_BY_HASH_CQL, {
			session_id_hash: session.session_id_hash,
		});
		expect(resurrected).toHaveLength(0);
		await createBuilder(harness, account.token).get('/users/@me').expect(401).execute();
	});
});

describe('Deleted user activity writes', () => {
	let harness: ApiTestHarness;

	beforeAll(async () => {
		harness = await createAuthHarness();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('does not recreate a deleted users row from a background activity write', async () => {
		const userDataRepository = new UserDataRepository();
		const userRepository = new UserRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		await deleteOneOrMany(Users.deleteByPk({user_id: userId}));

		// Both background activity writes issued by UserMiddleware for an
		// authenticated request, run after the account row is gone.
		await userRepository.updateLastActiveAt({
			userId,
			lastActiveAt: new Date(),
			lastActiveIp: '203.0.113.7',
		});
		await userRepository.updateUserActivity(userId, '203.0.113.7');

		const rows = await fetchMany<Partial<UserRow>>(SELECT_USER_ROW_CQL, {user_id: userId});
		expect(rows).toHaveLength(0);
		expect(await userDataRepository.findUnique(userId)).toBeNull();
	});

	it('still records activity for a live account', async () => {
		const userDataRepository = new UserDataRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));
		const lastActiveAt = new Date('2026-01-02T03:04:05.000Z');

		await userDataRepository.updateLastActiveAt({userId, lastActiveAt, lastActiveIp: '203.0.113.9'});

		const user = await userDataRepository.findUnique(userId);
		expect(user?.lastActiveAt?.toISOString()).toBe(lastActiveAt.toISOString());
		expect(user?.lastActiveIp).toBe('203.0.113.9');
	});

	it('treats a partial users row as a non-existent account instead of a live principal', async () => {
		const userDataRepository = new UserDataRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		// The exact production stub: {user_id, last_active_at, last_active_ip} and
		// nothing else — no username, no discriminator, no flags.
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

		const rows = await fetchMany<Partial<UserRow>>(SELECT_USER_ROW_CQL, {user_id: userId});
		expect(rows).toHaveLength(1);
		expect(rows[0].username).toBeUndefined();

		expect(await userDataRepository.findUnique(userId)).toBeNull();
		expect(await userDataRepository.listUsers([userId])).toHaveLength(0);

		// Previously a 500: UserMappers read `discriminator` off the stub.
		await createBuilder(harness, account.token).get('/users/@me').expect(401).execute();
	});
});
