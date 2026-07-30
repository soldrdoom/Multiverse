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

import {createTestAccount, setUserACLs, type TestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createOAuth2BotApplication} from '@fluxer/api/src/bot/tests/BotTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '@fluxer/api/src/test/TestRequestBuilder';
import type {NewsStoryAdminResponse} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';
import type {
	ListPublishedNewsResponse,
	NewsStoryResponse,
	NewsStoryVoteResponse,
} from '@fluxer/schema/src/domains/news/NewsSchemas';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

const WALLET_A = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const WALLET_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

async function createAdminWithACLs(harness: ApiTestHarness, acls: Array<string>): Promise<TestAccount> {
	const admin = await createTestAccount(harness);
	return setUserACLs(harness, admin, ['admin:authenticate', ...acls]);
}

async function linkWallet(harness: ApiTestHarness, account: TestAccount, address: string | null): Promise<void> {
	await createBuilderWithoutAuth(harness)
		.post(`/test/users/${account.userId}/set-solana-address`)
		.body({solana_address: address})
		.expect(HTTP_STATUS.OK)
		.execute();
}

async function createVoter(harness: ApiTestHarness, address: string | null): Promise<TestAccount> {
	const account = await createTestAccount(harness);
	if (address !== null) {
		await linkWallet(harness, account, address);
	}
	return account;
}

async function createPublishedStory(harness: ApiTestHarness, admin: TestAccount, title: string): Promise<string> {
	const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
		.post('/admin/news/create')
		.body({title, body: 'Body'})
		.expect(HTTP_STATUS.OK)
		.execute();

	await createBuilder(harness, `Bearer ${admin.token}`)
		.post('/admin/news/publish')
		.body({story_id: created.story_id})
		.expect(HTTP_STATUS.OK)
		.execute();

	return created.story_id;
}

async function createDraftStory(harness: ApiTestHarness, admin: TestAccount, title: string): Promise<string> {
	const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
		.post('/admin/news/create')
		.body({title, body: 'Body'})
		.expect(HTTP_STATUS.OK)
		.execute();
	return created.story_id;
}

function vote(
	harness: ApiTestHarness,
	account: TestAccount,
	storyId: string,
	direction: 'up' | 'down' | null,
): Promise<NewsStoryVoteResponse> {
	return createBuilder<NewsStoryVoteResponse>(harness, `Bearer ${account.token}`)
		.post(`/news/${storyId}/vote`)
		.body({direction})
		.expect(HTTP_STATUS.OK)
		.execute();
}

async function fetchStoryAnonymously(harness: ApiTestHarness, storyId: string): Promise<NewsStoryResponse> {
	const response = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
		.get('/news')
		.expect(HTTP_STATUS.OK)
		.execute();
	const story = response.stories.find((s) => s.story_id === storyId);
	expect(story).toBeDefined();
	return story as NewsStoryResponse;
}

async function fetchStoryAs(
	harness: ApiTestHarness,
	account: TestAccount,
	storyId: string,
): Promise<NewsStoryResponse> {
	const response = await createBuilder<ListPublishedNewsResponse>(harness, `Bearer ${account.token}`)
		.get('/news')
		.expect(HTTP_STATUS.OK)
		.execute();
	const story = response.stories.find((s) => s.story_id === storyId);
	expect(story).toBeDefined();
	return story as NewsStoryResponse;
}

