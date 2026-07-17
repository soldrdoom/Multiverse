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
import {fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {UserPublicKeyRow} from '@fluxer/api/src/database/types/VaultTypes';
import {UserPublicKeys} from '@fluxer/api/src/Tables';

const FETCH_KEY_CQL = UserPublicKeys.selectCql({
	where: UserPublicKeys.where.eq('user_id'),
	limit: 1,
});

export class VaultRepository {
	async findByUserId(userId: UserID): Promise<UserPublicKeyRow | null> {
		return fetchOne<UserPublicKeyRow>(FETCH_KEY_CQL, {user_id: userId});
	}

	async upsertPublicKey(
		userId: UserID,
		publicKey: string,
		encryptedData?: string | null,
		encryptionNonce?: string | null,
	): Promise<Date> {
		const now = new Date();
		const existing = await this.findByUserId(userId);
		const row: UserPublicKeyRow = {
			user_id: userId,
			public_key: publicKey,
			// Preserve existing encrypted blob if caller omits it (e.g. re-registering
			// the public key without re-wrapping the private key).
			encrypted_data: encryptedData !== undefined ? (encryptedData ?? null) : (existing?.encrypted_data ?? null),
			encryption_nonce:
				encryptionNonce !== undefined ? (encryptionNonce ?? null) : (existing?.encryption_nonce ?? null),
			created_at: existing?.created_at ?? now,
			updated_at: now,
		};
		await upsertOne(UserPublicKeys.upsertAll(row));
		return now;
	}
}
