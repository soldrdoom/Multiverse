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

import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const sendMarketingRequest = vi.fn();
const readMarketingResponseAsText = vi.fn();

vi.mock('@fluxer/marketing/src/MarketingHttpClient', () => ({
	sendMarketingRequest: (...args: Array<unknown>) => sendMarketingRequest(...args),
	readMarketingResponseAsText: (...args: Array<unknown>) => readMarketingResponseAsText(...args),
}));

const {fetchPublishedNewsStories, resetNewsStoriesCacheForTests} = await import(
	'@fluxer/marketing/src/news/NewsStories'
);

const ctx = {apiEndpoint: 'https://multiverse.forum/api'} as MarketingContext;

function storyPayload(title: string): string {
	return JSON.stringify({
		stories: [
			{
				story_id: '1',
				title,
				body: 'Body text.',
				image_url: null,
				published_at: '2026-07-30T00:00:00.000Z',
				up_votes: 2,
				down_votes: 1,
			},
		],
	});
}

function respondOk(title = 'Story one'): void {
	sendMarketingRequest.mockResolvedValue({status: 200, stream: null});
	readMarketingResponseAsText.mockResolvedValue(storyPayload(title));
}

beforeEach(() => {
	resetNewsStoriesCacheForTests();
	sendMarketingRequest.mockReset();
	readMarketingResponseAsText.mockReset();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('fetchPublishedNewsStories caching', () => {
	it('makes one upstream call for many renders inside the TTL', async () => {
		respondOk();

		for (let index = 0; index < 25; index++) {
			const result = await fetchPublishedNewsStories(ctx);
			expect(result.degraded).toBe(false);
			expect(result.stories).toHaveLength(1);
		}

		// The whole point: page views must not map 1:1 onto NEWS_LIST rate-limit tokens.
		expect(sendMarketingRequest).toHaveBeenCalledTimes(1);
	});

	it('single-flights concurrent cold renders instead of stampeding', async () => {
		respondOk();

		const results = await Promise.all(Array.from({length: 10}, async () => fetchPublishedNewsStories(ctx)));

		expect(sendMarketingRequest).toHaveBeenCalledTimes(1);
		for (const result of results) expect(result.stories).toHaveLength(1);
	});

	it('refetches once the TTL lapses', async () => {
		respondOk('First');
		expect((await fetchPublishedNewsStories(ctx)).stories[0]?.title).toBe('First');

		vi.advanceTimersByTime(31_000);
		respondOk('Second');

		expect((await fetchPublishedNewsStories(ctx)).stories[0]?.title).toBe('Second');
		expect(sendMarketingRequest).toHaveBeenCalledTimes(2);
	});

	it('serves the last good response, flagged degraded, when the API fails', async () => {
		respondOk('Cached story');
		await fetchPublishedNewsStories(ctx);

		vi.advanceTimersByTime(31_000);
		sendMarketingRequest.mockRejectedValue(new Error('connection refused'));

		const result = await fetchPublishedNewsStories(ctx);

		expect(result.degraded).toBe(true);
		expect(result.stories[0]?.title).toBe('Cached story');
	});

	it('reports degraded with no stories when the very first call fails', async () => {
		sendMarketingRequest.mockRejectedValue(new Error('connection refused'));

		const result = await fetchPublishedNewsStories(ctx);

		expect(result).toEqual({stories: [], degraded: true});
	});

	it('treats a non-2xx response as a failure, not as an empty story list', async () => {
		respondOk('Good');
		await fetchPublishedNewsStories(ctx);

		vi.advanceTimersByTime(31_000);
		sendMarketingRequest.mockResolvedValue({status: 429, stream: null});
		readMarketingResponseAsText.mockResolvedValue('rate limited');

		const result = await fetchPublishedNewsStories(ctx);

		// A 429 here is exactly the shared-bucket exhaustion case. Falling back to the cached list
		// keeps the news rail populated and keeps /news/:story_id off the 404 path.
		expect(result.degraded).toBe(true);
		expect(result.stories[0]?.title).toBe('Good');
	});

	it('recovers to non-degraded once the API comes back', async () => {
		sendMarketingRequest.mockRejectedValue(new Error('down'));
		expect((await fetchPublishedNewsStories(ctx)).degraded).toBe(true);

		vi.advanceTimersByTime(31_000);
		respondOk('Back up');

		const result = await fetchPublishedNewsStories(ctx);
		expect(result.degraded).toBe(false);
		expect(result.stories[0]?.title).toBe('Back up');
	});
});
