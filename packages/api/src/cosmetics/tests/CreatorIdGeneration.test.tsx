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

import {CosmeticsRepository} from '@fluxer/api/src/cosmetics/CosmeticsRepository';
import {createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import type {ApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

/**
 * Regression test for `CosmeticsRepository.createCreator` always assigning
 * `creator_id: 1`.
 *
 * Root cause: on this deployment's SQLite/KV-shim backend, `executeQuerySqlite`'s
 * 'select' action does not implement SQL aggregate functions — it just projects each
 * scanned row's literal named columns. `SELECT MAX(creator_id) as max_id FROM creators`
 * therefore returned `{max_id: undefined}` for every existing row, so
 * `maxRow?.max_id ?? 0` always evaluated to `0` and every call computed `nextId = 1`,
 * silently overwriting whatever creator already held id 1 instead of creating a new row.
 *
 * This test creates several creators in sequence and asserts ids are strictly
 * increasing and unique, and that a previously-created creator's row survives
 * (is not clobbered) by a later createCreator call.
 */
describe('CosmeticsRepository.createCreator id generation', () => {
	let harness: ApiTestHarness;
	let repository: CosmeticsRepository;

	beforeAll(async () => {
		harness = await createApiTestHarness();
		repository = new CosmeticsRepository();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('assigns strictly increasing, unique creator_ids across sequential calls', async () => {
		const first = await repository.createCreator('WalletOne');
		const second = await repository.createCreator('WalletTwo');
		const third = await repository.createCreator('WalletThree');

		expect(first.creator_id).toBe(1);
		expect(second.creator_id).toBe(2);
		expect(third.creator_id).toBe(3);

		// The bug made every call return 1 — explicitly guard against that regression.
		const ids = [first.creator_id, second.creator_id, third.creator_id];
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('does not overwrite an existing creator row when a new one is created', async () => {
		const first = await repository.createCreator('WalletOne');
		await repository.createCreator('WalletTwo');

		const reloaded = await repository.getCreatorById(first.creator_id);
		expect(reloaded).not.toBeNull();
		expect(reloaded?.solana_address).toBe('WalletOne');
	});

	it('keeps the wallet -> creator_id index in sync for every created creator', async () => {
		const first = await repository.createCreator('WalletOne');
		const second = await repository.createCreator('WalletTwo');

		expect((await repository.getCreatorByWallet('WalletOne'))?.creator_id).toBe(first.creator_id);
		expect((await repository.getCreatorByWallet('WalletTwo'))?.creator_id).toBe(second.creator_id);
	});

	it('continues sequencing correctly after concurrent createCreator calls', async () => {
		const [a, b, c] = await Promise.all([
			repository.createCreator('WalletA'),
			repository.createCreator('WalletB'),
			repository.createCreator('WalletC'),
		]);

		const ids = [a.creator_id, b.creator_id, c.creator_id];
		expect(new Set(ids).size).toBe(3);
		for (const id of ids) {
			expect(await repository.getCreatorById(id)).not.toBeNull();
		}
	});
});
