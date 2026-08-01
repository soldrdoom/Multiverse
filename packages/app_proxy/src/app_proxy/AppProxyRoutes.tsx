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

import {resolve} from 'node:path';
import type {AppProxyHonoEnv} from '@fluxer/app_proxy/src/AppProxyTypes';
import {proxyAssets} from '@fluxer/app_proxy/src/app_proxy/proxy/AssetsProxy';
import {applySourceMapGuard} from '@fluxer/app_proxy/src/app_server/middleware/SourceMapGuard';
import {createSpaIndexRoute} from '@fluxer/app_proxy/src/app_server/routes/SpaIndexRoute';
import type {CSPOptions} from '@fluxer/app_proxy/src/app_server/utils/CSP';
import type {Logger} from '@fluxer/logger/src/Logger';
import type {Hono} from 'hono';

interface RegisterAppProxyRoutesOptions {
	app: Hono<AppProxyHonoEnv>;
	assetsPath: string;
	cspDirectives?: CSPOptions;
	logger: Logger;
	staticCDNEndpoint: string | undefined;
	staticDir?: string;
}

export function registerAppProxyRoutes(options: RegisterAppProxyRoutesOptions): void {
	const {app, assetsPath, cspDirectives, logger, staticCDNEndpoint, staticDir} = options;

	// Must stay first: both the CDN asset proxy and the SPA catch-all below can
	// otherwise hand back a source map.
	applySourceMapGuard(app);

	app.get('/_health', (c) => c.text('OK'));

	if (staticCDNEndpoint) {
		app.get(`${assetsPath}/*`, (c) =>
			proxyAssets(c, {
				logger,
				staticCDNEndpoint,
			}),
		);
	}

	if (staticDir) {
		const resolvedStaticDir = resolve(staticDir);
		createSpaIndexRoute(app, {staticDir: resolvedStaticDir, cspDirectives, logger});
	}
}
