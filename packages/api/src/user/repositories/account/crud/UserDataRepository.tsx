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

import {createUserID, type UserID} from '@fluxer/api/src/BrandedTypes';
import {
	buildPatchFromData,
	Db,
	type DbOp,
	executeVersionedUpdate,
	fetchMany,
	fetchOne,
	upsertOne,
} from '@fluxer/api/src/database/Cassandra';
import type {UserRow} from '@fluxer/api/src/database/types/UserTypes';
import {EMPTY_USER_ROW, isUsableUserRow, USER_COLUMNS} from '@fluxer/api/src/database/types/UserTypes';
import {Logger} from '@fluxer/api/src/Logger';
import {User} from '@fluxer/api/src/models/User';
import {Users} from '@fluxer/api/src/Tables';
import {recordCounter} from '@fluxer/telemetry/src/Metrics';

const FLUXER_BOT_USER_ID = 0n;
const DELETED_USER_ID = 1n;

const FETCH_USERS_BY_IDS_CQL = Users.selectCql({
	where: Users.where.in('user_id', 'user_ids'),
});

const FETCH_USER_BY_ID_CQL = Users.selectCql({
	where: Users.where.eq('user_id'),
	limit: 1,
});

const FETCH_ACTIVITY_TRACKING_CQL = Users.selectCql({
	columns: ['last_active_at', 'last_active_ip'],
	where: Users.where.eq('user_id'),
	limit: 1,
});

function createFetchAllUsersFirstPageCql(limit: number) {
	return Users.selectCql({limit});
}

const createFetchAllUsersPaginatedCql = (limit: number) =>
	Users.selectCql({
		where: Users.where.tokenGt('user_id', 'last_user_id'),
		limit,
	});

type UserPatch = Partial<{
	[K in Exclude<keyof UserRow, 'user_id'> & string]: DbOp<UserRow[K]>;
}>;

/**
 * A `users` row that is missing identity columns is not an account: it is the
 * residue of a write that landed against a deleted primary key. Surfacing it as
 * a `User` produces a principal whose `flags` read as zero — i.e. one that every
 * DELETED/DISABLED guard treats as a live, unflagged account — so it is dropped
 * here, at the only place rows become models.
 */
function reportUnusableUserRow(userId: UserID): void {
	Logger.warn({userId}, 'Ignoring partial users row with no identity columns');
	recordCounter({name: 'user.row.partial_ignored', dimensions: {}});
}

function toUsers(rows: Array<UserRow>): Array<User> {
	const users: Array<User> = [];
	for (const row of rows) {
		if (!isUsableUserRow(row)) {
			reportUnusableUserRow(row.user_id);
			continue;
		}
		users.push(new User(row));
	}
	return users;
}

export class UserDataRepository {
	async findUnique(userId: UserID): Promise<User | null> {
		if (userId === FLUXER_BOT_USER_ID) {
			return new User({
				...EMPTY_USER_ROW,
				user_id: createUserID(FLUXER_BOT_USER_ID),
				username: 'Multiverse',
				discriminator: 0,
				bot: true,
				system: true,
			});
		}

		if (userId === DELETED_USER_ID) {
			return new User({
				...EMPTY_USER_ROW,
				user_id: createUserID(DELETED_USER_ID),
				username: 'DeletedUser',
				discriminator: 0,
				bot: false,
				system: true,
			});
		}

		const userRow = await fetchOne<UserRow>(FETCH_USER_BY_ID_CQL, {user_id: userId});
		if (!userRow) {
			return null;
		}

		if (!isUsableUserRow(userRow)) {
			reportUnusableUserRow(userId);
			return null;
		}

		return new User(userRow);
	}

	async findUniqueAssert(userId: UserID): Promise<User> {
		return (await this.findUnique(userId))!;
	}

	private async fetchUserRowPage(limit: number, lastUserId?: UserID): Promise<Array<UserRow>> {
		if (lastUserId) {
			return fetchMany<UserRow>(createFetchAllUsersPaginatedCql(limit), {last_user_id: lastUserId});
		}
		return fetchMany<UserRow>(createFetchAllUsersFirstPageCql(limit), {});
	}

