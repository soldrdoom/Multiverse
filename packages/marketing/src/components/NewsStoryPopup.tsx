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

import {ShareNetworkIcon} from '@fluxer/marketing/src/components/icons/ShareNetworkIcon';
import {ThumbIcon} from '@fluxer/marketing/src/components/icons/ThumbIcon';
import type {NewsStoryDisplay} from '@fluxer/marketing/src/news/NewsStories';

interface NewsStoryPopupProps {
	stories: ReadonlyArray<NewsStoryDisplay>;
}

/**
 * The story side panel, rendered server-side in full: every published story's header and body is
 * already in the DOM (hidden), and "opening" or "switching" stories only toggles the `hidden`
 * attribute. Nothing here builds markup from story text at runtime, so no amount of admin-authored
 * content can turn into an injection — hono escapes it once, at render.
 *
 * The panel is inert without JS (it starts hidden and nothing reveals it); cards degrade to plain
 * links to /news/:story_id in that case.
 */
export function NewsStoryPopup({stories}: NewsStoryPopupProps): JSX.Element | null {
	if (stories.length === 0) return null;

	return (
		<div>
			<div class="mv-popup" id="mv-news-popup" hidden={true}>
				<div class="mv-popup-panel" role="dialog" aria-modal="true" aria-label="News story" tabindex={-1}>
					<button type="button" class="mv-popup-close" id="mv-popup-close" aria-label="Close story">
						✕
					</button>

					<div class="mv-popup-main">
						{stories.map((story) => (
							<article class="mv-popup-story" data-story-id={story.storyId} hidden={true}>
								<header class="mv-popup-header">
									<div class="mv-popup-thumb">
										{story.imageUrl ? <img src={story.imageUrl} alt="" class="mv-popup-thumb-img" /> : null}
									</div>
									<div class="mv-popup-heading">
										<span class="mv-popup-date">{story.dateLabel}</span>
										<h2 class="mv-popup-title">{story.title}</h2>
									</div>
								</header>
								<div class="mv-popup-body">
									<div class="mv-popup-text">
										{story.paragraphs.map((paragraph) => (
											<p>{paragraph}</p>
										))}
									</div>
								</div>
							</article>
						))}

						<div class="mv-popup-chips">
							{stories.map((story) => (
								<button type="button" class="mv-popup-chip" data-story-id={story.storyId}>
									{story.title}
								</button>
							))}
						</div>

						<footer class="mv-popup-footer">
							<button type="button" class="mv-vote-pill" id="mv-vote-up" data-vote-direction="up">
								<ThumbIcon size={16} />
								<span class="mv-vote-count" id="mv-vote-up-count">
									0
								</span>
							</button>
							<button type="button" class="mv-vote-pill" id="mv-vote-down" data-vote-direction="down">
								<ThumbIcon size={16} down={true} />
								<span class="mv-vote-count" id="mv-vote-down-count">
									0
								</span>
							</button>
							<span class="mv-vote-hint" id="mv-vote-hint">
								SIGN IN TO VOTE
							</span>
							<button type="button" class="mv-popup-share" id="mv-popup-share">
								<ShareNetworkIcon />
								<span>Share</span>
							</button>
						</footer>
					</div>

					<aside class="mv-popup-rail">
						<div class="mv-popup-rail-head">MORE STORIES</div>
						<div class="mv-popup-rail-list">
							{stories.map((story) => (
								<button type="button" class="mv-popup-rail-item" data-story-id={story.storyId}>
									<span class="mv-popup-rail-thumb">
										{story.imageUrl ? <img src={story.imageUrl} alt="" class="mv-popup-rail-img" /> : null}
									</span>
									<span class="mv-popup-rail-meta">
										<span class="mv-popup-rail-date">{story.dateLabel}</span>
										<span class="mv-popup-rail-title">{story.title}</span>
									</span>
								</button>
							))}
						</div>
					</aside>
				</div>
			</div>

			<div class="mv-toast" id="mv-toast" role="status" aria-live="polite" hidden={true} />
		</div>
	);
}
