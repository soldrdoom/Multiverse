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

import {timingSafeEqual} from 'node:crypto';
import type {HonoEnv} from '@fluxer/media_proxy/src/types/HonoEnv';
import {createMiddleware} from 'hono/factory';
import {HTTPException} from 'hono/http-exception';

export function createInternalNetworkRequired(secretKey: string) {
	return createMiddleware<HonoEnv>(async (ctx, next) => {
		const authHeader = ctx.req.header('Authorization');
		const expectedAuth = `Bearer ${secretKey}`;
		if (!authHeader) {
			throw new HTTPException(401, {message: 'Unauthorized'});
		}
		const authBuffer = Buffer.from(authHeader, 'utf8');
		const expectedBuffer = Buffer.from(expectedAuth, 'utf8');
		if (authBuffer.length !== expectedBuffer.length || !timingSafeEqual(authBuffer, expectedBuffer)) {
			throw new HTTPException(401, {message: 'Unauthorized'});
		}
		await next();
	});
}
