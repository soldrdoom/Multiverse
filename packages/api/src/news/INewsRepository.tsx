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
import type {NewsStoryByStatusRow, NewsStoryRow, NewsStoryStatus} from '@fluxer/api/src/database/types/NewsTypes';

export abstract class INewsRepository {
	abstract findById(storyId: NewsStoryID): Promise<NewsStoryRow | null>;
	abstract listByStatus(status: NewsStoryStatus, limit: number): Promise<Array<NewsStoryByStatusRow>>;
	abstract create(row: NewsStoryRow): Promise<void>;
	abstract update(row: NewsStoryRow): Promise<void>;
	abstract setStatus(oldStatus: NewsStoryStatus, oldCreatedAt: Date, updatedRow: NewsStoryRow): Promise<void>;
	abstract delete(storyId: NewsStoryID, status: NewsStoryStatus, createdAt: Date): Promise<void>;
}
