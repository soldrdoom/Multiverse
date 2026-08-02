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

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

/**
 * Thrown by `RequireXForwardedForMiddleware` when `proxy.require_forwarded_for` is enabled and the
 * request carried no proxy-set client IP header, i.e. it did not arrive through the reverse proxy.
 *
 * Deliberately reuses the generic `FORBIDDEN` code rather than introducing a bespoke one: the caller
 * is by definition unproxied and untrusted, and there is nothing to gain from telling it which header
 * the edge was supposed to have set. `FORBIDDEN` is also exactly what the handler would have produced
 * for the `HTTPException(403)` this class replaces (`HTTP_STATUS_TO_ERROR_CODE[403]` in
 * `ErrorHandlers.tsx`), so the wire format is unchanged from the intended behaviour.
 *
 * Must NOT be a `hono/http-exception` `HTTPException`: `packages/api` resolves `hono@4.0.0` while
 * `packages/errors` (which owns `AppErrorHandler`) resolves `hono@4.11.9`, so an `HTTPException`
 * constructed in `packages/api` fails the `instanceof HTTPException` check in `AppErrorHandler` and
 * degrades to a generic 500. `MultiverseError` — the base of `ForbiddenError` — lives in
 * `packages/errors` and is therefore a single class across the whole server, so it classifies
 * correctly regardless of which package threw it.
 */
export class ProxyHeadersRequiredError extends ForbiddenError {
	constructor() {
		super({code: APIErrorCodes.FORBIDDEN});
	}
}
