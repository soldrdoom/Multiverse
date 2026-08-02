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

import type {UserID} from '@fluxer/api/src/BrandedTypes';
import {BatchBuilder, Db, deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {AuthSessionRow} from '@fluxer/api/src/database/types/AuthTypes';
import {Logger} from '@fluxer/api/src/Logger';
import {AuthSession} from '@fluxer/api/src/models/AuthSession';
import {AuthSessions, AuthSessionsByUserId} from '@fluxer/api/src/Tables';
import {recordCounter} from '@fluxer/telemetry/src/Metrics';

const FETCH_AUTH_SESSIONS_CQL = AuthSessions.selectCql({
	where: AuthSessions.where.in('session_id_hash', 'session_id_hashes'),
});

const FETCH_AUTH_SESSION_BY_TOKEN_CQL = AuthSessions.selectCql({
	where: AuthSessions.where.eq('session_id_hash'),
	limit: 1,
});

const FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL = AuthSessionsByUserId.selectCql({
	columns: ['session_id_hash'],
	where: AuthSessionsByUserId.where.eq('user_id'),
});

const FETCH_AUTH_SESSION_INDEX_ENTRY_CQL = AuthSessionsByUserId.selectCql({
	columns: ['session_id_hash'],
	where: [AuthSessionsByUserId.where.eq('user_id'), AuthSessionsByUserId.where.eq('session_id_hash')],
	limit: 1,
});

const DELETE_INDEX_ENTRIES_BY_USER_ID_CQL = AuthSessionsByUserId.deleteCql({
	where: AuthSessionsByUserId.where.eq('user_id'),
});

/**
 * A session is stored as two rows: the credential itself in `auth_sessions`
 * (keyed by the token hash, so authentication can look it up) and an entry in
 * `auth_sessions_by_user_id` (so a user's sessions can be enumerated and
 * revoked). Revocation can only ever see what the index knows about, so an
 * `auth_sessions` row without its index entry would be an unrevokable
 * credential: invisible to "log out all devices" and to account deletion, and
 * with no expiry to eventually retire it.
 *
 * The invariant that removes that whole class of bug is therefore:
 *
 *     a session authenticates only while BOTH rows exist.
 *
 * Every method below is written to preserve it, and authentication enforces it
 * (see getAuthSessionByToken) rather than assuming it.
 */
export class AuthSessionRepository {
	async createAuthSession(sessionData: AuthSessionRow): Promise<AuthSession> {
		const batch = new BatchBuilder();
		// Index entry first: batches are not atomic on every backend, and a
		// half-applied create must fail closed (an index entry pointing at no
		// credential is inert; a credential with no index entry is unrevokable).
		batch.addPrepared(
			AuthSessionsByUserId.insert({
				user_id: sessionData.user_id,
				session_id_hash: sessionData.session_id_hash,
			}),
		);
		batch.addPrepared(AuthSessions.insert(sessionData));
		await batch.execute();

		return new AuthSession(sessionData);
	}

	async getAuthSessionByToken(sessionIdHash: Buffer): Promise<AuthSession | null> {
		const session = await fetchOne<AuthSessionRow>(FETCH_AUTH_SESSION_BY_TOKEN_CQL, {session_id_hash: sessionIdHash});
		if (!session) return null;

		if (session.user_id == null) {
			// A row with no owner cannot be indexed, listed or revoked; it is residue
			// from a partial write rather than a session.
			await this.deleteOrphanedAuthSession(sessionIdHash, session.user_id);
			return null;
		}

		const indexEntry = await fetchOne<{session_id_hash: Buffer}>(FETCH_AUTH_SESSION_INDEX_ENTRY_CQL, {
			user_id: session.user_id,
			session_id_hash: sessionIdHash,
		});

		if (!indexEntry) {
			// The credential is not reachable from the user's session index, so no
			// revocation path can ever remove it. Treat it as already revoked and
			// clean it up instead of honouring it.
			await this.deleteOrphanedAuthSession(sessionIdHash, session.user_id);
			return null;
		}

		return new AuthSession(session);
	}

	private async deleteOrphanedAuthSession(sessionIdHash: Buffer, userId: UserID): Promise<void> {
		Logger.warn({userId}, 'Rejecting auth session with no auth_sessions_by_user_id entry');
		recordCounter({name: 'auth.session.orphaned_rejected', dimensions: {}});
		await deleteOneOrMany(AuthSessions.deleteByPk({session_id_hash: sessionIdHash}));
	}

	async listAuthSessions(userId: UserID): Promise<Array<AuthSession>> {
		const sessionHashes = await fetchMany<{session_id_hash: Buffer}>(FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL, {
			user_id: userId,
		});
		if (sessionHashes.length === 0) return [];
		const sessions = await fetchMany<AuthSessionRow>(FETCH_AUTH_SESSIONS_CQL, {
			session_id_hashes: sessionHashes.map((s) => s.session_id_hash),
		});
		return sessions.map((session) => new AuthSession(session));
	}

	async updateAuthSessionLastUsed(sessionIdHash: Buffer): Promise<void> {
		// Must not resurrect: this runs unawaited on every authenticated request,
		// so a plain upsert racing a concurrent revocation would recreate the
		// credential row after it was deleted — and, because the index entry stays
		// deleted, recreate it as an unrevokable orphan.
		await upsertOne(
			AuthSessions.patchByPkIfExists(
				{session_id_hash: sessionIdHash},
				{
					approx_last_used_at: Db.set(new Date()),
				},
			),
		);
	}

	async deleteAuthSessions(userId: UserID, sessionIdHashes: Array<Buffer>): Promise<void> {
		const batch = new BatchBuilder();
		for (const sessionIdHash of sessionIdHashes) {
			batch.addPrepared(AuthSessions.deleteByPk({session_id_hash: sessionIdHash}));
			batch.addPrepared(AuthSessionsByUserId.deleteByPk({user_id: userId, session_id_hash: sessionIdHash}));
		}
		await batch.execute();
	}

	async deleteAllAuthSessions(userId: UserID): Promise<void> {
		const sessions = await fetchMany<{session_id_hash: Buffer}>(FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL, {
			user_id: userId,
		});

		if (sessions.length > 0) {
			const batch = new BatchBuilder();
			for (const session of sessions) {
				batch.addPrepared(
					AuthSessions.deleteByPk({
						session_id_hash: session.session_id_hash,
					}),
				);
				batch.addPrepared(
					AuthSessionsByUserId.deleteByPk({
						user_id: userId,
						session_id_hash: session.session_id_hash,
					}),
				);
			}
			await batch.execute();
		}

		// The enumeration above is a paged read, so it is not by itself a guarantee
		// that every index entry was seen. Sweeping the whole user_id partition is
		// a single statement and closes the revocation regardless: any session the
		// enumeration missed can no longer authenticate (see getAuthSessionByToken).
		await deleteOneOrMany(DELETE_INDEX_ENTRIES_BY_USER_ID_CQL, {user_id: userId});
	}
}
