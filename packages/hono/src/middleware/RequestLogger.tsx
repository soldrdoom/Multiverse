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

import {matchesAnyPathPattern} from '@fluxer/hono/src/middleware/utils/PathMatchers';
import type {MiddlewareHandler} from 'hono';

export type LogFunction = (data: {method: string; path: string; status: number; durationMs: number}) => void;
export interface RequestLoggerOptions {
	log: LogFunction;
	skip?: Array<string>;
}

export function requestLogger(options: RequestLoggerOptions): MiddlewareHandler {
	const {log, skip = []} = options;

	return async (c, next) => {
		const path = c.req.path;

		if (matchesAnyPathPattern(path, skip)) {
			return next();
		}

		const startTime = Date.now();
		const method = c.req.method;

		await next();

		const durationMs = Date.now() - startTime;
		const status = c.res.status;

		log({method, path, status, durationMs});
	};
}
