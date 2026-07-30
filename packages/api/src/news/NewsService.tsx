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
import {
	type NewsStoryByStatusRow,
	NewsStoryStatuses,
	type NewsStoryVoteRow,
	type NewsVoteDirection,
	NewsVoteDirections,
} from '@fluxer/api/src/database/types/NewsTypes';
import type {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import type {ICacheService} from '@fluxer/cache/src/ICacheService';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {NotFoundError} from '@fluxer/errors/src/domains/core/NotFoundError';
import type {NewsStoryResponse, NewsStoryVoteResponse} from '@fluxer/schema/src/domains/news/NewsSchemas';
import {seconds} from 'itty-time';

const DEFAULT_PUBLISHED_LIMIT = 20;

/**
 * How long a story's up/down totals may lag reality on the public list.
 *
 * Short enough that the list feels live, long enough that a burst of anonymous `GET /news` traffic
 * collapses to one partition scan per story per window instead of one per request. `vote()` deletes
 * the entry it touches, so a voter never waits out this window to see their own vote counted.
 */
const VOTE_TALLY_TTL_SECONDS = seconds('15 seconds');

/**
 * Cached shape. Deliberately caller-independent: totals only, never `my_vote`. A cache entry is read
 * by every visitor of a story, so anything viewer-specific in here would be a cross-user leak.
 */
interface VoteCounts {
	up_votes: number;
	down_votes: number;
}

interface VoteTally extends VoteCounts {
	my_vote: NewsVoteDirection | null;
}

const EMPTY_COUNTS: VoteCounts = {up_votes: 0, down_votes: 0};

function voteCountsCacheKey(storyId: NewsStoryID): string {
	return `news_story_vote_tally:${storyId}`;
}

function isVoteCounts(value: unknown): value is VoteCounts {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<VoteCounts>;
	return typeof candidate.up_votes === 'number' && typeof candidate.down_votes === 'number';
}

function countVotes(rows: Array<NewsStoryVoteRow>): VoteCounts {
	let upVotes = 0;
	let downVotes = 0;

	for (const row of rows) {
		if (row.direction === NewsVoteDirections.UP) {
			upVotes += 1;
		} else if (row.direction === NewsVoteDirections.DOWN) {
			downVotes += 1;
		}
	}

	return {up_votes: upVotes, down_votes: downVotes};
}

function toPublicResponse(row: NewsStoryByStatusRow, votes: VoteTally): NewsStoryResponse {
	return {
		story_id: row.story_id.toString(),
		title: row.title,
		body: row.body,
		image_url: row.image_url ?? null,
		published_at: (row.published_at ?? row.created_at).toISOString(),
		up_votes: votes.up_votes,
		down_votes: votes.down_votes,
		my_vote: votes.my_vote,
	};
}

export class NewsService {
	/**
	 * The tally cache rides on the shared `cacheService` (Valkey-backed `KVCacheProvider`) rather
	 * than an in-process `Map`. Two reasons: `NewsService` is constructed per request in
	 * `ServiceMiddleware`, so instance state would never survive to be hit, and a shared cache means
	 * every process/worker gets the benefit and `vote()`'s invalidation is visible to all of them.
	 */
	constructor(
		private readonly newsRepository: INewsRepository,
		private readonly cacheService: ICacheService,
	) {}

	/**
	 * Public story list. `viewerAddress` is the caller's linked Solana wallet when the request
	 * carried a valid token and that account has one — otherwise null, and every `my_vote` is null.
	 *
	 * Totals come from the shared tally cache (see `VOTE_TALLY_TTL_SECONDS`); only a cache miss pays
	 * for a partition scan. This matters because a `defineTable` select is a real full-partition read
	 * on the SQLite backend that the official deployment runs — `executeQuerySqlite` calls `kv.scan`,
	 * which deserializes every row in the partition inside a *synchronous* transaction and applies
	 * the limit afterwards. There is nothing to overlap, so misses are filled serially rather than
	 * with a `Promise.all` that only pretends to be concurrent.
	 *
	 * `my_vote` is never derived from that scan and never cached: it is a separate exact-primary-key
	 * lookup, and it is skipped entirely for anonymous callers. So the DoS-exposed path (`GET /news`
	 * unauthenticated) issues zero vote reads at all once the cache is warm.
	 */
	async listPublished(
		viewerAddress: string | null = null,
		limit: number = DEFAULT_PUBLISHED_LIMIT,
	): Promise<Array<NewsStoryResponse>> {
		const rows = await this.newsRepository.listByStatus(NewsStoryStatuses.PUBLISHED, limit);
		if (rows.length === 0) {
			return [];
		}

		const counts = await this.readCounts(rows.map((row) => row.story_id));
		const myVotes = await this.readViewerVotes(
			rows.map((row) => row.story_id),
			viewerAddress,
		);

		return rows.map((row, index) =>
			toPublicResponse(row, {...(counts[index] ?? EMPTY_COUNTS), my_vote: myVotes[index] ?? null}),
		);
	}

	/** Cached totals for a batch of stories, filling (and caching) only the misses. */
	private async readCounts(storyIds: Array<NewsStoryID>): Promise<Array<VoteCounts>> {
		const keys = storyIds.map(voteCountsCacheKey);
		const cached = await this.cacheService.mget<unknown>(keys);
		const results: Array<VoteCounts> = [];
		const fills: Array<{key: string; value: VoteCounts; ttlSeconds: number}> = [];

		for (let index = 0; index < storyIds.length; index++) {
			const hit = cached[index];
			if (isVoteCounts(hit)) {
				results.push(hit);
				continue;
			}

			const storyId = storyIds[index];
			const key = keys[index];
			if (storyId === undefined || key === undefined) {
				results.push(EMPTY_COUNTS);
				continue;
			}

			const counts = countVotes(await this.newsRepository.listVotes(storyId));
			results.push(counts);
			fills.push({key, value: counts, ttlSeconds: VOTE_TALLY_TTL_SECONDS});
		}

		if (fills.length > 0) {
			await this.cacheService.mset(fills);
		}

		return results;
	}

	/**
	 * The viewer's own vote per story, or all nulls when there is no viewer wallet — an anonymous
	 * caller reaches the database zero times here.
	 *
	 * Each lookup binds the full primary key (`story_id` + `voter_address`), which is a genuine point
	 * read on Cassandra. Caveat for the SQLite backend: `partitionPrefixFromWhere` only ever builds a
	 * *partition*-key prefix, so `findVote` still walks the story's partition and filters afterwards.
	 * That keeps the unauthenticated endpoint clean (it never gets here) but means a signed-in list
	 * still costs one partition walk per story. Teaching `partitionPrefixFromWhere` to extend the
	 * prefix through clustering columns that have `eq` clauses would make this a true point read for
	 * every table at once; that is a shared-database-layer change and is deliberately not done here.
	 */
	private async readViewerVotes(
		storyIds: Array<NewsStoryID>,
		viewerAddress: string | null,
	): Promise<Array<NewsVoteDirection | null>> {
		if (viewerAddress === null) {
			return storyIds.map(() => null);
		}

		const votes = await Promise.all(
			storyIds.map(async (storyId) => await this.newsRepository.findVote(storyId, viewerAddress)),
		);
		return votes.map((vote) => vote?.direction ?? null);
	}

	/**
	 * Cast, switch, or clear the voting wallet's vote on a story. Idempotent: the wallet holds at
	 * most one row per story, so re-sending the same direction is a no-op overwrite and `null`
	 * removes the row entirely. Unpublished (and nonexistent) stories 404 identically so draft
	 * existence isn't leaked.
	 *
	 * The response is always exact, never served from the tally cache: the story's cached totals are
	 * dropped before the recount so a concurrent reader can't re-serve the pre-vote number, the
	 * recount is a fresh scan, and `my_vote` is simply the direction that was just written.
	 */
	async vote(
		storyId: NewsStoryID,
		voterAddress: string,
		direction: NewsVoteDirection | null,
	): Promise<NewsStoryVoteResponse> {
		const story = await this.newsRepository.findById(storyId);
		if (!story || story.status !== NewsStoryStatuses.PUBLISHED) {
			throw new NotFoundError({code: APIErrorCodes.NOT_FOUND});
		}

		if (direction === null) {
			await this.newsRepository.deleteVote(storyId, voterAddress);
		} else {
			const now = new Date();
			const existing = await this.newsRepository.findVote(storyId, voterAddress);
			await this.newsRepository.upsertVote({
				story_id: storyId,
				voter_address: voterAddress,
				direction,
				created_at: existing?.created_at ?? now,
				updated_at: now,
			});
		}

		const key = voteCountsCacheKey(storyId);
		await this.cacheService.delete(key);
		const counts = countVotes(await this.newsRepository.listVotes(storyId));
		await this.cacheService.set(key, counts, VOTE_TALLY_TTL_SECONDS);

		return {
			story_id: storyId.toString(),
			up_votes: counts.up_votes,
			down_votes: counts.down_votes,
			my_vote: direction,
		};
	}
}
