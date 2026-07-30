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
import {DefaultUserOnly, LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import type {User} from '@fluxer/api/src/models/User';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {NewsStoryIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	ListPublishedNewsResponse,
	NewsStoryVoteRequest,
	NewsStoryVoteResponse,
} from '@fluxer/schema/src/domains/news/NewsSchemas';

export function NewsController(app: HonoApp) {
	app.get(
		'/news',
		RateLimitMiddleware(RateLimitConfigs.NEWS_LIST),
		OpenAPI({
			operationId: 'list_published_news',
			summary: 'List published news stories',
			description:
				'Returns published news stories for display on public surfaces such as the login page. No authentication required. ' +
				'Vote totals are always present; `my_vote` is only non-null when the request carries a valid token for an account with a linked Solana wallet.',
			responseSchema: ListPublishedNewsResponse,
			statusCode: 200,
			security: [],
			tags: ['News'],
		}),
		async (ctx) => {
			ctx.header('Access-Control-Allow-Origin', '*');
			// The response body varies by caller (`my_vote`), so it must never land in a shared cache.
			// Nothing sits in front of this today, but `Access-Control-Allow-Origin: *` makes it look
			// like a public static document to any edge cache added later — these headers stop a
			// signed-in visitor's `my_vote` from being replayed to everyone else.
			ctx.header('Cache-Control', 'private, no-store');
			// Appended, not set: the global CORS middleware may already have written `Vary: Origin`.
			ctx.header('Vary', 'Authorization', {append: true});

			const newsService = ctx.get('newsService');
			// UserMiddleware populates `user` opportunistically, so this route stays public but can
			// still hydrate `my_vote` when the caller happens to be signed in.
			const user: User | undefined = ctx.get('user');
			const stories = await newsService.listPublished(user?.solanaAddress ?? null);
			return ctx.json({stories});
		},
	);

	// No per-route CORS header here, unlike GET /news: the global CORS middleware
	// (app/MiddlewarePipeline.tsx, `applyMiddlewareStack({cors: {origins: corsOrigins}})`) already
	// covers credentialed cross-origin calls, and marketing is same-origin with the API anyway.
	app.post(
		'/news/:story_id/vote',
		RateLimitMiddleware(RateLimitConfigs.NEWS_VOTE),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', NewsStoryIdParam),
		Validator('json', NewsStoryVoteRequest),
		OpenAPI({
			operationId: 'vote_news_story',
			summary: 'Vote on a news story',
			description:
				"Casts, switches, or clears the caller's vote on a published news story. The voter's identity is their linked Solana wallet address, " +
				'so one wallet holds at most one vote per story and re-sending the same direction is a no-op. Send `direction: null` to clear an existing vote. ' +
				"Returns the story's updated public totals. Unpublished and nonexistent stories both return 404.",
			responseSchema: NewsStoryVoteResponse,
			statusCode: 200,
			// No botToken: DefaultUserOnly rejects bot tokens at runtime, so advertising it would be a lie.
			security: ['bearerToken', 'sessionToken'],
			tags: ['News'],
		}),
		async (ctx) => {
			const user = ctx.get('user');
			if (!user.solanaAddress) {
				return ctx.json({error: 'You must link a Solana wallet before voting'}, 400);
			}

			const {story_id} = ctx.req.valid('param');
			const {direction} = ctx.req.valid('json');
			const newsService = ctx.get('newsService');
			return ctx.json(await newsService.vote(createNewsStoryID(story_id), user.solanaAddress, direction));
		},
	);
}
