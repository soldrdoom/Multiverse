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

import type {ApplicationID} from '@fluxer/api/src/BrandedTypes';
import {BatchBuilder, fetchMany, fetchOne} from '@fluxer/api/src/database/Cassandra';
import type {
	ApplicationBotTokenByApplicationRow,
	ApplicationBotTokenRow,
} from '@fluxer/api/src/database/types/OAuth2Types';
import {Logger} from '@fluxer/api/src/Logger';
import type {IBotTokenRepository} from '@fluxer/api/src/oauth/repositories/IBotTokenRepository';
import {ApplicationBotTokens, ApplicationBotTokensByApplication} from '@fluxer/api/src/Tables';

const SELECT_TOKEN_BY_LOOKUP_HASH_CQL = ApplicationBotTokens.selectCql({
	where: ApplicationBotTokens.where.eq('lookup_hash'),
});

const SELECT_TOKEN_INDEX_BY_APPLICATION_CQL = ApplicationBotTokensByApplication.selectCql({
	where: ApplicationBotTokensByApplication.where.eq('application_id'),
});

const SELECT_TOKENS_BY_LOOKUP_HASHES_CQL = ApplicationBotTokens.selectCql({
	where: ApplicationBotTokens.where.in('lookup_hash', 'lookup_hashes'),
});

export class BotTokenRepository implements IBotTokenRepository {
	async getByLookupHash(lookupHash: string): Promise<ApplicationBotTokenRow | null> {
		return fetchOne<ApplicationBotTokenRow>(SELECT_TOKEN_BY_LOOKUP_HASH_CQL, {lookup_hash: lookupHash});
	}

	async listByApplication(applicationId: ApplicationID): Promise<Array<ApplicationBotTokenRow>> {
		const index = await fetchMany<ApplicationBotTokenByApplicationRow>(SELECT_TOKEN_INDEX_BY_APPLICATION_CQL, {
			application_id: applicationId,
		});

		if (index.length === 0) {
			return [];
		}

		const rows = await fetchMany<ApplicationBotTokenRow>(SELECT_TOKENS_BY_LOOKUP_HASHES_CQL, {
			lookup_hashes: index.map((entry) => entry.lookup_hash),
		});

		return rows.sort((a, b) => (a.token_id < b.token_id ? 1 : a.token_id > b.token_id ? -1 : 0));
	}

	async insert(row: ApplicationBotTokenRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationBotTokens.upsertAll(row));
		batch.addPrepared(
			ApplicationBotTokensByApplication.upsertAll({
				application_id: row.application_id,
				token_id: row.token_id,
				lookup_hash: row.lookup_hash,
			}),
		);
		await batch.execute();
	}

	async delete(applicationId: ApplicationID, tokenId: bigint, lookupHash: string): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationBotTokens.deleteByPk({lookup_hash: lookupHash}));
		batch.addPrepared(
			ApplicationBotTokensByApplication.deleteByPk({application_id: applicationId, token_id: tokenId}),
		);
		await batch.execute();
	}

	async deleteAllForApplication(applicationId: ApplicationID): Promise<void> {
		const index = await fetchMany<ApplicationBotTokenByApplicationRow>(SELECT_TOKEN_INDEX_BY_APPLICATION_CQL, {
			application_id: applicationId,
		});

		if (index.length === 0) {
			return;
		}

		const batch = new BatchBuilder();
		for (const entry of index) {
			batch.addPrepared(ApplicationBotTokens.deleteByPk({lookup_hash: entry.lookup_hash}));
			batch.addPrepared(
				ApplicationBotTokensByApplication.deleteByPk({
					application_id: applicationId,
					token_id: entry.token_id,
				}),
			);
		}
		await batch.execute();
	}

	async touchLastUsed(lookupHash: string, at: Date): Promise<void> {
		try {
			const existing = await this.getByLookupHash(lookupHash);
			if (!existing) {
				return;
			}
			const batch = new BatchBuilder();
			batch.addPrepared(ApplicationBotTokens.upsertAll({...existing, last_used_at: at}));
			await batch.execute();
		} catch (error) {
			// Usage tracking is advisory. A failure here must never surface on the
			// request that triggered it, which has already authenticated.
			Logger.warn({error, lookupHash}, 'Failed to record bot token last_used_at');
		}
	}
}
