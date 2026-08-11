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

import {createVaultSignFn, verifyChallengeIntegrity} from '@app/services/vault/VaultService';
import type {SolanaWalletProviderLike} from '@app/utils/solana/SolanaWalletProvider';
import {describe, expect, test, vi} from 'vitest';

describe('verifyChallengeIntegrity', () => {
	const challenge = new TextEncoder().encode('[Multiverse] Unlock Identity Vault for: 123');

	test('passes when signedMessage exactly matches challengeBytes', () => {
		expect(() => verifyChallengeIntegrity(challenge, new Uint8Array(challenge))).not.toThrow();
	});

	test('throws when signedMessage differs (wallet-added prefix)', () => {
		const prefixed = new Uint8Array([0xff, ...challenge]);
		expect(() => verifyChallengeIntegrity(challenge, prefixed)).toThrow(/modified the message/);
	});

	test('throws when signedMessage is same length but different bytes', () => {
		const tampered = new Uint8Array(challenge);
		tampered[0] ^= 0xff;
		expect(() => verifyChallengeIntegrity(challenge, tampered)).toThrow(/modified the message/);
	});

	test('does not throw when signedMessage is absent (provider does not report it)', () => {
		expect(() => verifyChallengeIntegrity(challenge, undefined)).not.toThrow();
	});
});

describe('createVaultSignFn', () => {
	test('the returned SignFn calls provider.signMessage with exactly one argument', async () => {
		const signMessage = vi
			.fn()
			.mockResolvedValue({signature: new Uint8Array([1]), signedMessage: new Uint8Array([1])});
		const provider: SolanaWalletProviderLike = {connect: vi.fn(), publicKey: null, signMessage};
		const signFn = createVaultSignFn(provider);
		const challenge = new Uint8Array([5, 6, 7]);

		await signFn(challenge);

		expect(signMessage.mock.calls[0]).toHaveLength(1);
		expect(signMessage).toHaveBeenCalledWith(challenge);
	});
});
