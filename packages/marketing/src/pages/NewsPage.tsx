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

import {HomeFooter} from '@fluxer/marketing/src/components/HomeFooter';
import {HomeHeader} from '@fluxer/marketing/src/components/HomeHeader';
import {NewsStoryCard} from '@fluxer/marketing/src/components/NewsStoryCard';
import {NewsStoryPopup} from '@fluxer/marketing/src/components/NewsStoryPopup';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {fetchPublishedNewsStories} from '@fluxer/marketing/src/news/NewsStories';
import {newsPopupScript} from '@fluxer/marketing/src/pages/home/NewsPopupScript';
import {siwsConnectScript} from '@fluxer/marketing/src/pages/home/SiwsConnectScript';
import {buildIconLinks} from '@fluxer/marketing/src/pages/layout/Icons';
import {
	articlePageMeta,
	buildMetaTags,
	pageMeta,
	withOgImage,
	withPublishedTime,
} from '@fluxer/marketing/src/pages/layout/Meta';
import {renderNotFoundPage} from '@fluxer/marketing/src/pages/NotFoundPage';
import {cacheBustedAsset, href} from '@fluxer/marketing/src/UrlUtils';
import type {Context} from 'hono';

const GOOGLE_FONTS_URL =
	'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Space+Grotesk:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=IBM+Plex+Mono:wght@400;500&display=swap';

/**
 * Serves both `/news` and `/news/:story_id`. The single-story route renders the same index page
 * with story-specific meta tags and the popup already open — that way a shared link lands on real,
 * crawlable content instead of a client-only state, and closing the panel leaves you on the index.
 */
export async function renderNewsPage(c: Context, ctx: MarketingContext, storyId?: string): Promise<Response> {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);
	const {stories, degraded} = await fetchPublishedNewsStories(ctx);
	const story = storyId === undefined ? null : (stories.find((entry) => entry.storyId === storyId) ?? null);

	// Only claim the story doesn't exist when we have a current list to say that from. While degraded
	// we can't tell "deleted" from "couldn't reach the API", and a 404 there would tell crawlers that
	// every shared permalink is permanently gone. Fall through to the index with a 503 instead.
	const storyUnavailable = storyId !== undefined && story === null && degraded;
	if (storyId !== undefined && story === null && !degraded) {
		return await renderNotFoundPage(c, ctx);
	}

	const indexMeta = pageMeta(
		`Multiverse | ${t('home.news_page.title')}`,
		t('home.news_page.meta_description'),
		'website',
	);
	const meta =
		story === null
			? indexMeta
			: (() => {
					const base = withPublishedTime(articlePageMeta(story.title, story.preview), story.publishedAt);
					return story.imageUrl === null ? base : withOgImage(base, story.imageUrl);
				})();
	const pageUrl = `${ctx.baseUrl}${href(ctx, story === null ? '/news' : `/news/${story.storyId}`)}`;

	const html = (
		<html lang={ctx.locale}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				{buildMetaTags(ctx, meta, pageUrl)}
				<title>{meta.title}</title>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
				<link rel="stylesheet" href={GOOGLE_FONTS_URL} />
				<link rel="stylesheet" href={cacheBustedAsset(ctx, '/static/app.css')} />
				{buildIconLinks(ctx.staticCdnEndpoint)}
				{newsPopupScript(ctx.apiEndpoint, href(ctx, '/news'), story === null ? null : story.storyId)}
				{siwsConnectScript(ctx.apiEndpoint, ctx.appEndpoint, `${ctx.staticCdnEndpoint}/images/multiverse-mark.png`)}
			</head>
			<body class="bg-[#08080a]">
				<div class="mv-home">
					<div class="mv-glow" />
					<div class="mv-grid-overlay" />
					<HomeHeader ctx={ctx} />
					<main class="mv-main">
						<div class="mv-page-head">
							<div class="mv-page-kicker">
								<span class="mv-net-kicker-dot" />
								<span class="mv-kicker-label">{t('home.news_page.kicker')}</span>
								<span class="mv-kicker-count">{`${String(stories.length).padStart(2, '0')} STORIES`}</span>
							</div>
							<h1 class="mv-page-title">{t('home.news_page.heading')}</h1>
							<p class="mv-page-subtitle">{t('home.news_page.subtitle')}</p>
						</div>

						{stories.length > 0 ? (
							<div class="mv-news-grid">
								{stories.map((entry) => (
									<NewsStoryCard ctx={ctx} story={entry} headingLevel="h2" />
								))}
							</div>
						) : (
							<p class="mv-news-empty">{t('home.news_page.empty')}</p>
						)}

						<a href={href(ctx, '/')} class="mv-back-link">
							{`← ${t('home.news_page.back_to_home')}`}
						</a>
					</main>
					<HomeFooter ctx={ctx} />
					<NewsStoryPopup stories={stories} />
				</div>
			</body>
		</html>
	);

	if (storyUnavailable) {
		return c.html(html, 503, {'Retry-After': '30'});
	}
	return c.html(html);
}
