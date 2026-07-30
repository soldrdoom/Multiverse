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

import {ThumbIcon} from '@fluxer/marketing/src/components/icons/ThumbIcon';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import type {NewsStoryDisplay} from '@fluxer/marketing/src/news/NewsStories';
import {href} from '@fluxer/marketing/src/UrlUtils';

interface NewsStoryCardProps {
	ctx: MarketingContext;
	story: NewsStoryDisplay;
	/** The home rail sits under an h2 section heading, the /news grid under the h1 page title. */
	headingLevel: 'h2' | 'h3';
}

/**
 * Shared by the home rail and the /news grid so the vote meta row can never drift between them.
 *
 * The card is a real anchor to the story's own page: NewsPopupScript intercepts the click and opens
 * the popup instead, so with JS you never navigate, and without it (or on middle-click, or for a
 * crawler) the link still resolves to a server-rendered page with the same content.
 *
 * Note the outer element stays an <article>: HomePageScript's rail pager measures card pitch with
 * `rail.querySelector('article')`, so swapping the tag would silently break the carousel dots.
 */
export function NewsStoryCard({ctx, story, headingLevel}: NewsStoryCardProps): JSX.Element {
	const Heading = headingLevel;
	return (
		<article
			class="mv-story"
			data-story-id={story.storyId}
			data-up-votes={String(story.upVotes)}
			data-down-votes={String(story.downVotes)}
			data-my-vote={story.myVote ?? ''}
		>
			<a class="mv-story-link" href={href(ctx, `/news/${story.storyId}`)}>
				<div class="mv-story-media">
					{story.imageUrl ? <img src={story.imageUrl} alt={story.title} class="mv-story-img" /> : null}
				</div>
				<div class="mv-story-body">
					<span class="mv-story-date">{story.dateLabel}</span>
					<Heading class="mv-story-title">{story.title}</Heading>
					<p class="mv-story-blurb">{story.preview}</p>
					<div class="mv-story-meta">
						<span class="mv-story-votes" data-vote-direction="up">
							<ThumbIcon size={13} />
							<span class="mv-story-vote-count">{String(story.upVotes)}</span>
						</span>
						<span class="mv-story-votes" data-vote-direction="down">
							<ThumbIcon size={13} down={true} />
							<span class="mv-story-vote-count">{String(story.downVotes)}</span>
						</span>
						<span class="mv-story-read">READ →</span>
					</div>
				</div>
			</a>
		</article>
	);
}
