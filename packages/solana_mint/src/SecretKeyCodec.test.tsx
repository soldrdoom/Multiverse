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

import {decodeSecretKey} from '@fluxer/solana_mint/src/SecretKeyCodec';
import bs58 from 'bs58';
import {describe, expect, it} from 'vitest';

describe('decodeSecretKey', () => {
	it('decodes a JSON byte-array secret key (solana-keygen on-disk format)', () => {
		const bytes = Uint8Array.from({length: 64}, (_, i) => i);
		const raw = JSON.stringify(Array.from(bytes));
		expect(decodeSecretKey(raw)).toEqual(bytes);
	});

	it('decodes a base58-encoded secret key', () => {
		const bytes = Uint8Array.from({length: 64}, (_, i) => (i * 7) % 256);
		const raw = bs58.encode(bytes);
		expect(decodeSecretKey(raw)).toEqual(bytes);
	});

	it('trims surrounding whitespace before deciding which format it is', () => {
		const bytes = Uint8Array.from([1, 2, 3]);
		const raw = `  ${JSON.stringify(Array.from(bytes))}  `;
		expect(decodeSecretKey(raw)).toEqual(bytes);
	});

	it('rejects a JSON array containing non-numbers', () => {
		expect(() => decodeSecretKey('[1, 2, "3"]')).toThrow();
	});
});
