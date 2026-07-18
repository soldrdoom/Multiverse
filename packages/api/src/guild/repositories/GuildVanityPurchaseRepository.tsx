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

import type {GuildID} from '@fluxer/api/src/BrandedTypes';
import {executeConditional, fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {
	GuildVanityPurchaseByTxSignatureRow,
	GuildVanityPurchaseRow,
} from '@fluxer/api/src/database/types/GuildVanityPurchaseTypes';
import {GuildVanityPurchases, GuildVanityPurchasesByTxSignature} from '@fluxer/api/src/Tables';

const FETCH_PURCHASE_CQL = GuildVanityPurchases.selectCql({
	where: [GuildVanityPurchases.where.eq('guild_id'), GuildVanityPurchases.where.eq('purchase_id')],
});

const FETCH_PURCHASE_BY_TX_SIGNATURE_CQL = GuildVanityPurchasesByTxSignature.selectCql({
	where: GuildVanityPurchasesByTxSignature.where.eq('tx_signature'),
});

export class GuildVanityPurchaseRepository {
	async createPurchase(row: GuildVanityPurchaseRow): Promise<void> {
		await upsertOne(GuildVanityPurchases.upsertAll(row));
	}

	async getPurchase(guildId: GuildID, purchaseId: string): Promise<GuildVanityPurchaseRow | null> {
		return fetchOne<GuildVanityPurchaseRow>(FETCH_PURCHASE_CQL, {guild_id: guildId, purchase_id: purchaseId});
	}

	async updatePurchase(row: GuildVanityPurchaseRow): Promise<void> {
		await upsertOne(GuildVanityPurchases.upsertAll(row));
	}

	/** Atomically reserves a tx_signature so it can never be applied to more than one purchase. */
	async reserveTxSignature(txSignature: string, guildId: GuildID, purchaseId: string): Promise<{applied: boolean}> {
		return executeConditional(
			GuildVanityPurchasesByTxSignature.insertIfNotExists({
				tx_signature: txSignature,
				guild_id: guildId,
				purchase_id: purchaseId,
			}),
		);
	}

	async findByTxSignature(txSignature: string): Promise<GuildVanityPurchaseByTxSignatureRow | null> {
		return fetchOne<GuildVanityPurchaseByTxSignatureRow>(FETCH_PURCHASE_BY_TX_SIGNATURE_CQL, {
			tx_signature: txSignature,
		});
	}
}
