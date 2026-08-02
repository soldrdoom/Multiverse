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
import {AppErrorHandler, AppNotFoundHandler} from '@fluxer/errors/src/domains/core/ErrorHandlers';
import type {ErrorHandler, Hono, NotFoundHandler} from 'hono';

/**
 * Attaches the real production error classification to a test-built Hono app, exactly as
 * `packages/api/src/App.tsx:58,67` and `fluxer_server/src/Routes.tsx:634` do.
 *
 * Any middleware test that asserts a *status code* must use this. A bare `new Hono()` falls back to
 * hono's built-in handler (`hono@4.0.0/dist/hono-base.js:35`), which classifies errors with its own
 * `instanceof HTTPException` against the copy of hono that `packages/api` resolves — a different copy
 * from the one `AppErrorHandler` in `packages/errors` uses. The two disagree for every error class, so
 * a bare app's status assertions are unrelated to what the assembled server returns. That is how a
 * 403 assertion passed for a guard that was returning 500 in production.
 *
 * The casts exist for the same reason and are the whole point of this helper: `Hono<HonoEnv>` here is
 * hono@4.0.0's class, `AppErrorHandler`'s `Context` is hono@4.11.9's, and TS correctly refuses to
 * reconcile them (`HonoRequest` gained `[GET_MATCH_RESULT]`). `App.tsx` takes this same mismatch as
 * two of the package's standing typecheck errors; confining it to one documented helper avoids
 * multiplying that count across every test that needs production wiring. Structurally the two handlers
 * only touch `ctx.get(...)` and `ctx.req.header(...)`, which are identical in both versions — deleting
 * this helper in favour of aligning `packages/api` to the catalog hono is the real fix.
 */
export function attachProductionErrorHandler(app: Hono<HonoEnv>): Hono<HonoEnv> {
	app.onError(AppErrorHandler as unknown as ErrorHandler<HonoEnv>);
	app.notFound(AppNotFoundHandler as unknown as NotFoundHandler<HonoEnv>);
	return app;
}
