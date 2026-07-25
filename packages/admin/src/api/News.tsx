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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {ApiClient, type ApiResult} from '@fluxer/admin/src/api/Client';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import type {
	DeleteNewsStoryResponse,
	ListNewsStoriesResponse,
	NewsStoryAdminResponse,
} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';

export async function listNewsStories(config: Config, session: Session): Promise<ApiResult<ListNewsStoriesResponse>> {
	const client = new ApiClient(config, session);
	return client.post<ListNewsStoriesResponse>('/admin/news/list');
}

export async function getNewsStory(
	config: Config,
	session: Session,
	storyId: string,
): Promise<ApiResult<NewsStoryAdminResponse>> {
	const client = new ApiClient(config, session);
	return client.get<NewsStoryAdminResponse>(`/admin/news/${storyId}`);
}

export async function createNewsStory(
	config: Config,
	session: Session,
	title: string,
	body: string,
	imageUrl: string | null,
	imageData: string | null,
): Promise<ApiResult<NewsStoryAdminResponse>> {
	const client = new ApiClient(config, session);
	return client.post<NewsStoryAdminResponse>('/admin/news/create', {
		title,
		body,
		image_url: imageUrl,
		image_data: imageData,
	});
}

export async function updateNewsStory(
	config: Config,
	session: Session,
	storyId: string,
	title: string,
	body: string,
	imageUrl: string | null,
	imageData: string | null,
): Promise<ApiResult<NewsStoryAdminResponse>> {
	const client = new ApiClient(config, session);
	return client.post<NewsStoryAdminResponse>('/admin/news/update', {
		story_id: storyId,
		title,
		body,
		image_url: imageUrl,
		image_data: imageData,
	});
}

export async function publishNewsStory(
	config: Config,
	session: Session,
	storyId: string,
): Promise<ApiResult<NewsStoryAdminResponse>> {
	const client = new ApiClient(config, session);
	return client.post<NewsStoryAdminResponse>('/admin/news/publish', {story_id: storyId});
}

export async function unpublishNewsStory(
	config: Config,
	session: Session,
	storyId: string,
): Promise<ApiResult<NewsStoryAdminResponse>> {
	const client = new ApiClient(config, session);
	return client.post<NewsStoryAdminResponse>('/admin/news/unpublish', {story_id: storyId});
}

export async function deleteNewsStory(
	config: Config,
	session: Session,
	storyId: string,
): Promise<ApiResult<DeleteNewsStoryResponse>> {
	const client = new ApiClient(config, session);
	return client.post<DeleteNewsStoryResponse>('/admin/news/delete', {story_id: storyId});
}
