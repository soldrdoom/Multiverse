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

export async function fetchPublishedNewsStories(ctx: MarketingContext): Promise<ReadonlyArray<NewsStoryDisplay>> {
	try {
		const response = await sendMarketingRequest({
			url: `${ctx.apiEndpoint}/news`,
			method: 'GET',
			timeout: NEWS_FETCH_TIMEOUT_MS,
			serviceName: 'marketing_news',
		});
		const text = await readMarketingResponseAsText(response.stream);
		if (response.status < 200 || response.status >= 300) return [];

		const payload: unknown = JSON.parse(text);
		if (typeof payload !== 'object' || payload === null) return [];
		const storiesValue = (payload as Record<string, unknown>)['stories'];
		if (!Array.isArray(storiesValue)) return [];

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
		return [];
	}
}
