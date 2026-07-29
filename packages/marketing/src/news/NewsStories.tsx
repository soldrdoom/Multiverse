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

export interface NewsStoryDisplay {
	storyId: string;
	title: string;
	blurb: string;
	imageUrl: string | null;
	dateLabel: string;
	publishedAt: string;
}

export function formatStoryDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}).toUpperCase();
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
				blurb: body,
				imageUrl: sanitizeImageUrl(record['image_url']),
				dateLabel: formatStoryDate(publishedAt),
				publishedAt,
			});
		}
		return stories;
	} catch {
		return [];
	}
}
