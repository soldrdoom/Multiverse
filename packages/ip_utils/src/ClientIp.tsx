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

import {parseIpAddress} from '@fluxer/ip_utils/src/IpAddress';

export interface ClientIpExtractionOptions {
	trustCfConnectingIp?: boolean;
}

export type ClientIpSource = 'cf-connecting-ip' | 'x-real-ip' | 'x-forwarded-for';

export interface ExtractedClientIp {
	ip: string;
	source: ClientIpSource;
}

export interface HeadersLike {
	[key: string]: string | Array<string> | undefined;
}

export class MissingClientIpError extends Error {
	constructor() {
		super('X-Forwarded-For header is required');
		this.name = 'MissingClientIpError';
	}
}

interface HeaderReader {
	get(name: string): string | null;
}

function toStringHeaderValue(value: string | Array<string> | null | undefined): string | null {
	if (Array.isArray(value)) {
		const first = value[0];
		return typeof first === 'string' ? first : null;
	}
	return typeof value === 'string' ? value : null;
}

function parseSingleIpHeader(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = parseIpAddress(trimmed);
	return parsed?.normalized ?? null;
}

/**
 * Takes the RIGHTMOST entry, not the leftmost.
 *
 * `X-Forwarded-For` is append-only and the client controls what it sends, so the leftmost entry is
 * attacker-chosen. Our nginx uses `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`,
 * which expands to `<whatever the client sent>, $remote_addr` — so the rightmost entry is the one
 * value nginx itself appended, i.e. the real peer.
 *
 * Reading the leftmost entry meant every IP-keyed control in the product — rate limits, the IP ban
 * list, captcha triggers, login/registration/password-reset throttling, new-location detection, and
 * the IP recorded on session rows — was keyed off a value the caller could set to anything. Rotating
 * one header defeated all of them; reusing someone else's IP poisoned their bucket and their audit
 * trail.
 */
function parseForwardedForHeader(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const candidates = value.split(',');
	for (let index = candidates.length - 1; index >= 0; index--) {
		const parsed = parseSingleIpHeader(candidates[index] ?? null);
		if (parsed !== null) {
			return parsed;
		}
	}

	return null;
}

function createRequestHeaderReader(request: Request): HeaderReader {
	return {
		get: (name: string): string | null => {
			return request.headers.get(name);
		},
	};
}

function getHeaderValue(headers: HeadersLike, name: string): string | null {
	const lowerName = name.toLowerCase();
	const directMatch = toStringHeaderValue(headers[lowerName]);
	if (directMatch !== null) {
		return directMatch;
	}

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === lowerName) {
			return toStringHeaderValue(value);
		}
	}

	return null;
}

function createNodeHeaderReader(headers: HeadersLike): HeaderReader {
	return {
		get: (name: string): string | null => {
			return getHeaderValue(headers, name);
		},
	};
}

function extractClientIpDetailsFromReader(
	headerReader: HeaderReader,
	options?: ClientIpExtractionOptions,
): ExtractedClientIp | null {
	if (options?.trustCfConnectingIp) {
		const cfConnectingIp = parseSingleIpHeader(headerReader.get('cf-connecting-ip'));
		if (cfConnectingIp) {
			return {
				ip: cfConnectingIp,
				source: 'cf-connecting-ip',
			};
		}
	}

	// Preferred over X-Forwarded-For because it cannot be forged. Our nginx sets
	// `proxy_set_header X-Real-IP $remote_addr` on every proxied location, and proxy_set_header
	// REPLACES the value rather than appending — so whatever a client sends in X-Real-IP is
	// discarded and the app only ever sees the true peer. X-Forwarded-For, by contrast, is appended
	// to, so it always carries an attacker-controlled prefix.
	const xRealIp = parseSingleIpHeader(headerReader.get('x-real-ip'));
	if (xRealIp) {
		return {
			ip: xRealIp,
			source: 'x-real-ip',
		};
	}

	// Fallback for deployments whose proxy doesn't set X-Real-IP. Unreachable behind our own nginx,
	// which always sets it.
	const xForwardedFor = parseForwardedForHeader(headerReader.get('x-forwarded-for'));
	if (xForwardedFor) {
		return {
			ip: xForwardedFor,
			source: 'x-forwarded-for',
		};
	}

	return null;
}

export function extractClientIpDetails(req: Request, options?: ClientIpExtractionOptions): ExtractedClientIp | null {
	return extractClientIpDetailsFromReader(createRequestHeaderReader(req), options);
}

export function extractClientIp(req: Request, options?: ClientIpExtractionOptions): string | null {
	const extracted = extractClientIpDetails(req, options);
	return extracted?.ip ?? null;
}

export function requireClientIp(req: Request, options?: ClientIpExtractionOptions): string {
	const ip = extractClientIp(req, options);
	if (!ip) {
		throw new MissingClientIpError();
	}
	return ip;
}

export function extractClientIpDetailsFromHeaders(
	headers: HeadersLike,
	options?: ClientIpExtractionOptions,
): ExtractedClientIp | null {
	return extractClientIpDetailsFromReader(createNodeHeaderReader(headers), options);
}

export function extractClientIpFromHeaders(headers: HeadersLike, options?: ClientIpExtractionOptions): string | null {
	const extracted = extractClientIpDetailsFromHeaders(headers, options);
	return extracted?.ip ?? null;
}
