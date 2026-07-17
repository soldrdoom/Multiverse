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

import type {RouteRateLimitConfig} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {ms} from 'itty-time';

export const VaultRateLimitConfigs = {
	/** Register/upsert the caller's X25519 public key. Infrequent — wallet re-signs on first login. */
	VAULT_REGISTER_KEY: {
		bucket: 'vault:register_key',
		config: {limit: 10, windowMs: ms('10 minutes')},
	} as RouteRateLimitConfig,

	/** Fetch another user's public key for DM encryption. Per-minute to prevent enumeration. */
	VAULT_GET_KEY: {
		bucket: 'vault:get_key',
		config: {limit: 120, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,
};
