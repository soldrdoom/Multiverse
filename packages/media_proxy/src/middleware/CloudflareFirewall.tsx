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

import {extractClientIp} from '@fluxer/ip_utils/src/ClientIp';
import type {LoggerInterface} from '@fluxer/logger/src/LoggerInterface';
import type {CloudflareEdgeIPService} from '@fluxer/media_proxy/src/lib/CloudflareEdgeIPService';
import type {HonoEnv} from '@fluxer/media_proxy/src/types/HonoEnv';
import {createMiddleware} from 'hono/factory';
import {HTTPException} from 'hono/http-exception';

interface CloudflareFirewallOptions {
	enabled: boolean;
	exemptPaths?: Array<string>;
}

export function createCloudflareFirewall(
	ipService: CloudflareEdgeIPService,
	logger: LoggerInterface,
	{enabled, exemptPaths = ['/_health', '/_metadata']}: CloudflareFirewallOptions,
) {
	return createMiddleware<HonoEnv>(async (ctx, next) => {
		if (!enabled) {
			await next();
			return;
		}

		const path = ctx.req.path;
		if (exemptPaths.some((prefix) => path === prefix || path.startsWith(prefix))) {
			await next();
			return;
		}

		// This check needs the address of the peer that connected to us, so that it can be compared
		// against Cloudflare's published edge ranges. That is NOT the leftmost X-Forwarded-For entry:
		// XFF is append-only, so its leftmost entry is whatever the caller chose to send, and keying a
		// firewall decision off it let anyone through by prefixing a Cloudflare edge address.
		//
		// `extractClientIp` prefers X-Real-IP (which a reverse proxy REPLACES rather than
		// appends, so the caller cannot influence it) and otherwise walks X-Forwarded-For from the
		// right, which is the entry our own proxy appended. CF-Connecting-IP is deliberately not
		// trusted here even when it is present: it carries the end user's address, which is precisely
		// the value that must not be matched against edge ranges.
		const connectingIP = extractClientIp(ctx.req.raw);
		if (!connectingIP) {
			logger.warn({path}, 'Rejected request without a proxy-set client IP header');
			throw new HTTPException(403, {message: 'Forbidden'});
		}
		if (!ipService.isFromCloudflareEdge(connectingIP)) {
			logger.warn({connectingIP, path}, 'Rejected request from non-Cloudflare edge IP');
			throw new HTTPException(403, {message: 'Forbidden'});
		}

		await next();
	});
}
