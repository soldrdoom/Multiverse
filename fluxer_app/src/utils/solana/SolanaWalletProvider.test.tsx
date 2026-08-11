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

import {signRawMessage} from '@app/utils/solana/SolanaWalletProvider';
import type {SolanaWalletProviderLike} from '@app/utils/solana/SolanaWalletProvider';
import {describe, expect, test, vi} from 'vitest';

function makeProvider(signMessage: SolanaWalletProviderLike['signMessage']): SolanaWalletProviderLike {
	return {connect: vi.fn(), publicKey: null, signMessage};
}

describe('signRawMessage', () => {
	test('calls provider.signMessage with exactly one argument — no display-hint object', async () => {
		const signMessage = vi.fn().mockResolvedValue({signature: new Uint8Array([1, 2, 3])});
		const provider = makeProvider(signMessage);
		const bytes = new Uint8Array([9, 9, 9]);

		await signRawMessage(provider, bytes);

		expect(signMessage).toHaveBeenCalledTimes(1);
		expect(signMessage.mock.calls[0]).toHaveLength(1);
		expect(signMessage).toHaveBeenCalledWith(bytes);
	});

	test('normalizes array-like signature/signedMessage into real Uint8Array', async () => {
		// Simulate a mobile bridge returning array-like objects, not real typed arrays.
		const signMessage = vi.fn().mockResolvedValue({
			signature: {0: 1, 1: 2, length: 2},
			signedMessage: {0: 3, 1: 4, length: 2},
		});
		const result = await signRawMessage(makeProvider(signMessage), new Uint8Array([0]));

		expect(result.signature).toBeInstanceOf(Uint8Array);
		expect(Array.from(result.signature)).toEqual([1, 2]);
		expect(result.signedMessage).toBeInstanceOf(Uint8Array);
		expect(Array.from(result.signedMessage!)).toEqual([3, 4]);
	});

	test('omits signedMessage when the provider does not return one', async () => {
		const signMessage = vi.fn().mockResolvedValue({signature: new Uint8Array([1])});
		const result = await signRawMessage(makeProvider(signMessage), new Uint8Array([0]));
		expect(result.signedMessage).toBeUndefined();
	});
});
