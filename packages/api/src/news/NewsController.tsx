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

import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {ListPublishedNewsResponse} from '@fluxer/schema/src/domains/news/NewsSchemas';

export function NewsController(app: HonoApp) {
	app.get(
		'/news',
		RateLimitMiddleware(RateLimitConfigs.NEWS_LIST),
		OpenAPI({
			operationId: 'list_published_news',
			summary: 'List published news stories',
			description:
				'Returns published news stories for display on public surfaces such as the login page. No authentication required.',
			responseSchema: ListPublishedNewsResponse,
			statusCode: 200,
			security: [],
			tags: ['News'],
		}),
		async (ctx) => {
			ctx.header('Access-Control-Allow-Origin', '*');

			const newsService = ctx.get('newsService');
			const stories = await newsService.listPublished();
			return ctx.json({stories});
		},
	);
}
