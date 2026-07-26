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

import {describe, expect, it} from 'vitest';
import {RateLimiter} from './RateLimiter';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json', ...headers},
	});
}

describe('RateLimiter', () => {
	it('waits out Retry-After on 429 and retries', async () => {
		const sleeps: Array<number> = [];
		const limiter = new RateLimiter({
			now: () => 0,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		let calls = 0;
		const response = await limiter.execute('bucket', async () => {
			calls += 1;
			if (calls === 1) {
				return jsonResponse(429, {code: 'RATE_LIMITED', message: 'slow down', retry_after: 2}, {'Retry-After': '2'});
			}
			return jsonResponse(200, {ok: true});
		});
		expect(response.status).toBe(200);
		expect(calls).toBe(2);
		expect(sleeps).toEqual([2_000]);
	});

	it('falls back to the body retry_after when the header is missing', async () => {
		const sleeps: Array<number> = [];
		const limiter = new RateLimiter({now: () => 0, sleep: async (ms) => void sleeps.push(ms)});
		let calls = 0;
		await limiter.execute('bucket', async () => {
			calls += 1;
			return calls === 1
				? jsonResponse(429, {code: 'RATE_LIMITED', message: 'slow down', retry_after: 3})
				: jsonResponse(200, {ok: true});
		});
		expect(sleeps).toEqual([3_000]);
	});

	it('returns the final 429 once retries are exhausted', async () => {
		const limiter = new RateLimiter({max429Retries: 2, now: () => 0, sleep: async () => {}});
		let calls = 0;
		const response = await limiter.execute('bucket', async () => {
			calls += 1;
			return jsonResponse(429, {code: 'RATE_LIMITED', message: 'no', retry_after: 1}, {'Retry-After': '1'});
		});
		expect(response.status).toBe(429);
		expect(calls).toBe(3); // initial + 2 retries
	});

	it('pre-emptively waits for the bucket reset when remaining hits 0', async () => {
		const sleeps: Array<number> = [];
		const limiter = new RateLimiter({now: () => 10_000, sleep: async (ms) => void sleeps.push(ms)});
		await limiter.execute('bucket', async () =>
			jsonResponse(200, {ok: true}, {'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '12'}),
		);
		// Reset is unix-seconds 12 → 12_000 ms; now is 10_000 → expect a 2s wait
		// before the next request in the same bucket.
		await limiter.execute('bucket', async () => jsonResponse(200, {ok: true}));
		expect(sleeps).toEqual([2_000]);
	});

	it('serializes requests within a bucket but not across buckets', async () => {
		const limiter = new RateLimiter({now: () => 0, sleep: async () => {}});
		const order: Array<string> = [];
		let releaseFirst: () => void = () => {};
		const firstBlocked = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = limiter.execute('bucket-a', async () => {
			order.push('a1:start');
			await firstBlocked;
			order.push('a1:end');
			return jsonResponse(200, {});
		});
		const second = limiter.execute('bucket-a', async () => {
			order.push('a2:start');
			return jsonResponse(200, {});
		});
		const other = limiter.execute('bucket-b', async () => {
			order.push('b1:start');
			return jsonResponse(200, {});
		});

		await other;
		// b1 ran to completion while a1 is still blocked → buckets are independent.
		expect(order).toContain('b1:start');
		expect(order).not.toContain('a2:start');

		releaseFirst();
		await Promise.all([first, second]);
		expect(order.indexOf('a2:start')).toBeGreaterThan(order.indexOf('a1:end'));
	});

	it('applies a global 429 across all buckets', async () => {
		let nowMs = 0;
		const sleeps: Array<number> = [];
		const limiter = new RateLimiter({
			now: () => nowMs,
			sleep: async (ms) => {
				sleeps.push(ms);
				nowMs += ms;
			},
		});
		let calls = 0;
		await limiter.execute('bucket-a', async () => {
			calls += 1;
			return calls === 1
				? jsonResponse(429, {code: 'RATE_LIMITED', message: 'global', retry_after: 5, global: true})
				: jsonResponse(200, {ok: true});
		});
		// A different bucket must also respect the global window.
		nowMs = 2_000;
		await limiter.execute('bucket-b', async () => jsonResponse(200, {ok: true}));
		expect(sleeps).toEqual([5_000, 3_000]);
	});
});
