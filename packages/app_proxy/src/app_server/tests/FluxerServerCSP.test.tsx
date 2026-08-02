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

import {buildCSP, buildFluxerServerCSPOptions} from '@fluxer/app_proxy/src/app_server/utils/CSP';
import {describe, expect, test} from 'vitest';

const NONCE = 'deadbeefdeadbeefdeadbeefdeadbeef';
const PUBLIC_URL_HOST = 'https://multiverse.forum';
const MEDIA_URL_HOST = 'https://multiverse.forum';
const SENTRY_DSN = 'https://abc123def456@o4511839948570624.ingest.us.sentry.io/4511839974391808';
const SENTRY_ORIGIN = 'https://o4511839948570624.ingest.us.sentry.io';

/**
 * Byte-for-byte snapshot of the policy served by production as of 86abfb96, with the
 * nonce substituted. Any change to this string is a change to the live CSP.
 */
const BASELINE_CSP = [
	"default-src 'self' 'self'",
	`script-src 'self' 'nonce-${NONCE}' 'wasm-unsafe-eval' 'self' 'unsafe-inline'`,
	"style-src 'self' 'unsafe-inline' 'self' 'unsafe-inline'",
	"img-src 'self' blob: data: 'self' data: blob: https: https://multiverse.forum https://multiverse.forum",
	"media-src 'self' blob: 'self' blob: https://multiverse.forum",
	"font-src 'self' data: 'self'",
	"connect-src 'self' data: 'self' wss: ws: https://multiverse.forum https://ip.fluxer.workers.dev https://mainnet.helius-rpc.com https://api.mainnet-beta.solana.com https://devnet.helius-rpc.com https://api.devnet.solana.com https://rpc.ankr.com",
	"frame-src 'self'",
	"worker-src 'self' blob:",
	"manifest-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"frame-ancestors 'none'",
].join('; ');

const build = (sentryDsn?: string): string =>
	buildCSP(
		NONCE,
		buildFluxerServerCSPOptions({publicUrlHost: PUBLIC_URL_HOST, mediaUrlHost: MEDIA_URL_HOST, sentryDsn}),
	);

const connectSrcOf = (csp: string): string =>
	csp
		.split('; ')
		.find((directive) => directive.startsWith('connect-src '))!
		.slice('connect-src '.length);

describe('fluxer_server CSP', () => {
	test('includes the Sentry ingest origin in connect-src when a DSN is configured', () => {
		const connectSrc = connectSrcOf(build(SENTRY_DSN));
		expect(connectSrc.split(' ')).toContain(SENTRY_ORIGIN);
	});

	test('derives the ingest origin from the DSN rather than hardcoding it', () => {
		const connectSrc = connectSrcOf(build('https://key@o999.ingest.de.sentry.io/1234'));
		expect(connectSrc.split(' ')).toContain('https://o999.ingest.de.sentry.io');
		expect(connectSrc).not.toContain('o4511839948570624');
	});

	test('appends the Sentry origin to connect-src and changes nothing else', () => {
		const expected = BASELINE_CSP.replace('https://rpc.ankr.com;', `https://rpc.ankr.com ${SENTRY_ORIGIN};`);
		expect(expected).not.toBe(BASELINE_CSP);
		expect(build(SENTRY_DSN)).toBe(expected);
	});

	test('is byte-identical to the pre-Sentry policy when no DSN is configured', () => {
		expect(build(undefined)).toBe(BASELINE_CSP);
		expect(build('')).toBe(BASELINE_CSP);
		expect(build('   ')).toBe(BASELINE_CSP);
	});

	test('is byte-identical to the pre-Sentry policy when the DSN is malformed', () => {
		expect(build('not-a-url')).toBe(BASELINE_CSP);
		expect(build('https://o1.ingest.us.sentry.io/123')).toBe(BASELINE_CSP);
	});

	test('does not emit a report-uri directive', () => {
		expect(build(SENTRY_DSN)).not.toContain('report-uri');
	});

	test('does not weaken any non-connect-src directive when a DSN is configured', () => {
		const withDsn = build(SENTRY_DSN).split('; ');
		const without = build(undefined).split('; ');
		expect(withDsn.filter((d) => !d.startsWith('connect-src '))).toEqual(
			without.filter((d) => !d.startsWith('connect-src ')),
		);
	});
});
