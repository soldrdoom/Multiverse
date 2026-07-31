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

import {
	extractClientIp,
	extractClientIpDetails,
	extractClientIpDetailsFromHeaders,
	extractClientIpFromHeaders,
	MissingClientIpError,
	requireClientIp,
} from '@fluxer/ip_utils/src/ClientIp';
import {describe, expect, it} from 'vitest';

describe('extractClientIp', () => {
	// This previously asserted the LEFTMOST entry, which is the half of X-Forwarded-For the client
	// controls. nginx appends the real peer via $proxy_add_x_forwarded_for, so the rightmost entry is
	// the trustworthy one and everything IP-keyed (rate limits, IP bans, captcha, login throttling)
	// depends on picking it.
	it('extracts the last x-forwarded-for entry, which is the one the proxy appended', () => {
		const request = new Request('http://example.com', {
			headers: {'X-Forwarded-For': '192.168.1.1, 10.0.0.1'},
		});

		expect(extractClientIp(request)).toBe('10.0.0.1');
	});

	it('ignores a spoofed x-forwarded-for prefix supplied by the caller', () => {
		// What an attacker sends as X-Forwarded-For ends up to the LEFT of the peer nginx appends.
		const request = new Request('http://example.com', {
			headers: {'X-Forwarded-For': '203.0.113.7, 198.51.100.9, 10.0.0.1'},
		});

		expect(extractClientIp(request)).toBe('10.0.0.1');
	});

	it('prefers x-real-ip over x-forwarded-for, because proxy_set_header replaces rather than appends', () => {
		const request = new Request('http://example.com', {
			headers: {'X-Real-IP': '10.0.0.1', 'X-Forwarded-For': '203.0.113.7'},
		});

		const details = extractClientIpDetails(request);
		expect(details?.ip).toBe('10.0.0.1');
		expect(details?.source).toBe('x-real-ip');
	});

	it('falls back to x-forwarded-for when x-real-ip is absent or unparseable', () => {
		expect(extractClientIp(new Request('http://example.com', {headers: {'X-Forwarded-For': '10.0.0.1'}}))).toBe(
			'10.0.0.1',
		);
		expect(
			extractClientIp(
				new Request('http://example.com', {
					headers: {'X-Real-IP': 'not-an-ip', 'X-Forwarded-For': '10.0.0.1'},
				}),
			),
		).toBe('10.0.0.1');
	});

	it('keeps cf-connecting-ip ahead of x-real-ip when it is trusted', () => {
		const request = new Request('http://example.com', {
			headers: {'CF-Connecting-IP': '203.0.113.50', 'X-Real-IP': '10.0.0.1'},
		});

		expect(extractClientIp(request, {trustCfConnectingIp: true})).toBe('203.0.113.50');
	});

	it('normalizes bracketed and zoned ipv6 from x-forwarded-for', () => {
		const request = new Request('http://example.com', {
			headers: {'X-Forwarded-For': '[fe80::1%eth0]'},
		});

		expect(extractClientIp(request)).toBe('fe80::1');
	});

	it('uses cf-connecting-ip when trusted', () => {
		const request = new Request('http://example.com', {
			headers: {
				'Cf-Connecting-Ip': '203.0.113.50',
				'X-Forwarded-For': '192.168.1.1',
			},
		});

		expect(extractClientIp(request, {trustCfConnectingIp: true})).toBe('203.0.113.50');
		expect(extractClientIp(request, {trustCfConnectingIp: false})).toBe('192.168.1.1');
	});

	it('falls back to x-forwarded-for when trusted cf-connecting-ip is invalid', () => {
		const request = new Request('http://example.com', {
			headers: {
				'Cf-Connecting-Ip': 'not-an-ip',
				'X-Forwarded-For': '192.168.1.1',
			},
		});

		expect(extractClientIp(request, {trustCfConnectingIp: true})).toBe('192.168.1.1');
	});

	it('returns null for missing or invalid headers', () => {
		expect(extractClientIp(new Request('http://example.com'))).toBeNull();
		expect(
			extractClientIp(
				new Request('http://example.com', {
					headers: {'X-Forwarded-For': ''},
				}),
			),
		).toBeNull();
		expect(
			extractClientIp(
				new Request('http://example.com', {
					headers: {'X-Forwarded-For': 'not-an-ip'},
				}),
			),
		).toBeNull();
	});
});

describe('extractClientIpDetails', () => {
	it('returns extracted ip and source', () => {
		const xffRequest = new Request('http://example.com', {
			headers: {'X-Forwarded-For': '192.168.1.1'},
		});

		expect(extractClientIpDetails(xffRequest)).toEqual({
			ip: '192.168.1.1',
			source: 'x-forwarded-for',
		});

		const cfRequest = new Request('http://example.com', {
			headers: {
				'Cf-Connecting-Ip': '203.0.113.50',
				'X-Forwarded-For': '192.168.1.1',
			},
		});

		expect(extractClientIpDetails(cfRequest, {trustCfConnectingIp: true})).toEqual({
			ip: '203.0.113.50',
			source: 'cf-connecting-ip',
		});
	});
});

describe('extractClientIpFromHeaders', () => {
	it('extracts from node-style headers, taking the proxy-appended entry', () => {
		const headers = {
			'x-forwarded-for': '192.168.1.1, 10.0.0.1',
		};

		expect(extractClientIpFromHeaders(headers)).toBe('10.0.0.1');
	});

	it('skips a blank leading entry rather than treating the whole header as invalid', () => {
		// A leading empty element used to null the whole lookup, discarding a perfectly good peer.
		expect(extractClientIpFromHeaders({'x-forwarded-for': ',192.168.1.1'})).toBe('192.168.1.1');
	});

	it('supports case-insensitive keys and array values', () => {
		const headers = {
			'CF-CONNECTING-IP': ['203.0.113.50'],
			'X-Forwarded-For': '192.168.1.1',
		};

		expect(extractClientIpFromHeaders(headers, {trustCfConnectingIp: true})).toBe('203.0.113.50');
		expect(extractClientIpDetailsFromHeaders(headers, {trustCfConnectingIp: true})).toEqual({
			ip: '203.0.113.50',
			source: 'cf-connecting-ip',
		});
	});

	it('returns null for invalid inputs', () => {
		expect(extractClientIpFromHeaders({})).toBeNull();
		expect(extractClientIpFromHeaders({'x-forwarded-for': 'not-an-ip'})).toBeNull();
	});
});

describe('requireClientIp', () => {
	it('returns ip when present', () => {
		const request = new Request('http://example.com', {
			headers: {'X-Forwarded-For': '192.168.1.1'},
		});

		expect(requireClientIp(request)).toBe('192.168.1.1');
	});

	it('throws typed error when missing', () => {
		const request = new Request('http://example.com');
		expect(() => requireClientIp(request)).toThrow(MissingClientIpError);
		expect(() => requireClientIp(request)).toThrow('X-Forwarded-For header is required');
	});
});