describe('News story voting', () => {
	let harness: ApiTestHarness;
	let admin: TestAccount;

	beforeEach(async () => {
		harness = await createApiTestHarness();
		admin = await createAdminWithACLs(harness, ['news:manage', 'news:view']);
	});

	afterEach(async () => {
		await harness?.shutdown();
	});

	test('an unpublished story reports zero votes and a null my_vote to anonymous callers', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Fresh Story');

		const story = await fetchStoryAnonymously(harness, storyId);
		expect(story.up_votes).toBe(0);
		expect(story.down_votes).toBe(0);
		expect(story.my_vote).toBeNull();
	});

	test('anonymous callers see totals but never my_vote', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Voted Story');
		const voter = await createVoter(harness, WALLET_A);

		await vote(harness, voter, storyId, 'up');

		const story = await fetchStoryAnonymously(harness, storyId);
		expect(story.up_votes).toBe(1);
		expect(story.down_votes).toBe(0);
		expect(story.my_vote).toBeNull();
	});

	test('an authenticated voter sees their own my_vote on the public list', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Hydrated Story');
		const voter = await createVoter(harness, WALLET_A);

		await vote(harness, voter, storyId, 'down');

		const story = await fetchStoryAs(harness, voter, storyId);
		expect(story.up_votes).toBe(0);
		expect(story.down_votes).toBe(1);
		expect(story.my_vote).toBe('down');
	});

	test('an authenticated caller with no linked wallet always sees my_vote null', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Walletless Reader');
		const voter = await createVoter(harness, WALLET_A);
		const reader = await createVoter(harness, null);

		await vote(harness, voter, storyId, 'up');

		const story = await fetchStoryAs(harness, reader, storyId);
		expect(story.up_votes).toBe(1);
		expect(story.my_vote).toBeNull();
	});

	test('switching from up to down moves the vote rather than adding a second one', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Switcher');
		const voter = await createVoter(harness, WALLET_A);

		const up = await vote(harness, voter, storyId, 'up');
		expect(up).toEqual({story_id: storyId, up_votes: 1, down_votes: 0, my_vote: 'up'});

		const down = await vote(harness, voter, storyId, 'down');
		expect(down).toEqual({story_id: storyId, up_votes: 0, down_votes: 1, my_vote: 'down'});

		const story = await fetchStoryAnonymously(harness, storyId);
		expect(story.up_votes + story.down_votes).toBe(1);
	});

	test('re-sending the same direction is idempotent', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Idempotent');
		const voter = await createVoter(harness, WALLET_A);

		await vote(harness, voter, storyId, 'up');
		const second = await vote(harness, voter, storyId, 'up');

		expect(second).toEqual({story_id: storyId, up_votes: 1, down_votes: 0, my_vote: 'up'});
	});

	test('sending a null direction clears an existing vote', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Clearable');
		const voter = await createVoter(harness, WALLET_A);

		await vote(harness, voter, storyId, 'up');
		const cleared = await vote(harness, voter, storyId, null);
		expect(cleared).toEqual({story_id: storyId, up_votes: 0, down_votes: 0, my_vote: null});

		const story = await fetchStoryAs(harness, voter, storyId);
		expect(story.up_votes).toBe(0);
		expect(story.my_vote).toBeNull();
	});

	test('clearing a vote that was never cast succeeds and stays at zero', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Never Voted');
		const voter = await createVoter(harness, WALLET_A);

		const cleared = await vote(harness, voter, storyId, null);
		expect(cleared).toEqual({story_id: storyId, up_votes: 0, down_votes: 0, my_vote: null});
	});

	test('two different wallets both count', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Two Voters');
		const voterA = await createVoter(harness, WALLET_A);
		const voterB = await createVoter(harness, WALLET_B);

		await vote(harness, voterA, storyId, 'up');
		const second = await vote(harness, voterB, storyId, 'up');
		expect(second.up_votes).toBe(2);

		await vote(harness, voterB, storyId, 'down');

		const story = await fetchStoryAnonymously(harness, storyId);
		expect(story.up_votes).toBe(1);
		expect(story.down_votes).toBe(1);

		expect((await fetchStoryAs(harness, voterA, storyId)).my_vote).toBe('up');
		expect((await fetchStoryAs(harness, voterB, storyId)).my_vote).toBe('down');
	});

	test('a user without a linked Solana wallet cannot vote', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Wallet Required');
		const voter = await createVoter(harness, null);

		await createBuilder(harness, `Bearer ${voter.token}`)
			.post(`/news/${storyId}/vote`)
			.body({direction: 'up'})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	test('voting on a draft story 404s without leaking its existence', async () => {
		const storyId = await createDraftStory(harness, admin, 'Secret Draft');
		const voter = await createVoter(harness, WALLET_A);

		await createBuilder(harness, `Bearer ${voter.token}`)
			.post(`/news/${storyId}/vote`)
			.body({direction: 'up'})
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});

	test('voting on a nonexistent story 404s with the NOT_FOUND code', async () => {
		const voter = await createVoter(harness, WALLET_A);

		await createBuilder(harness, `Bearer ${voter.token}`)
			.post('/news/1234567890123456789/vote')
			.body({direction: 'up'})
			.expect(HTTP_STATUS.NOT_FOUND, 'NOT_FOUND')
			.execute();
	});

	test('the wallet-required 400 carries a human-readable error string', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Wallet Error Shape');
		const voter = await createVoter(harness, null);

		const body = await createBuilder<{error: string}>(harness, `Bearer ${voter.token}`)
			.post(`/news/${storyId}/vote`)
			.body({direction: 'up'})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();

		expect(body).toEqual({error: 'You must link a Solana wallet before voting'});
	});

	test('unpublishing a story hides its votes but keeps them for republication', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Round Trip');
		const voter = await createVoter(harness, WALLET_A);

		await vote(harness, voter, storyId, 'up');

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/unpublish')
			.body({story_id: storyId})
			.expect(HTTP_STATUS.OK)
			.execute();

		const hidden = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
			.get('/news')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(hidden.stories.map((s) => s.story_id)).not.toContain(storyId);

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/publish')
			.body({story_id: storyId})
			.expect(HTTP_STATUS.OK)
			.execute();

		const story = await fetchStoryAs(harness, voter, storyId);
		expect(story.up_votes).toBe(1);
		expect(story.my_vote).toBe('up');
	});

	test('voting requires authentication', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Auth Required');

		await createBuilderWithoutAuth(harness)
			.post(`/news/${storyId}/vote`)
			.body({direction: 'up'})
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});

	// The route's OpenAPI `security` array deliberately omits `botToken`; DefaultUserOnly is what
	// actually enforces that. Pin the runtime behaviour so the two can't silently drift apart.
	test('a bot token cannot vote', async () => {
		const storyId = await createPublishedStory(harness, admin, 'Humans Only');
		const owner = await createTestAccount(harness);
		const botApp = await createOAuth2BotApplication(harness, owner.token, `News Vote Bot ${Date.now()}`);

		await createBuilder(harness, `Bot ${botApp.botToken}`)
			.post(`/news/${storyId}/vote`)
			.body({direction: 'up'})
			.expect(HTTP_STATUS.FORBIDDEN, 'ACCESS_DENIED')
			.execute();

		const story = await fetchStoryAnonymously(harness, storyId);
		expect(story.up_votes).toBe(0);
	});

	test('the public list is marked uncacheable because it varies by caller', async () => {
		await createPublishedStory(harness, admin, 'No Shared Cache');

		const response = await harness.requestJson({path: '/news'});
		expect(response.status).toBe(HTTP_STATUS.OK);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toContain('Authorization');
	});

	test("a voter's own POST response reflects their vote immediately, ahead of any cached tally", async () => {
		const storyId = await createPublishedStory(harness, admin, 'Instant Feedback');
		const voter = await createVoter(harness, WALLET_A);

		// Warm the public tally cache at zero votes first.
		const before = await fetchStoryAnonymously(harness, storyId);
		expect(before.up_votes).toBe(0);

		const response = await vote(harness, voter, storyId, 'up');
		expect(response).toEqual({story_id: storyId, up_votes: 1, down_votes: 0, my_vote: 'up'});

		const after = await fetchStoryAnonymously(harness, storyId);
		expect(after.up_votes).toBe(1);
	});
});
