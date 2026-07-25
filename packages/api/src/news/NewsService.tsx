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

import {type NewsStoryByStatusRow, NewsStoryStatuses} from '@fluxer/api/src/database/types/NewsTypes';
import type {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import type {NewsStoryResponse} from '@fluxer/schema/src/domains/news/NewsSchemas';

const DEFAULT_PUBLISHED_LIMIT = 20;

function toPublicResponse(row: NewsStoryByStatusRow): NewsStoryResponse {
	return {
		story_id: row.story_id.toString(),
		title: row.title,
		body: row.body,
		image_url: row.image_url ?? null,
		published_at: (row.published_at ?? row.created_at).toISOString(),
	};
}

export class NewsService {
	constructor(private readonly newsRepository: INewsRepository) {}

	async listPublished(limit: number = DEFAULT_PUBLISHED_LIMIT): Promise<Array<NewsStoryResponse>> {
		const rows = await this.newsRepository.listByStatus(NewsStoryStatuses.PUBLISHED, limit);
		return rows.map(toPublicResponse);
	}
}
