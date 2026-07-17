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

import {DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {VaultRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/VaultRateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {createUserID} from '@fluxer/api/src/BrandedTypes';
import {VaultRepository} from '@fluxer/api/src/vault/VaultRepository';
import {
	VaultKeyResponse,
	VaultRegisterKeyRequest,
	VaultRegisterKeyResponse,
} from '@fluxer/schema/src/domains/vault/VaultSchemas';
import {z} from 'zod';

const vaultRepository = new VaultRepository();

export function VaultController(app: HonoApp): void {
	/**
	 * POST /vault/keys
	 * Upserts the authenticated user's X25519 public key.
	 * Called by VaultService.initializeVault() after key derivation.
	 */
	app.post(
		'/vault/keys',
		LoginRequired,
		DefaultUserOnly,
		RateLimitMiddleware(VaultRateLimitConfigs.VAULT_REGISTER_KEY),
		OpenAPI({
			operationId: 'vault_register_key',
			summary: "Register or update the caller's X25519 public key",
			requestSchema: VaultRegisterKeyRequest,
			responseSchema: VaultRegisterKeyResponse,
			statusCode: 200,
			tags: ['Vault'],
			description:
				"Upserts the Base64-encoded X25519 public key derived from the user's wallet signature. " +
				'Used by Phase 1 E2EE to allow peers to encrypt direct messages to this user.',
		}),
		Validator('json', VaultRegisterKeyRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {public_key, encrypted_data, nonce} = ctx.req.valid('json');
			const updatedAt = await vaultRepository.upsertPublicKey(userId, public_key, encrypted_data, nonce);
			return ctx.json<VaultRegisterKeyResponse>({ok: true, updated_at: updatedAt.toISOString()});
		},
	);

	/**
	 * GET /vault/keys/:userId
	 * Returns the X25519 public key for the given user.
	 * Called when composing an encrypted DM to look up the recipient's public key.
	 */
	app.get(
		'/vault/keys/:userId',
		LoginRequired,
		RateLimitMiddleware(VaultRateLimitConfigs.VAULT_GET_KEY),
		OpenAPI({
			operationId: 'vault_get_key',
			summary: "Fetch a user's X25519 public key",
			responseSchema: VaultKeyResponse,
			statusCode: 200,
			tags: ['Vault'],
			description: 'Returns the X25519 public key for the specified user, if one has been registered.',
		}),
		Validator('param', z.object({userId: z.string().regex(/^\d+(?::\d+)?$/, 'Invalid user ID format')})),
		async (ctx) => {
			const rawUserId = ctx.req.valid('param').userId;
			// Strip any session-version suffix (e.g. ":1") that clients may append.
			const stripped = rawUserId.includes(':') ? rawUserId.split(':')[0]! : rawUserId;
			const userId = createUserID(BigInt(stripped));
			const row = await vaultRepository.findByUserId(userId);
			if (!row) {
				return ctx.json({error: 'No public key registered for this user'}, 404);
			}
			return ctx.json<VaultKeyResponse>({
				user_id: String(row.user_id),
				public_key: row.public_key,
				updated_at: row.updated_at.toISOString(),
			});
		},
	);
}
