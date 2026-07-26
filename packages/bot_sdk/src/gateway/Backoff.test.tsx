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
import {Backoff} from './Backoff';

describe('Backoff', () => {
	it('draws each delay from (0, min(cap, base * 2^attempt)]', () => {
		const backoff = new Backoff(1_000, 60_000, () => 1);
		expect(backoff.next()).toBe(1_000);
		expect(backoff.next()).toBe(2_000);
		expect(backoff.next()).toBe(4_000);
		expect(backoff.next()).toBe(8_000);
	});

	it('caps the ceiling at capMs', () => {
		const backoff = new Backoff(1_000, 60_000, () => 1);
		for (let i = 0; i < 10; i++) {
			backoff.next();
		}
		expect(backoff.next()).toBe(60_000);
		expect(backoff.next()).toBe(60_000);
	});

	it('applies full jitter across the whole window', () => {
		const backoff = new Backoff(1_000, 60_000, () => 0.25);
		expect(backoff.next()).toBe(250);
		expect(backoff.next()).toBe(500);
	});

	it('stays within bounds with a real RNG', () => {
		const backoff = new Backoff(1_000, 60_000);
		for (let attempt = 0; attempt < 20; attempt++) {
			const ceiling = Math.min(60_000, 1_000 * 2 ** attempt);
			const delay = backoff.next();
			expect(delay).toBeGreaterThanOrEqual(0);
			expect(delay).toBeLessThanOrEqual(ceiling);
		}
	});

	it('reset() returns to the first attempt', () => {
		const backoff = new Backoff(1_000, 60_000, () => 1);
		backoff.next();
		backoff.next();
		expect(backoff.attempt).toBe(2);
		backoff.reset();
		expect(backoff.attempt).toBe(0);
		expect(backoff.next()).toBe(1_000);
	});
});
