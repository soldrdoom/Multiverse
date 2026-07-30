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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {NewsStoryCard} from '@fluxer/marketing/src/components/NewsStoryCard';
import {NewsStoryPopup} from '@fluxer/marketing/src/components/NewsStoryPopup';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import type {NewsStoryDisplay} from '@fluxer/marketing/src/news/NewsStories';
import {describe, expect, it} from 'vitest';

const ctx = {basePath: ''} as MarketingContext;

function makeStory(overrides: Partial<NewsStoryDisplay> = {}): NewsStoryDisplay {
	return {
		storyId: '1234567890',
		title: 'Multiverse ships voting',
		body: 'First paragraph.\n\nSecond paragraph.',
		preview: 'First paragraph. Second paragraph.',
		paragraphs: ['First paragraph.', 'Second paragraph.'],
		imageUrl: 'https://cdn.example.com/story.webp',
		dateLabel: 'JUL 30, 2026',
		publishedAt: '2026-07-30T00:00:00.000Z',
		upVotes: 24,
		downVotes: 3,
		myVote: null,
		...overrides,
	};
}

describe('NewsStoryCard', () => {
	it('links to the story permalink and exposes vote state as data attributes', () => {
		const html = String(<NewsStoryCard ctx={ctx} story={makeStory()} headingLevel="h3" />);

		expect(html).toContain('href="/news/1234567890"');
		expect(html).toContain('data-story-id="1234567890"');
		expect(html).toContain('data-up-votes="24"');
		expect(html).toContain('data-down-votes="3"');
		expect(html).toContain('data-my-vote=""');
		// The rail pager measures `rail.querySelector('article')`, so the outer tag must stay an article.
		expect(html.startsWith('<article')).toBe(true);
	});

	it('renders the excerpt rather than the full body', () => {
		const html = String(
			<NewsStoryCard
				ctx={ctx}
				story={makeStory({body: 'FULL BODY TEXT', preview: 'SHORT PREVIEW'})}
				headingLevel="h3"
			/>,
		);

		expect(html).toContain('SHORT PREVIEW');
		expect(html).not.toContain('FULL BODY TEXT');
	});

	it('marks the caller-owned vote direction active', () => {
		const html = String(<NewsStoryCard ctx={ctx} story={makeStory({myVote: 'up'})} headingLevel="h3" />);

		expect(html).toContain('data-my-vote="up"');
	});
});

describe('NewsStoryPopup', () => {
	it('renders nothing when there are no published stories', () => {
		expect(NewsStoryPopup({stories: []})).toBeNull();
	});

	it('server-renders every story body, hidden, with one rail entry each', () => {
		const stories = [
			makeStory({storyId: '1', title: 'One'}),
			makeStory({storyId: '2', title: 'Two', paragraphs: ['Only para.']}),
		];
		const html = String(<NewsStoryPopup stories={stories} />);

		expect(html).toContain('<p>First paragraph.</p>');
		expect(html).toContain('<p>Only para.</p>');
		expect(html.match(/class="mv-popup-story"/g)).toHaveLength(2);
		expect(html.match(/class="mv-popup-rail-item"/g)).toHaveLength(2);
		expect(html.match(/class="mv-popup-chip"/g)).toHaveLength(2);
		// The panel and every story start hidden; without JS nothing reveals them.
		expect(html).toContain('class="mv-popup" id="mv-news-popup" hidden');
	});

	it('escapes story text, so admin-authored content cannot inject markup', () => {
		const html = String(
			<NewsStoryPopup
				stories={[
					makeStory({
						title: '</script><img src=x onerror=alert(1)>',
						paragraphs: ['<b>bold</b> & "quoted"'],
					}),
				]}
			/>,
		);

		expect(html).not.toContain('<img src=x');
		expect(html).not.toContain('<b>bold</b>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
	});

	it('omits the thumbnail image when a story has no cover, leaving the gradient fallback', () => {
		const html = String(<NewsStoryPopup stories={[makeStory({imageUrl: null})]} />);

		expect(html).toContain('class="mv-popup-thumb"');
		expect(html).not.toContain('mv-popup-thumb-img');
	});
});
