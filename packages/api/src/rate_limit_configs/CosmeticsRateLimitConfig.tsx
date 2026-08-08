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

export const CosmeticsRateLimitConfigs = {
	GET_COSMETICS: {
		bucket: 'cosmetics:get',
		config: {limit: 30, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	APPLY_COSMETIC: {
		bucket: 'cosmetics:apply',
		config: {limit: 20, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	GET_NFTS: {
		bucket: 'cosmetics:nfts',
		config: {limit: 10, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	GET_STORE: {
		bucket: 'cosmetics:store',
		config: {limit: 60, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	GET_USER_COSMETICS_PUBLIC: {
		bucket: 'cosmetics:user_public',
		config: {limit: 60, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	PURCHASE: {
		bucket: 'cosmetics:purchase',
		config: {limit: 5, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	INVOICE: {
		bucket: 'cosmetics:invoice',
		config: {limit: 10, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	CREATOR_APPLY: {
		bucket: 'creator:apply',
		config: {limit: 3, windowMs: ms('1 hour')},
	} as RouteRateLimitConfig,

	CREATOR_STATUS: {
		bucket: 'creator:status',
		config: {limit: 30, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	CREATOR_LISTING_WRITE: {
		bucket: 'creator:listing:write',
		config: {limit: 20, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,
};
