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

import type {SentryUserAttributes} from '@fluxer/api/src/middleware/SentryUserMiddleware';
import {SentryUserMiddleware} from '@fluxer/api/src/middleware/SentryUserMiddleware';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {Hono} from 'hono';
import {describe, expect, it} from 'vitest';

async function captureSentryUser(
	headers: Record<string, string>,
	options: Parameters<typeof SentryUserMiddleware>[1] = {},
): Promise<SentryUserAttributes | null> {
	let captured: SentryUserAttributes | null = null;
	const app = new Hono<HonoEnv>();
	app.use(
		'*',
		SentryUserMiddleware((user) => {
			captured = user;
		}, options),
	);
	app.get('/users/@me', async (ctx) => ctx.text('ok'));

	await app.fetch(new Request('https://api.fluxer.app/users/@me', {headers}));
	return captured;
}

describe('SentryUserMiddleware', () => {
	// The regression this exists for: the previous inline implementation read
	// `X-Forwarded-For.split(',')[0]`, so a caller could put any address on its own Sentry events
	// while enforcement keyed off the real peer appended by nginx on the right.
	it('records the rightmost X-Forwarded-For entry, not the caller-chosen leftmost one', async () => {
		const captured = await captureSentryUser({'x-forwarded-for': '1.2.3.4, 203.0.113.7'});
		expect(captured?.ip_address).toBe('203.0.113.7');
	});

	it('prefers X-Real-IP over anything the caller put in X-Forwarded-For', async () => {
		const captured = await captureSentryUser({
			'x-forwarded-for': '1.2.3.4, 203.0.113.7',
			'x-real-ip': '198.51.100.20',
		});
		expect(captured?.ip_address).toBe('198.51.100.20');
	});

	it('ignores CF-Connecting-IP unless Cloudflare is trusted', async () => {
		const untrusted = await captureSentryUser(
			{'cf-connecting-ip': '203.0.113.50', 'x-real-ip': '198.51.100.20'},
			{trustCfConnectingIp: () => false},
		);
		expect(untrusted?.ip_address).toBe('198.51.100.20');

		const trusted = await captureSentryUser(
			{'cf-connecting-ip': '203.0.113.50', 'x-real-ip': '198.51.100.20'},
			{trustCfConnectingIp: () => true},
		);
		expect(trusted?.ip_address).toBe('203.0.113.50');
	});

	it('leaves ip_address undefined when no client IP can be determined', async () => {
		const captured = await captureSentryUser({});
		expect(captured).not.toBeNull();
		expect(captured?.ip_address).toBeUndefined();
	});

	it('reports an anonymous actor when no user is attached to the context', async () => {
		const captured = await captureSentryUser({'x-real-ip': '198.51.100.20'});
		expect(captured?.id).toBeUndefined();
		expect(captured?.username).toBeUndefined();
		expect(captured?.email).toBeUndefined();
	});
});
