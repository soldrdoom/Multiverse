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

import {SnowflakeStringType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {URLType} from '@fluxer/schema/src/primitives/UrlValidators';
import {z} from 'zod';

export const NewsVoteDirectionType = z.enum(['up', 'down']);
export type NewsVoteDirectionType = z.infer<typeof NewsVoteDirectionType>;

export const NewsStoryResponse = z.object({
	story_id: SnowflakeStringType.describe('Unique identifier for this news story'),
	title: z.string().describe('Title of the news story'),
	body: z.string().describe('Body content of the news story'),
	image_url: URLType.nullable().describe('URL of the story image shown at the top of the news card, if any'),
	published_at: z.string().describe('When this story was published, ISO 8601'),
	up_votes: z.number().int().min(0).describe('Number of distinct wallets that voted this story up'),
	down_votes: z.number().int().min(0).describe('Number of distinct wallets that voted this story down'),
	my_vote: NewsVoteDirectionType.nullable().describe(
		"The requesting wallet's vote on this story, or null when the caller is unauthenticated, has no linked Solana wallet, or has not voted",
	),
});
export type NewsStoryResponse = z.infer<typeof NewsStoryResponse>;

export const ListPublishedNewsResponse = z.object({
	stories: z.array(NewsStoryResponse).max(50),
});
export type ListPublishedNewsResponse = z.infer<typeof ListPublishedNewsResponse>;

export const NewsStoryVoteRequest = z.object({
	direction: NewsVoteDirectionType.nullable().describe('The vote to cast, or null to clear the existing vote'),
});
export type NewsStoryVoteRequest = z.infer<typeof NewsStoryVoteRequest>;

export const NewsStoryVoteResponse = z.object({
	story_id: SnowflakeStringType.describe('Unique identifier for the news story that was voted on'),
	up_votes: z.number().int().min(0).describe('Number of distinct wallets that voted this story up'),
	down_votes: z.number().int().min(0).describe('Number of distinct wallets that voted this story down'),
	my_vote: NewsVoteDirectionType.nullable().describe("The requesting wallet's vote after applying this request"),
});
export type NewsStoryVoteResponse = z.infer<typeof NewsStoryVoteResponse>;