	/**
	 * Every caller of this method infers "last page" from the returned length
	 * (`length === batchSize` or `length === 0 -> break`) and takes its next
	 * cursor from the last returned user. Dropping unusable rows from a page
	 * therefore cannot be done naively: a short page would be read as the end of
	 * the table, and an all-stub page would both terminate the sweep and leave
	 * the cursor unmoved. That silently truncates the search-index rebuild, the
	 * activity-tracker rebuild, the inactivity sweep and the account-deletion
	 * queue rebuild.
	 *
	 * So the drop is compensated here rather than pushed onto callers: keep
	 * reading forward until `limit` usable accounts are assembled or the table is
	 * genuinely exhausted. The storage cursor advances by the last *raw* row of
	 * each fetch (stub rows included), while the value returned to the caller
	 * always ends on a real account, so neither cursor can stall. A returned page
	 * shorter than `limit` once again means, and only means, "no more rows".
	 */
	async listAllUsersPaginated(limit: number, lastUserId?: UserID): Promise<Array<User>> {
		if (limit <= 0) {
			return [];
		}

		const users: Array<User> = [];
		let cursor = lastUserId;

		while (users.length < limit) {
			const remaining = limit - users.length;
			const rows = await this.fetchUserRowPage(remaining, cursor);
			if (rows.length === 0) {
				break;
			}

			// Advanced past every row read, not just the usable ones: this is what
			// stops a page that is entirely stubs from re-reading the same offset.
			cursor = rows[rows.length - 1]!.user_id;
			users.push(...toUsers(rows));

			if (rows.length < remaining) {
				break;
			}
		}

		return users;
	}

	async listUsers(userIds: Array<UserID>): Promise<Array<User>> {
		if (userIds.length === 0) return [];
		const users = await fetchMany<UserRow>(FETCH_USERS_BY_IDS_CQL, {user_ids: userIds});
		return toUsers(users);
	}

	async upsertUserRow(data: UserRow, oldData?: UserRow | null): Promise<{finalVersion: number | null}> {
		const userId = data.user_id;

		const result = await executeVersionedUpdate<UserRow, 'user_id'>(
			async () => {
				const user = await this.findUnique(userId);
				return user?.toRow() ?? null;
			},
			(current) => ({
				pk: {user_id: userId},
				patch: buildPatchFromData(data, current, USER_COLUMNS, ['user_id']),
			}),
			Users,
			{initialData: oldData},
		);

		return {finalVersion: result.finalVersion};
	}

	async patchUser(userId: UserID, patch: UserPatch, oldData?: UserRow | null): Promise<{finalVersion: number | null}> {
		const result = await executeVersionedUpdate<UserRow, 'user_id'>(
			async () => {
				const user = await this.findUnique(userId);
				return user?.toRow() ?? null;
			},
			(_current) => ({
				pk: {user_id: userId},
				patch,
			}),
			Users,
			{initialData: oldData},
		);

		return {finalVersion: result.finalVersion};
	}

	async updateLastActiveAt(params: {userId: UserID; lastActiveAt: Date; lastActiveIp?: string}): Promise<void> {
		const {userId, lastActiveAt, lastActiveIp} = params;
		const patch: {last_active_at: DbOp<Date>; last_active_ip?: DbOp<string>} = {
			last_active_at: Db.set(lastActiveAt),
		};
		if (lastActiveIp !== undefined) {
			patch.last_active_ip = Db.set(lastActiveIp);
		}

		// Existence-checked: this is a fire-and-forget activity write issued from
		// request middleware, so it can land after the account has been deleted. A
		// plain upsert would recreate the primary `users` row with only the columns
		// written here — an unusable stub with no username, no discriminator and no
		// flags, which no secondary index knows about and which the DELETED-flag
		// guards therefore read as a live, unflagged account.
		await upsertOne(Users.patchByPkIfExists({user_id: userId}, patch));
	}

	async getActivityTracking(
		userId: UserID,
	): Promise<{last_active_at: Date | null; last_active_ip: string | null} | null> {
		const result = await fetchOne<{last_active_at: Date | null; last_active_ip: string | null}>(
			FETCH_ACTIVITY_TRACKING_CQL,
			{user_id: userId},
		);
		return result;
	}

	async updateSubscriptionStatus(
		userId: UserID,
		updates: {
			premiumWillCancel: boolean;
			computedPremiumUntil: Date | null;
		},
	): Promise<{finalVersion: number | null}> {
		const result = await executeVersionedUpdate<UserRow, 'user_id'>(
			async () => {
				const user = await this.findUnique(userId);
				return user?.toRow() ?? null;
			},
			(current) => {
				const currentPremiumUntil = current?.premium_until ?? null;
				const computedPremiumUntil = updates.computedPremiumUntil;

				let nextPremiumUntil: Date | null = currentPremiumUntil;

				if (computedPremiumUntil) {
					if (!nextPremiumUntil || computedPremiumUntil > nextPremiumUntil) {
						nextPremiumUntil = computedPremiumUntil;
					}
				}

				const patch: UserPatch = {
					premium_will_cancel: Db.set(updates.premiumWillCancel),
					premium_until: nextPremiumUntil ? Db.set(nextPremiumUntil) : Db.clear(),
				};

				return {
					pk: {user_id: userId},
					patch,
				};
			},
			Users,
		);

		return {finalVersion: result.finalVersion};
	}
}
