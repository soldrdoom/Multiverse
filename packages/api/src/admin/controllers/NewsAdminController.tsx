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

import {createNewsStoryID} from '@fluxer/api/src/BrandedTypes';
import {requireAdminACL} from '@fluxer/api/src/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {
	CreateNewsStoryRequest,
	DeleteNewsStoryResponse,
	ListNewsStoriesResponse,
	NewsStoryAdminResponse,
	NewsStoryIdRequest,
	UpdateNewsStoryRequest,
} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';
import {NewsStoryIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';

export function NewsAdminController(app: HonoApp) {
	app.post(
		'/admin/news/list',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_VIEW),
		OpenAPI({
			operationId: 'list_news_stories',
			summary: 'List news stories',
			description: 'Lists all news stories regardless of status. Requires NEWS_VIEW permission.',
			responseSchema: ListNewsStoriesResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			return ctx.json(await adminService.listNewsStories());
		},
	);

	app.get(
		'/admin/news/:story_id',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_VIEW),
		Validator('param', NewsStoryIdParam),
		OpenAPI({
			operationId: 'get_news_story',
			summary: 'Get a news story',
			description: 'Retrieves a single news story by ID. Requires NEWS_VIEW permission.',
			responseSchema: NewsStoryAdminResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const {story_id} = ctx.req.valid('param');
			return ctx.json(await adminService.getNewsStory(createNewsStoryID(story_id)));
		},
	);

	app.post(
		'/admin/news/create',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_MANAGE),
		Validator('json', CreateNewsStoryRequest),
		OpenAPI({
			operationId: 'create_news_story',
			summary: 'Create a news story',
			description: 'Creates a new news story as a draft. Requires NEWS_MANAGE permission.',
			responseSchema: NewsStoryAdminResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const {title, body, image_url, image_data} = ctx.req.valid('json');
			return ctx.json(
				await adminService.createNewsStory(title, body, image_url ?? null, image_data ?? null, adminUserId),
			);
		},
	);

	app.post(
		'/admin/news/update',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_MANAGE),
		Validator('json', UpdateNewsStoryRequest),
		OpenAPI({
			operationId: 'update_news_story',
			summary: 'Update a news story',
			description: 'Updates the title and body of an existing news story. Requires NEWS_MANAGE permission.',
			responseSchema: NewsStoryAdminResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const {story_id, title, body, image_url, image_data} = ctx.req.valid('json');
			return ctx.json(
				await adminService.updateNewsStory(
					createNewsStoryID(story_id),
					title,
					body,
					image_url ?? null,
					image_data ?? null,
					adminUserId,
				),
			);
		},
	);

	app.post(
		'/admin/news/publish',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_MANAGE),
		Validator('json', NewsStoryIdRequest),
		OpenAPI({
			operationId: 'publish_news_story',
			summary: 'Publish a news story',
			description: 'Publishes a draft news story, making it visible on public surfaces. Requires NEWS_MANAGE permission.',
			responseSchema: NewsStoryAdminResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const {story_id} = ctx.req.valid('json');
			return ctx.json(await adminService.publishNewsStory(createNewsStoryID(story_id), adminUserId));
		},
	);

	app.post(
		'/admin/news/unpublish',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_MANAGE),
		Validator('json', NewsStoryIdRequest),
		OpenAPI({
			operationId: 'unpublish_news_story',
			summary: 'Unpublish a news story',
			description: 'Reverts a published news story back to draft. Requires NEWS_MANAGE permission.',
			responseSchema: NewsStoryAdminResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const {story_id} = ctx.req.valid('json');
			return ctx.json(await adminService.unpublishNewsStory(createNewsStoryID(story_id), adminUserId));
		},
	);

	app.post(
		'/admin/news/delete',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.NEWS_MANAGE),
		Validator('json', NewsStoryIdRequest),
		OpenAPI({
			operationId: 'delete_news_story',
			summary: 'Delete a news story',
			description: 'Permanently deletes a news story. Requires NEWS_MANAGE permission.',
			responseSchema: DeleteNewsStoryResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const adminService = ctx.get('adminService');
			const adminUserId = ctx.get('adminUserId');
			const {story_id} = ctx.req.valid('json');
			await adminService.deleteNewsStory(createNewsStoryID(story_id), adminUserId);
			return ctx.json({story_id: story_id.toString()});
		},
	);
}
