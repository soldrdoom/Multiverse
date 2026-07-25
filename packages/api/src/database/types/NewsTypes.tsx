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

import type {NewsStoryID, UserID} from '@fluxer/api/src/BrandedTypes';

type Nullish<T> = T | null;

export const NewsStoryStatuses = {
	DRAFT: 'draft',
	PUBLISHED: 'published',
} as const;

export type NewsStoryStatus = (typeof NewsStoryStatuses)[keyof typeof NewsStoryStatuses];

export interface NewsStoryRow {
	story_id: NewsStoryID;
	title: string;
	body: string;
	image_url: Nullish<string>;
	status: NewsStoryStatus;
	created_by_user_id: UserID;
	created_at: Date;
	updated_at: Date;
	published_at: Nullish<Date>;
}

export const NEWS_STORY_COLUMNS = [
	'story_id',
	'title',
	'body',
	'image_url',
	'status',
	'created_by_user_id',
	'created_at',
	'updated_at',
	'published_at',
] as const satisfies ReadonlyArray<keyof NewsStoryRow>;

// Denormalized copy of NewsStoryRow, partitioned by status. Clustered by created_at (rather than
// published_at) since Cassandra primary-key columns can't be null and draft stories have no
// published_at yet. Fully denormalized so listing by status never needs to hydrate from NewsStories.
export interface NewsStoryByStatusRow {
	status: NewsStoryStatus;
	created_at: Date;
	story_id: NewsStoryID;
	title: string;
	body: string;
	image_url: Nullish<string>;
	created_by_user_id: UserID;
	updated_at: Date;
	published_at: Nullish<Date>;
}

export const NEWS_STORY_BY_STATUS_COLUMNS = [
	'status',
	'created_at',
	'story_id',
	'title',
	'body',
	'image_url',
	'created_by_user_id',
	'updated_at',
	'published_at',
] as const satisfies ReadonlyArray<keyof NewsStoryByStatusRow>;
