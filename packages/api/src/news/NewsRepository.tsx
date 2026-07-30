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

import type {NewsStoryID} from '@fluxer/api/src/BrandedTypes';
import {BatchBuilder, deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '@fluxer/api/src/database/Cassandra';
import type {
	NewsStoryByStatusRow,
	NewsStoryRow,
	NewsStoryStatus,
	NewsStoryVoteRow,
} from '@fluxer/api/src/database/types/NewsTypes';
import {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import {NewsStories, NewsStoriesByStatus, NewsStoryVotes} from '@fluxer/api/src/Tables';

const MAX_LIST_LIMIT = 200;

// Vote totals are derived by scanning a story's partition. This cap bounds the *reported total*,
// not the work: it is pushed into the CQL on Cassandra, but on the SQLite backend the official
// deployment actually runs, `executeQuerySqlite` reads and deserializes every row in the partition
// and only then applies the limit as a `.slice()`. So a story with more than this many voters
// under-reports its totals *and* still pays for the full read. What bounds the work on the public,
// unauthenticated `GET /news` path is NewsService's tally cache, which keeps this scan to at most
// once per story per TTL window; raise this number (and re-prepare) only alongside a real
// pagination story.
const MAX_VOTES_SCAN = 5000;

const FETCH_STORY_BY_ID = NewsStories.selectCql({
	where: NewsStories.where.eq('story_id'),
	limit: 1,
});

const FETCH_STORIES_BY_STATUS = NewsStoriesByStatus.selectCql({
	where: NewsStoriesByStatus.where.eq('status'),
	orderBy: {col: 'created_at', direction: 'DESC'},
	limit: MAX_LIST_LIMIT,
});

const FETCH_VOTES_BY_STORY = NewsStoryVotes.selectCql({
	where: NewsStoryVotes.where.eq('story_id'),
	limit: MAX_VOTES_SCAN,
});

const FETCH_VOTE_BY_VOTER = NewsStoryVotes.selectCql({
	where: [NewsStoryVotes.where.eq('story_id'), NewsStoryVotes.where.eq('voter_address')],
	limit: 1,
});

function toByStatusRow(row: NewsStoryRow): NewsStoryByStatusRow {
	return {
		status: row.status,
		created_at: row.created_at,
		story_id: row.story_id,
		title: row.title,
		body: row.body,
		image_url: row.image_url,
		created_by_user_id: row.created_by_user_id,
		updated_at: row.updated_at,
		published_at: row.published_at,
	};
}

export class NewsRepository extends INewsRepository {
	async findById(storyId: NewsStoryID): Promise<NewsStoryRow | null> {
		return await fetchOne<NewsStoryRow>(FETCH_STORY_BY_ID, {story_id: storyId});
	}

	async listByStatus(status: NewsStoryStatus, limit: number): Promise<Array<NewsStoryByStatusRow>> {
		const rows = await fetchMany<NewsStoryByStatusRow>(FETCH_STORIES_BY_STATUS, {status});
		return rows.slice(0, limit);
	}

	async create(row: NewsStoryRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(NewsStories.insert(row));
		batch.addPrepared(NewsStoriesByStatus.insert(toByStatusRow(row)));
		await batch.execute();
	}

	async update(row: NewsStoryRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(NewsStories.insert(row));
		batch.addPrepared(NewsStoriesByStatus.insert(toByStatusRow(row)));
		await batch.execute();
	}

	async setStatus(oldStatus: NewsStoryStatus, oldCreatedAt: Date, updatedRow: NewsStoryRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(
			NewsStoriesByStatus.deleteByPk({
				status: oldStatus,
				created_at: oldCreatedAt,
				story_id: updatedRow.story_id,
			}),
		);
		batch.addPrepared(NewsStories.insert(updatedRow));
		batch.addPrepared(NewsStoriesByStatus.insert(toByStatusRow(updatedRow)));
		await batch.execute();
	}

	async delete(storyId: NewsStoryID, status: NewsStoryStatus, createdAt: Date): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(NewsStories.deleteByPk({story_id: storyId}));
		batch.addPrepared(NewsStoriesByStatus.deleteByPk({status, created_at: createdAt, story_id: storyId}));
		await batch.execute();
	}

	async listVotes(storyId: NewsStoryID): Promise<Array<NewsStoryVoteRow>> {
		return await fetchMany<NewsStoryVoteRow>(FETCH_VOTES_BY_STORY, {story_id: storyId});
	}

	async findVote(storyId: NewsStoryID, voterAddress: string): Promise<NewsStoryVoteRow | null> {
		return await fetchOne<NewsStoryVoteRow>(FETCH_VOTE_BY_VOTER, {story_id: storyId, voter_address: voterAddress});
	}

	async upsertVote(row: NewsStoryVoteRow): Promise<void> {
		await upsertOne(NewsStoryVotes.insert(row));
	}

	async deleteVote(storyId: NewsStoryID, voterAddress: string): Promise<void> {
		await deleteOneOrMany(NewsStoryVotes.deleteByPk({story_id: storyId, voter_address: voterAddress}));
	}
}
