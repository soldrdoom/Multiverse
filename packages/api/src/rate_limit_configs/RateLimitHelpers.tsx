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

export type RateLimitSection = {readonly [key: string]: RouteRateLimitConfig};

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export function mergeRateLimitSections<T extends ReadonlyArray<RateLimitSection>>(
	...sections: T
): UnionToIntersection<T[number]> {
	return Object.assign({}, ...sections) as UnionToIntersection<T[number]>;
}
