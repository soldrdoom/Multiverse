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

import {z} from 'zod';

/** POST /vault/keys — register or replace the caller's X25519 public key. */
export const VaultRegisterKeyRequest = z
	.object({
		/** Base64-encoded 32-byte Curve25519 (X25519) public key. */
		public_key: z
			.string()
			.min(40)
			.max(64)
			.regex(/^[A-Za-z0-9+/]+=*$/, 'public_key must be Base64-encoded')
			.describe('Base64-encoded X25519 public key derived from wallet signature'),
		/**
		 * Optional: AES-256-GCM ciphertext of the caller's X25519 *private* key,
		 * wrapped with a key derived from their session token via HKDF-SHA-256.
		 * The server stores this opaque blob — it never sees the plaintext private key.
		 */
		encrypted_data: z
			.string()
			.min(1)
			.max(256)
			.regex(/^[A-Za-z0-9+/]+=*$/, 'encrypted_data must be Base64-encoded')
			.optional()
			.describe('Base64-encoded AES-256-GCM ciphertext of the X25519 private key'),
		/** Base64-encoded 12-byte AES-GCM IV paired with encrypted_data. */
		nonce: z
			.string()
			.min(12)
			.max(32)
			.regex(/^[A-Za-z0-9+/]+=*$/, 'nonce must be Base64-encoded')
			.optional()
			.describe('Base64-encoded 12-byte AES-GCM IV for the encrypted private key'),
	})
	.refine(data => (data.encrypted_data == null) === (data.nonce == null), {
		message: 'encrypted_data and nonce must both be present or both be absent',
	});
export type VaultRegisterKeyRequest = z.infer<typeof VaultRegisterKeyRequest>;

/** GET /vault/keys/:userId — fetch the X25519 public key for a given user. */
export const VaultKeyResponse = z.object({
	user_id: z.string().describe('Snowflake user ID'),
	public_key: z.string().describe('Base64-encoded X25519 public key'),
	updated_at: z.string().datetime().describe('ISO-8601 timestamp of last update'),
});
export type VaultKeyResponse = z.infer<typeof VaultKeyResponse>;

/** Response from POST /vault/keys. */
export const VaultRegisterKeyResponse = z.object({
	ok: z.boolean(),
	updated_at: z.string().datetime().describe('ISO-8601 timestamp of the upsert'),
});
export type VaultRegisterKeyResponse = z.infer<typeof VaultRegisterKeyResponse>;
