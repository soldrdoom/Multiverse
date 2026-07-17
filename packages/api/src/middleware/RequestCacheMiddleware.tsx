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

import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import type {UserPartialResponse} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {createMiddleware} from 'hono/factory';

export interface RequestCache {
	userPartials: Map<bigint, UserPartialResponse>;
	clear(): void;
}

class RequestCacheImpl implements RequestCache {
	userPartials = new Map<bigint, UserPartialResponse>();

	clear(): void {
		this.userPartials.clear();
	}
}

export const RequestCacheMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	const requestCache: RequestCache = new RequestCacheImpl();
	ctx.set('requestCache', requestCache);
	try {
		await next();
	} finally {
		requestCache.clear();
	}
});

export function createRequestCache(): RequestCache {
	return new RequestCacheImpl();
}
