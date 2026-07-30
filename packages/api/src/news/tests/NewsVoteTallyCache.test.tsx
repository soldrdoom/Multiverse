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

import {createNewsStoryID, createUserID, type NewsStoryID} from '@fluxer/api/src/BrandedTypes';
import {
	type NewsStoryByStatusRow,
	type NewsStoryRow,
	type NewsStoryStatus,
	NewsStoryStatuses,
	type NewsStoryVoteRow,
	type NewsVoteDirection,
} from '@fluxer/api/src/database/types/NewsTypes';
import {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import {NewsService} from '@fluxer/api/src/news/NewsService';
import {MockKVProvider} from '@fluxer/api/src/test/mocks/MockKVProvider';
import {KVCacheProvider} from '@fluxer/cache/src/providers/KVCacheProvider';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

const WALLET_A = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const WALLET_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const STORY_ONE = createNewsStoryID(100000000000000001n);
const STORY_TWO = createNewsStoryID(100000000000000002n);

const AUTHOR = createUserID(900000000000000001n);

function storyRow(storyId: NewsStoryID, title: string): NewsStoryRow {
	const createdAt = new Date('2026-01-01T00:00:00.000Z');
	return {
		story_id: storyId,
		title,
		body: 'Body',
		image_url: null,
		status: NewsStoryStatuses.PUBLISHED,
		created_by_user_id: AUTHOR,
		created_at: createdAt,
		updated_at: createdAt,
		published_at: createdAt,
	};
}

function toByStatusRow(row: NewsStoryRow): NewsStoryByStatusRow {
	return {
		status: row.status,
		created_at: row.created_at,
		story_id: row.story_id,
		title: row.title,
		body: row.body,
		image_url: row.image_url,
		created_by_user_id: row.created_by_user_id,
		updated_at: row.updated_at,
		published_at: row.published_at,
	};
}

/**
 * In-memory stand-in for NewsRepository that counts the calls the tally cache is supposed to be
 * eliminating. `listVotesCalls` is the partition scan (expensive on the SQLite backend);
 * `findVoteCalls` is the exact primary-key read used for `my_vote`.
 */
class CountingNewsRepository extends INewsRepository {
	listVotesCalls = 0;
	findVoteCalls = 0;

	private readonly stories = new Map<string, NewsStoryRow>();
	private readonly votes = new Map<string, Map<string, NewsStoryVoteRow>>();

	addStory(row: NewsStoryRow): void {
		this.stories.set(row.story_id.toString(), row);
	}

	resetCounters(): void {
		this.listVotesCalls = 0;
		this.findVoteCalls = 0;
	}

	private partition(storyId: NewsStoryID): Map<string, NewsStoryVoteRow> {
		const key = storyId.toString();
		let partition = this.votes.get(key);
		if (!partition) {
			partition = new Map();
			this.votes.set(key, partition);
		}
		return partition;
	}

	async findById(storyId: NewsStoryID): Promise<NewsStoryRow | null> {
		return this.stories.get(storyId.toString()) ?? null;
	}

	async listByStatus(status: NewsStoryStatus, limit: number): Promise<Array<NewsStoryByStatusRow>> {
		return [...this.stories.values()]
			.filter((row) => row.status === status)
			.map(toByStatusRow)
			.slice(0, limit);
	}

	async create(row: NewsStoryRow): Promise<void> {
		this.addStory(row);
	}

	async update(row: NewsStoryRow): Promise<void> {
		this.addStory(row);
	}

	async setStatus(_oldStatus: NewsStoryStatus, _oldCreatedAt: Date, updatedRow: NewsStoryRow): Promise<void> {
		this.addStory(updatedRow);
	}

	async delete(storyId: NewsStoryID, _status: NewsStoryStatus, _createdAt: Date): Promise<void> {
		this.stories.delete(storyId.toString());
	}

	async listVotes(storyId: NewsStoryID): Promise<Array<NewsStoryVoteRow>> {
		this.listVotesCalls += 1;
		return [...this.partition(storyId).values()];
	}

	async findVote(storyId: NewsStoryID, voterAddress: string): Promise<NewsStoryVoteRow | null> {
		this.findVoteCalls += 1;
		return this.partition(storyId).get(voterAddress) ?? null;
	}

	async upsertVote(row: NewsStoryVoteRow): Promise<void> {
		this.partition(row.story_id).set(row.voter_address, row);
	}

	async deleteVote(storyId: NewsStoryID, voterAddress: string): Promise<void> {
		this.partition(storyId).delete(voterAddress);
	}
}

async function seedVote(
	repository: CountingNewsRepository,
	storyId: NewsStoryID,
	voterAddress: string,
	direction: NewsVoteDirection,
): Promise<void> {
	const now = new Date('2026-01-02T00:00:00.000Z');
	await repository.upsertVote({
		story_id: storyId,
		voter_address: voterAddress,
		direction,
		created_at: now,
		updated_at: now,
	});
	repository.resetCounters();
}

describe('News vote tally cache', () => {
	let repository: CountingNewsRepository;
	let kvProvider: MockKVProvider;
	let service: NewsService;
	let realDateNow: () => number;

	beforeEach(() => {
		realDateNow = Date.now;
		repository = new CountingNewsRepository();
		repository.addStory(storyRow(STORY_ONE, 'First'));
		repository.addStory(storyRow(STORY_TWO, 'Second'));
		kvProvider = new MockKVProvider();
		service = new NewsService(repository, new KVCacheProvider({client: kvProvider}));
	});

	afterEach(() => {
		Date.now = realDateNow;
	});

	test('the first anonymous list scans each story once and later lists scan nothing', async () => {
		await service.listPublished(null);
		expect(repository.listVotesCalls).toBe(2);

		repository.resetCounters();

		await service.listPublished(null);
		await service.listPublished(null);
		await service.listPublished(null);

		expect(repository.listVotesCalls).toBe(0);
		expect(repository.findVoteCalls).toBe(0);
	});

	test('anonymous callers get my_vote null and issue no per-viewer reads', async () => {
		await seedVote(repository, STORY_ONE, WALLET_A, 'up');

		const stories = await service.listPublished(null);

		expect(stories.map((story) => story.my_vote)).toEqual([null, null]);
		expect(repository.findVoteCalls).toBe(0);
	});

	test('my_vote comes from point reads, not the cached tally, and stays correct per wallet', async () => {
		await seedVote(repository, STORY_ONE, WALLET_A, 'up');
		await seedVote(repository, STORY_ONE, WALLET_B, 'down');

		const asA = await service.listPublished(WALLET_A);
		const scansAfterFirst = repository.listVotesCalls;
		const asB = await service.listPublished(WALLET_B);

		const storyOneAsA = asA.find((story) => story.story_id === STORY_ONE.toString());
		const storyOneAsB = asB.find((story) => story.story_id === STORY_ONE.toString());

		expect(storyOneAsA?.my_vote).toBe('up');
		expect(storyOneAsB?.my_vote).toBe('down');
		expect(storyOneAsA?.up_votes).toBe(1);
		expect(storyOneAsA?.down_votes).toBe(1);

		// The second viewer reused the cached totals: no additional partition scans, only point reads.
		expect(repository.listVotesCalls).toBe(scansAfterFirst);
		expect(repository.findVoteCalls).toBe(4);
	});

	test('the cached entry holds totals only, never my_vote', async () => {
		await seedVote(repository, STORY_ONE, WALLET_A, 'up');
		await service.listPublished(WALLET_A);

		const raw = await kvProvider.get(`news_story_vote_tally:${STORY_ONE.toString()}`);
		expect(raw).not.toBeNull();
		expect(JSON.parse(raw as string)).toEqual({up_votes: 1, down_votes: 0});
	});

	test("a voter's own response is exact even though the cache was already warm", async () => {
		await service.listPublished(null);

		const response = await service.vote(STORY_ONE, WALLET_A, 'up');
		expect(response).toEqual({
			story_id: STORY_ONE.toString(),
			up_votes: 1,
			down_votes: 0,
			my_vote: 'up',
		});
	});

	test('voting invalidates the cached tally so the very next list is fresh', async () => {
		await service.listPublished(null);
		await service.vote(STORY_ONE, WALLET_A, 'up');
		repository.resetCounters();

		const stories = await service.listPublished(null);
		const storyOne = stories.find((story) => story.story_id === STORY_ONE.toString());
		const storyTwo = stories.find((story) => story.story_id === STORY_TWO.toString());

		expect(storyOne?.up_votes).toBe(1);
		expect(storyTwo?.up_votes).toBe(0);
		// vote() rewrote the entry it invalidated, so the read side still scans nothing.
		expect(repository.listVotesCalls).toBe(0);
	});

	test('clearing a vote is reflected immediately in both the response and the next list', async () => {
		await service.vote(STORY_ONE, WALLET_A, 'up');

		const cleared = await service.vote(STORY_ONE, WALLET_A, null);
		expect(cleared).toEqual({
			story_id: STORY_ONE.toString(),
			up_votes: 0,
			down_votes: 0,
			my_vote: null,
		});

		const stories = await service.listPublished(WALLET_A);
		const storyOne = stories.find((story) => story.story_id === STORY_ONE.toString());
		expect(storyOne?.up_votes).toBe(0);
		expect(storyOne?.my_vote).toBeNull();
	});

	test('a story rescans once the tally TTL lapses', async () => {
		await service.listPublished(null);
		repository.resetCounters();

		const base = realDateNow();
		Date.now = () => base + 16_000;

		await service.listPublished(null);
		expect(repository.listVotesCalls).toBe(2);
	});
});
