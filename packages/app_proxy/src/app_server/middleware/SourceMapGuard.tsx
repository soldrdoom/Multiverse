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

import {isSourceMapPath} from '@fluxer/app_proxy/src/app_server/utils/Mime';
import type {Env, Hono, MiddlewareHandler} from 'hono';

/**
 * Refuses every request for a source map.
 *
 * Source maps carry full `sourcesContent`, so serving them publishes unminified
 * frontend source. Blocking at the serving layer holds even if a build config
 * regresses and starts emitting maps into the deployed bundle again.
 *
 * The response is the same `notFound()` a missing file produces, so the guard
 * does not tell a caller whether the map exists.
 */
export function sourceMapGuard(): MiddlewareHandler {
	return async (c, next) => {
		if (isSourceMapPath(c.req.path)) {
			return c.notFound();
		}
		return next();
	};
}

/**
 * Registers the guard ahead of every static-serving route. Must be called before
 * any route registration so the SPA catch-all cannot answer with index.html.
 */
export function applySourceMapGuard<E extends Env>(app: Hono<E>): void {
	app.use('*', sourceMapGuard());
}
