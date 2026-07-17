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
