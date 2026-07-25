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
import {BatchBuilder, fetchMany, fetchOne} from '@fluxer/api/src/database/Cassandra';
import type {NewsStoryByStatusRow, NewsStoryRow, NewsStoryStatus} from '@fluxer/api/src/database/types/NewsTypes';
import {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import {NewsStories, NewsStoriesByStatus} from '@fluxer/api/src/Tables';

const MAX_LIST_LIMIT = 200;

const FETCH_STORY_BY_ID = NewsStories.selectCql({
	where: NewsStories.where.eq('story_id'),
	limit: 1,
});

const FETCH_STORIES_BY_STATUS = NewsStoriesByStatus.selectCql({
	where: NewsStoriesByStatus.where.eq('status'),
	orderBy: {col: 'created_at', direction: 'DESC'},
	limit: MAX_LIST_LIMIT,
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
}
