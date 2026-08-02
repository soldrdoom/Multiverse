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

import {randomBytes} from 'node:crypto';
import {parseSentryDSN} from '@fluxer/app_proxy/src/app_server/utils/SentryDSN';

export const CSP_HOSTS = {
	FRAME: [
		'https://www.youtube.com/embed/',
		'https://www.youtube.com/s/player/',
		'https://hcaptcha.com',
		'https://*.hcaptcha.com',
		'https://challenges.cloudflare.com',
	],
	IMAGE: [
		'https://*.fluxer.app',
		'https://i.ytimg.com',
		'https://*.youtube.com',
		'https://fluxerusercontent.com',
		'https://multiverse.forum',
		'https://*.fluxer.media',
		'https://fluxer.media',
	],
	MEDIA: [
		'https://*.fluxer.app',
		'https://*.youtube.com',
		'https://fluxerusercontent.com',
		'https://multiverse.forum',
		'https://*.fluxer.media',
		'https://fluxer.media',
	],
	SCRIPT: [
		'https://*.fluxer.app',
		'https://hcaptcha.com',
		'https://*.hcaptcha.com',
		'https://challenges.cloudflare.com',
		'https://multiverse.forum',
	],
	STYLE: [
		'https://*.fluxer.app',
		'https://hcaptcha.com',
		'https://*.hcaptcha.com',
		'https://challenges.cloudflare.com',
		'https://multiverse.forum',
	],
	FONT: ['https://*.fluxer.app', 'https://multiverse.forum'],
	CONNECT: [
		'https://*.fluxer.app',
		'wss://*.fluxer.app',
		'https://*.fluxer.media',
		'wss://*.fluxer.media',
		'https://hcaptcha.com',
		'https://*.hcaptcha.com',
		'https://challenges.cloudflare.com',
		'https://*.fluxer.workers.dev',
		'https://fluxerusercontent.com',
		'https://multiverse.forum',
		'https://fluxer.media',
		'https://mainnet.helius-rpc.com',
		'https://api.mainnet-beta.solana.com',
		'https://devnet.helius-rpc.com',
		'https://api.devnet.solana.com',
		'https://rpc.ankr.com',
		'http://127.0.0.1:21863',
		'http://127.0.0.1:21864',
	],
	WORKER: ['https://*.fluxer.app', 'https://multiverse.forum', 'blob:'],
	MANIFEST: ['https://*.fluxer.app'],
} as const;

export interface CSPOptions {
	defaultSrc?: ReadonlyArray<string>;
	scriptSrc?: ReadonlyArray<string>;
	styleSrc?: ReadonlyArray<string>;
	imgSrc?: ReadonlyArray<string>;
	mediaSrc?: ReadonlyArray<string>;
	fontSrc?: ReadonlyArray<string>;
	connectSrc?: ReadonlyArray<string>;
	frameSrc?: ReadonlyArray<string>;
	workerSrc?: ReadonlyArray<string>;
	manifestSrc?: ReadonlyArray<string>;
	reportUri?: string;
}

export interface SentryCSPConfig {
	sentryDsn: string;
}

export function generateNonce(): string {
	return randomBytes(16).toString('hex');
}

export function buildSentryReportURI(config: SentryCSPConfig): string {
	const sentry = parseSentryDSN(config.sentryDsn);
	if (!sentry) {
		return '';
	}

	let uri = `${sentry.targetUrl}${sentry.pathPrefix}/api/${sentry.projectId}/security/?sentry_version=7`;

	if (sentry.publicKey) {
		uri += `&sentry_key=${sentry.publicKey}`;
	}

	return uri;
}

export function buildCSP(nonce: string, options?: CSPOptions): string {
	const defaultSrc = ["'self'", ...(options?.defaultSrc ?? [])];
	const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'wasm-unsafe-eval'", ...(options?.scriptSrc ?? [])];
	const styleSrc = ["'self'", "'unsafe-inline'", ...(options?.styleSrc ?? [])];
	const imgSrc = ["'self'", 'blob:', 'data:', ...(options?.imgSrc ?? [])];
	const mediaSrc = ["'self'", 'blob:', ...(options?.mediaSrc ?? [])];
	const fontSrc = ["'self'", 'data:', ...(options?.fontSrc ?? [])];
	const connectSrc = ["'self'", 'data:', ...(options?.connectSrc ?? [])];
	const frameSrc = ["'self'", ...(options?.frameSrc ?? [])];
	const workerSrc = ["'self'", 'blob:', ...(options?.workerSrc ?? [])];
	const manifestSrc = ["'self'", ...(options?.manifestSrc ?? [])];

	const directives = [
		`default-src ${defaultSrc.join(' ')}`,
		`script-src ${scriptSrc.join(' ')}`,
		`style-src ${styleSrc.join(' ')}`,
		`img-src ${imgSrc.join(' ')}`,
		`media-src ${mediaSrc.join(' ')}`,
		`font-src ${fontSrc.join(' ')}`,
		`connect-src ${connectSrc.join(' ')}`,
		`frame-src ${frameSrc.join(' ')}`,
		`worker-src ${workerSrc.join(' ')}`,
		`manifest-src ${manifestSrc.join(' ')}`,
		"object-src 'none'",
		"base-uri 'self'",
		"frame-ancestors 'none'",
	];

	if (options?.reportUri) {
		directives.push(`report-uri ${options.reportUri}`);
	}

	return directives.join('; ');
}

