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

import {Config} from '@fluxer/api/src/Config';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {extractClientIp} from '@fluxer/ip_utils/src/ClientIp';
import {createMiddleware} from 'hono/factory';

export interface SentryUserAttributes {
	id?: string;
	username?: string;
	email?: string;
	ip_address?: string;
}

export interface SentryUserMiddlewareOptions {
	trustCfConnectingIp?: () => boolean;
}

/**
 * Attaches the current actor to Sentry events.
 *
 * `ip_address` MUST come from the shared extractor rather than from the leftmost `X-Forwarded-For`
 * entry. `X-Forwarded-For` is append-only, so its leftmost entry is caller-chosen: reading it here
 * meant enforcement (rate limits, IP bans, session rows) keyed off the real peer while Sentry logged
 * whatever the caller asked for. An investigator correlating "which IP got rate-limited" against
 * "which IP is on the Sentry event" then gets two different answers with no signal that either is
 * wrong.
 */
export function SentryUserMiddleware(
	setSentryUser: (user: SentryUserAttributes) => void,
	{trustCfConnectingIp = () => Config.proxy.trust_cf_connecting_ip}: SentryUserMiddlewareOptions = {},
) {
	return createMiddleware<HonoEnv>(async (ctx, next) => {
		const user = ctx.get('user');
		const clientIp = extractClientIp(ctx.req.raw, {trustCfConnectingIp: trustCfConnectingIp()});

		setSentryUser({
			id: user?.id.toString(),
			username: user?.username,
			email: user?.email ?? undefined,
			ip_address: clientIp ?? undefined,
		});

		return next();
	});
}
