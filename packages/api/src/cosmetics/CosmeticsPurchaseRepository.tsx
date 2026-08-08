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

import {executeConditional, fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {
	CosmeticsPurchaseByTxSignatureRow,
	CosmeticsPurchaseRow,
} from '@fluxer/api/src/database/types/CosmeticsPurchaseTypes';
import {CosmeticsPurchases, CosmeticsPurchasesByTxSignature} from '@fluxer/api/src/Tables';

const FETCH_PURCHASE_CQL = CosmeticsPurchases.selectCql({
	where: CosmeticsPurchases.where.eq('purchase_id'),
});

const FETCH_PURCHASE_BY_TX_SIGNATURE_CQL = CosmeticsPurchasesByTxSignature.selectCql({
	where: CosmeticsPurchasesByTxSignature.where.eq('tx_signature'),
});

/**
 * Durable pending-purchase + replay-protection storage for the cosmetics shop,
 * mirroring GuildVanityPurchaseRepository's shape: a purchase row keyed by
 * purchase_id, plus a tx_signature → purchase_id index used as a conditional
 * (INSERT ... IF NOT EXISTS) lock so the same on-chain transaction can never be
 * applied to more than one purchase.
 */
export class CosmeticsPurchaseRepository {
	async createPurchase(row: CosmeticsPurchaseRow): Promise<void> {
		await upsertOne(CosmeticsPurchases.upsertAll(row));
	}

	async getPurchase(purchaseId: string): Promise<CosmeticsPurchaseRow | null> {
		return fetchOne<CosmeticsPurchaseRow>(FETCH_PURCHASE_CQL, {purchase_id: purchaseId});
	}

	async updatePurchase(row: CosmeticsPurchaseRow): Promise<void> {
		await upsertOne(CosmeticsPurchases.upsertAll(row));
	}

	/** Atomically reserves a tx_signature so it can never be applied to more than one purchase. */
	async reserveTxSignature(txSignature: string, purchaseId: string): Promise<{applied: boolean}> {
		return executeConditional(
			CosmeticsPurchasesByTxSignature.insertIfNotExists({
				tx_signature: txSignature,
				purchase_id: purchaseId,
			}),
		);
	}

	async findByTxSignature(txSignature: string): Promise<CosmeticsPurchaseByTxSignatureRow | null> {
		return fetchOne<CosmeticsPurchaseByTxSignatureRow>(FETCH_PURCHASE_BY_TX_SIGNATURE_CQL, {
			tx_signature: txSignature,
		});
	}
}