/**
 * CSP for the standalone `fluxer_app_proxy` deployment, built from the static
 * `CSP_HOSTS` allowlists above.
 *
 * NOTE: this is NOT the policy served by the official multiverse.forum
 * deployment. That one is `buildFluxerServerCSPOptions` below, which the
 * `fluxer_server` umbrella passes to `createAppServer`. The two intentionally
 * differ (scheme-wide `wss:`/`ws:`/`https:` sources, dynamic
 * `publicUrlHost`/`mediaUrlHost`); keep both in mind when editing either.
 */
export function buildMultiverseCSPOptions(config: SentryCSPConfig): CSPOptions {
	const reportURI = buildSentryReportURI(config);
	const sentry = parseSentryDSN(config.sentryDsn);
	const connectSrc: Array<string> = [...CSP_HOSTS.CONNECT];
	if (sentry) {
		connectSrc.push(sentry.targetUrl);
	}

	return {
		scriptSrc: [...CSP_HOSTS.SCRIPT],
		styleSrc: [...CSP_HOSTS.STYLE],
		imgSrc: [...CSP_HOSTS.IMAGE],
		mediaSrc: [...CSP_HOSTS.MEDIA],
		fontSrc: [...CSP_HOSTS.FONT],
		connectSrc: Array.from(new Set(connectSrc)),
		frameSrc: [...CSP_HOSTS.FRAME],
		workerSrc: [...CSP_HOSTS.WORKER],
		manifestSrc: [...CSP_HOSTS.MANIFEST],
		reportUri: reportURI || undefined,
	};
}

export function buildMultiverseCSP(nonce: string, config: SentryCSPConfig): string {
	return buildCSP(nonce, buildMultiverseCSPOptions(config));
}

export interface FluxerServerCSPConfig {
	publicUrlHost: string;
	mediaUrlHost: string;
	sentryDsn?: string;
}

/**
 * CSP actually served by the `fluxer_server` umbrella deployment (see
 * `fluxer_server/src/ServiceInitializer.tsx`, `createAppServerInitializer`).
 *
 * Intentionally restricted to this instance's own origins plus the few external
 * hosts the client genuinely talks to. External CDN sources (e.g.
 * fluxerstatic.com) have been removed — all scripts, styles, fonts, and images
 * are served from this instance.
 *
 * frame-src is empty (resolves to 'self' only) — 'none' alongside other sources
 * is invalid.
 *
 * NFT sticker images are externally-hosted (IPFS, Arweave, arbitrary CDNs), so
 * `https:` is required in imgSrc — there is no practical alternative without a
 * full image proxy.
 *
 * The Sentry ingest origin is derived from the configured frontend DSN
 * (`app_public.sentry_dsn`) rather than hardcoded. When no DSN is configured the
 * returned directives are byte-identical to the pre-Sentry policy.
 */
export function buildFluxerServerCSPOptions(config: FluxerServerCSPConfig): CSPOptions {
	const {publicUrlHost, mediaUrlHost, sentryDsn} = config;

	const connectSrc: Array<string> = [
		"'self'",
		'wss:',
		'ws:',
		publicUrlHost,
		'https://ip.fluxer.workers.dev',
		'https://mainnet.helius-rpc.com',
		'https://api.mainnet-beta.solana.com',
		'https://devnet.helius-rpc.com',
		'https://api.devnet.solana.com',
		'https://rpc.ankr.com',
	];

	// Browser error reporting POSTs to the Sentry ingest origin; without it in
	// connect-src the SDK initializes fine and every event is silently blocked.
	const sentry = parseSentryDSN(sentryDsn);
	if (sentry && !connectSrc.includes(sentry.targetUrl)) {
		connectSrc.push(sentry.targetUrl);
	}

	return {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		imgSrc: ["'self'", 'data:', 'blob:', 'https:', publicUrlHost, mediaUrlHost],
		connectSrc,
		fontSrc: ["'self'"],
		mediaSrc: ["'self'", 'blob:', mediaUrlHost],
		frameSrc: [],
	};
}
