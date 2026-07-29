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
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import type {NewsStoryDisplay} from '@fluxer/marketing/src/news/NewsStories';
import {fetchPublishedNewsStories} from '@fluxer/marketing/src/news/NewsStories';
import {buildIconLinks} from '@fluxer/marketing/src/pages/layout/Icons';
import {buildMetaTags, pageMeta} from '@fluxer/marketing/src/pages/layout/Meta';
import {cacheBustedAsset, href} from '@fluxer/marketing/src/UrlUtils';
import type {Context} from 'hono';

const GOOGLE_FONTS_URL =
	'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Space+Grotesk:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=IBM+Plex+Mono:wght@400;500&display=swap';

function NewsStoryCard({story}: {story: NewsStoryDisplay}): JSX.Element {
	return (
		<article class="mv-story">
			<div class="mv-story-media">
				{story.imageUrl ? <img src={story.imageUrl} alt={story.title} class="mv-story-img" /> : null}
			</div>
			<div class="mv-story-body">
				<span class="mv-story-date">{story.dateLabel}</span>
				<h2 class="mv-story-title">{story.title}</h2>
				<p class="mv-story-blurb">{story.blurb}</p>
			</div>
		</article>
	);
}

export async function renderNewsPage(c: Context, ctx: MarketingContext): Promise<Response> {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);
	const meta = pageMeta(`Multiverse | ${t('home.news_page.title')}`, t('home.news_page.meta_description'), 'website');
	const pageUrl = `${ctx.baseUrl}${href(ctx, '/news')}`;
	const stories = await fetchPublishedNewsStories(ctx);

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
								{stories.map((story) => (
									<NewsStoryCard story={story} />
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
				</div>
			</body>
		</html>
	);

	return c.html(html);
}
