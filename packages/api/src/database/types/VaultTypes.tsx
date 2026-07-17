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

export interface UserPublicKeyRow {
	user_id: UserID;
	/** Base64-encoded 32-byte X25519 public key. Stored in plaintext — it is public. */
	public_key: string;
	/**
	 * Optional: Base64-encoded AES-256-GCM ciphertext of the user's X25519 private key.
	 * Wrapped by the client with a key derived from the session token (HKDF-SHA-256).
	 * The server stores this opaque blob and never has access to the plaintext private key.
	 */
	encrypted_data: string | null;
	/**
	 * Base64-encoded 12-byte AES-GCM IV for encrypted_data.
	 * Null when encrypted_data is null.
	 */
	encryption_nonce: string | null;
	created_at: Date;
	updated_at: Date;
}

export const USER_PUBLIC_KEY_COLUMNS = [
	'user_id',
	'public_key',
	'encrypted_data',
	'encryption_nonce',
	'created_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof UserPublicKeyRow>;
