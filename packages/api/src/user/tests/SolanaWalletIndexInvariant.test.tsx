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

import {createAuthHarness, createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createUserID} from '@fluxer/api/src/BrandedTypes';
import type {ApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {UserRepository} from '@fluxer/api/src/user/repositories/UserRepository';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

/**
 * Regression test for the `User.toRow()` field-list omission: `toRow()` did
 * not emit `solana_address`, so `UserAccountRepository.patchUpsert`'s
 * auto-fetched `oldData` (via `findUniqueAssert(userId).toRow()`) always had
 * `oldData.solana_address === undefined`. That made the stale-index guard in
 * `UserIndexRepository.syncIndices` (`if (oldData?.solana_address &&
 * oldData.solana_address !== data.solana_address)`) never fire, so switching
 * a linked wallet left the OLD `users_by_solana_address` row pointing at the
 * original account forever — letting whoever later controls the old wallet's
 * key log into that account via SIWS.
 *
 * This goes through `UserRepository.patchUpsert` directly (bypassing the
 * API's `SolanaAuthService.linkWallet` / `WALLET_ALREADY_OWNED` stopgap,
 * which currently blocks wallet-switching at the HTTP layer) so it exercises
 * the repository invariant itself, independent of that separate mitigation.
 */
describe('Solana wallet / user-index invariant', () => {
	let harness: ApiTestHarness;

	beforeAll(async () => {
		harness = await createAuthHarness();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('removes the stale users_by_solana_address row when a wallet is switched via patchUpsert', async () => {
		const repository = new UserRepository();
		const account = await createTestAccount(harness);
		const userId = createUserID(BigInt(account.userId));

		const walletA = `WalletA${Date.now()}${Math.random().toString(36).slice(2)}`;
		const walletB = `WalletB${Date.now()}${Math.random().toString(36).slice(2)}`;

		await repository.patchUpsert(userId, {solana_address: walletA});
		expect((await repository.findBySolanaAddress(walletA))?.id).toBe(userId);

		await repository.patchUpsert(userId, {solana_address: walletB});

		// The new wallet resolves to the account...
		expect((await repository.findBySolanaAddress(walletB))?.id).toBe(userId);

		// ...and the old wallet's reverse-index row must be gone, not still
		// resolving to this (or any) account.
		expect(await repository.findBySolanaAddress(walletA)).toBeNull();
	});
});
