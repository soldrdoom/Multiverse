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

import {createStringType, SnowflakeStringType, SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {URLType} from '@fluxer/schema/src/primitives/UrlValidators';
import {z} from 'zod';

export const NewsStoryStatusSchema = z.enum(['draft', 'published']);
export type NewsStoryStatusSchema = z.infer<typeof NewsStoryStatusSchema>;

export const NewsStoryAdminResponse = z.object({
	story_id: SnowflakeStringType,
	title: z.string(),
	body: z.string(),
	image_url: URLType.nullable(),
	status: NewsStoryStatusSchema,
	created_by_user_id: SnowflakeStringType,
	created_at: z.string(),
	updated_at: z.string(),
	published_at: z.string().nullable(),
});
export type NewsStoryAdminResponse = z.infer<typeof NewsStoryAdminResponse>;

export const ListNewsStoriesResponse = z.object({
	stories: z.array(NewsStoryAdminResponse).max(500),
});
export type ListNewsStoriesResponse = z.infer<typeof ListNewsStoriesResponse>;

export const CreateNewsStoryRequest = z.object({
	title: createStringType(1, 200).describe('Title of the news story'),
	body: createStringType(1, 4000).describe('Body content of the news story'),
	image_url: URLType.nullish().describe('URL of the image shown at the top of the news card'),
	image_data: createStringType(1, 15_000_000)
		.nullish()
		.describe('Base64 data URL of an uploaded image; takes precedence over image_url when present'),
});
export type CreateNewsStoryRequest = z.infer<typeof CreateNewsStoryRequest>;

export const UpdateNewsStoryRequest = z.object({
	story_id: SnowflakeType.describe('ID of the story to update'),
	title: createStringType(1, 200).describe('Title of the news story'),
	body: createStringType(1, 4000).describe('Body content of the news story'),
	image_url: URLType.nullish().describe('URL of the image shown at the top of the news card'),
	image_data: createStringType(1, 15_000_000)
		.nullish()
		.describe('Base64 data URL of an uploaded image; takes precedence over image_url when present'),
});
export type UpdateNewsStoryRequest = z.infer<typeof UpdateNewsStoryRequest>;

export const NewsStoryIdRequest = z.object({
	story_id: SnowflakeType.describe('ID of the story'),
});
export type NewsStoryIdRequest = z.infer<typeof NewsStoryIdRequest>;

export const DeleteNewsStoryResponse = z.object({
	story_id: SnowflakeStringType,
});
export type DeleteNewsStoryResponse = z.infer<typeof DeleteNewsStoryResponse>;
