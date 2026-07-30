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
import {readMarketingResponseAsText, sendMarketingRequest} from '@fluxer/marketing/src/MarketingHttpClient';

const NEWS_FETCH_TIMEOUT_MS = 5_000;

export type NewsVoteDirection = 'up' | 'down';

export interface NewsStoryDisplay {
	storyId: string;
	title: string;
	/** Full story text. Only the popup renders it (via `paragraphs`); cards render `preview`. */
	body: string;
	/**
	 * Short card blurb. Cards used to print the entire body, which is why long stories made the rail
	 * uneven and unreadable — the popup is the place to read the rest now, so the card gets a
	 * server-side excerpt and the full text ships exactly once per page.
	 */
	preview: string;
	/**
	 * `body` split into display paragraphs, so the popup renders server-escaped markup instead of
	 * assigning a string into the DOM client-side. When the admin News editor grows rich text, this
	 * is the seam that becomes sanitized HTML — the popup script never touches story text either way.
	 */
	paragraphs: ReadonlyArray<string>;
	imageUrl: string | null;
	dateLabel: string;
	publishedAt: string;
	upVotes: number;
	downVotes: number;
	/**
	 * Always `null` from SSR: the marketing server fetches `/news` without the visitor's token, so
	 * the API cannot know who is asking. The browser re-fetches with the token to hydrate this.
	 */
	myVote: NewsVoteDirection | null;
}

export function formatStoryDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}).toUpperCase();
}

export function splitStoryParagraphs(body: string): Array<string> {
	const paragraphs = body
		.split(/\r?\n\s*\r?\n/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
	return paragraphs.length > 0 ? paragraphs : [body.trim()].filter((paragraph) => paragraph.length > 0);
}

const PREVIEW_MAX_LENGTH = 220;

export function buildStoryPreview(body: string): string {
	const collapsed = body.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= PREVIEW_MAX_LENGTH) return collapsed;
	// Cut on a word boundary so the ellipsis never lands mid-word.
	const clipped = collapsed.slice(0, PREVIEW_MAX_LENGTH);
	const lastSpace = clipped.lastIndexOf(' ');
	return `${(lastSpace > PREVIEW_MAX_LENGTH * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function readVoteCount(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readMyVote(value: unknown): NewsVoteDirection | null {
	return value === 'up' || value === 'down' ? value : null;
}

// Story images come from the news API, which is editable by anyone with news-publish
// privilege, not end users — but we still never want the front page fetching an
// arbitrary-scheme URL (data:, javascript:, etc.) into an <img src>.
function sanitizeImageUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' ? value : null;
	} catch {
		return null;
	}
}

export interface NewsFetchResult {
	stories: ReadonlyArray<NewsStoryDisplay>;
	/**
	 * True when the API call failed and `stories` is stale or empty rather than current. Callers
	 * that would otherwise report "this story does not exist" must not do so while degraded — the
	 * story may exist perfectly well and simply not be in hand.
	 */
	degraded: boolean;
}

/**
 * Every marketing render fetches the story list over the public API, which means all of them share
 * one `ip:<container>` rate-limit bucket (NEWS_LIST, 60/min) — page views, not API clients, are what
 * consume it. Without this cache roughly a request per second to the front page starves every other
 * visitor's render, and since a missing story list makes /news/:story_id 404, the permalinks the
 * share button hands out would break under nothing more than ordinary traffic.
 *
 * So: one upstream call per TTL no matter the traffic, single-flighted so a cold cache under
 * concurrent renders doesn't stampede, and the last good response is retained as a fallback so a
 * brief API blip degrades to slightly stale news instead of an empty page.
 */
const NEWS_CACHE_TTL_MS = 30_000;
const NEWS_STALE_FALLBACK_MS = 10 * 60_000;

let cachedStories: ReadonlyArray<NewsStoryDisplay> | null = null;
let cachedAt = 0;
let inFlight: Promise<ReadonlyArray<NewsStoryDisplay> | null> | null = null;

export function resetNewsStoriesCacheForTests(): void {
	cachedStories = null;
	cachedAt = 0;
	inFlight = null;
}

export async function fetchPublishedNewsStories(ctx: MarketingContext): Promise<NewsFetchResult> {
	const now = Date.now();
	if (cachedStories !== null && now - cachedAt < NEWS_CACHE_TTL_MS) {
		return {stories: cachedStories, degraded: false};
	}

	inFlight ??= requestPublishedNewsStories(ctx).finally(() => {
		inFlight = null;
	});
	const fresh = await inFlight;

	if (fresh !== null) {
		cachedStories = fresh;
		cachedAt = Date.now();
		return {stories: fresh, degraded: false};
	}

	if (cachedStories !== null && Date.now() - cachedAt < NEWS_STALE_FALLBACK_MS) {
		return {stories: cachedStories, degraded: true};
	}
	return {stories: [], degraded: true};
}

/** Resolves to null when the story list could not be retrieved, distinct from "no stories". */
async function requestPublishedNewsStories(ctx: MarketingContext): Promise<ReadonlyArray<NewsStoryDisplay> | null> {
	try {
		const response = await sendMarketingRequest({
			url: `${ctx.apiEndpoint}/news`,
			method: 'GET',
			timeout: NEWS_FETCH_TIMEOUT_MS,
			serviceName: 'marketing_news',
		});
		const text = await readMarketingResponseAsText(response.stream);
		if (response.status < 200 || response.status >= 300) return null;

		const payload: unknown = JSON.parse(text);
		if (typeof payload !== 'object' || payload === null) return null;
		const storiesValue = (payload as Record<string, unknown>)['stories'];
		if (!Array.isArray(storiesValue)) return null;

		const stories: Array<NewsStoryDisplay> = [];
		for (const entry of storiesValue) {
			if (typeof entry !== 'object' || entry === null) continue;
			const record = entry as Record<string, unknown>;
			const storyId = typeof record['story_id'] === 'string' ? record['story_id'] : null;
			const title = typeof record['title'] === 'string' ? record['title'] : null;
			const body = typeof record['body'] === 'string' ? record['body'] : null;
			const publishedAt = typeof record['published_at'] === 'string' ? record['published_at'] : null;
			if (storyId === null || title === null || body === null || publishedAt === null) continue;
			stories.push({
				storyId,
				title,
				body,
				preview: buildStoryPreview(body),
				paragraphs: splitStoryParagraphs(body),
				imageUrl: sanitizeImageUrl(record['image_url']),
				dateLabel: formatStoryDate(publishedAt),
				publishedAt,
				upVotes: readVoteCount(record['up_votes']),
				downVotes: readVoteCount(record['down_votes']),
				myVote: readMyVote(record['my_vote']),
			});
		}
		return stories;
	} catch {
		return null;
	}
}
