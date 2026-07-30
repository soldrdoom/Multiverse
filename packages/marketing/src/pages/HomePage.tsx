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
import type {NewsStoryDisplay} from '@fluxer/marketing/src/news/NewsStories';
import {fetchPublishedNewsStories} from '@fluxer/marketing/src/news/NewsStories';
import {homePageScript} from '@fluxer/marketing/src/pages/home/HomePageScript';
import {newsPopupScript} from '@fluxer/marketing/src/pages/home/NewsPopupScript';
import {siwsConnectScript} from '@fluxer/marketing/src/pages/home/SiwsConnectScript';
import {buildIconLinks} from '@fluxer/marketing/src/pages/layout/Icons';
import {buildMetaTags, defaultPageMeta} from '@fluxer/marketing/src/pages/layout/Meta';
import type {SolanaStatsPayload} from '@fluxer/marketing/src/solana/SolanaLiveStats';
import {getSolanaStats} from '@fluxer/marketing/src/solana/SolanaLiveStats';
import {cacheBustedAsset, href} from '@fluxer/marketing/src/UrlUtils';
import type {Context} from 'hono';

const GOOGLE_FONTS_URL =
	'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Space+Grotesk:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=IBM+Plex+Mono:wght@400;500&display=swap';

const STORIES_PER_PAGE_DESKTOP = 3;
const CHART_W = 620;
const CHART_H = 150;
const CHART_PAD = 10;

// Mockup demo state, used as the server-rendered fallback when live upstream data
// is unavailable at render time. The client replaces it on the first 3s poll.
const FALLBACK_MARKET = {
	price: 168.42,
	change24: 2.34,
	cap: 8.1e10,
	vol: 3.2e9,
	ath: 294.33,
	low24: 161.2,
	high24: 174.8,
};

const FALLBACK_SERIES: ReadonlyArray<number> = [
	162.1, 163.4, 161.9, 164.8, 166.2, 165.1, 167.9, 169.4, 168.2, 170.6, 172.1, 171.3, 169.8, 168.4, 170.2, 172.9, 174.1,
	173.2, 171.6, 170.1, 168.9, 167.4, 168.8, 168.42,
];

const FALLBACK_BAR_HEIGHTS: ReadonlyArray<number> = [
	52, 64, 47, 71, 58, 83, 66, 54, 78, 61, 88, 73, 95, 69, 80, 57, 76, 91, 64, 85, 72, 98, 79, 88,
];

const FALLBACK_TPS = 3947;
const FALLBACK_BARS_LABEL = 'PEAK 4,812 TPS · AVG 3,940';
const FALLBACK_EPOCH = 842;
const FALLBACK_EPOCH_PCT = 68;
const FALLBACK_EPOCH_ETA_SECONDS = 2 * 86400 + 4 * 3600;

const BAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
	['#9945ff', 'rgba(153,69,255,.25)'],
	['#9945ff', 'rgba(153,69,255,.25)'],
	['#9945ff', 'rgba(153,69,255,.25)'],
	['#a05cff', 'rgba(153,69,255,.25)'],
	['#a05cff', 'rgba(153,69,255,.25)'],
	['#8f7dff', 'rgba(153,69,255,.25)'],
	['#8f7dff', 'rgba(153,69,255,.25)'],
	['#7d94ff', 'rgba(125,148,255,.25)'],
	['#7d94ff', 'rgba(125,148,255,.25)'],
	['#6aabff', 'rgba(106,171,255,.25)'],
	['#6aabff', 'rgba(106,171,255,.25)'],
	['#58c2ff', 'rgba(88,194,255,.25)'],
	['#58c2ff', 'rgba(88,194,255,.25)'],
	['#45d3f2', 'rgba(69,211,242,.25)'],
	['#45d3f2', 'rgba(69,211,242,.25)'],
	['#33e0d8', 'rgba(51,224,216,.25)'],
	['#33e0d8', 'rgba(51,224,216,.25)'],
	['#22e9bd', 'rgba(34,233,189,.25)'],
	['#22e9bd', 'rgba(34,233,189,.25)'],
	['#14f195', 'rgba(20,241,149,.25)'],
	['#14f195', 'rgba(20,241,149,.25)'],
	['#14f195', 'rgba(20,241,149,.25)'],
	['#14f195', 'rgba(20,241,149,.25)'],
	['#14f195', 'rgba(20,241,149,.25)'],
];

interface NetworkDisplay {
	live: boolean;
	price: string;
	changeText: string;
	changeUp: boolean;
	chartLine: string;
	chartArea: string;
	dotX: string;
	dotY: string;
	chartHigh: string;
	chartLow: string;
	mktCap: string;
	mktVol: string;
	dayRange: string;
	ath: string;
	tps: string;
	barHeights: ReadonlyArray<number>;
	barsLabel: string;
	epochLabel: string;
	epochPct: string;
	epochBarWidth: number;
}

function formatMoney(value: number, digits: number): string {
	return `$${value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits})}`;
}

function formatBig(value: number): string {
	return value >= 1e9 ? `$${(value / 1e9).toFixed(2)}B` : `$${(value / 1e6).toFixed(1)}M`;
}

function formatEta(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function buildChartGeometry(series: ReadonlyArray<number>): {
	line: string;
	area: string;
	dotX: string;
	dotY: string;
	high: number;
	low: number;
} {
	const points = series.length > 3 ? series : FALLBACK_SERIES;
	const min = Math.min(...points);
	const max = Math.max(...points);
	const span = max - min || 1;
	let line = '';
	let lastX = 0;
	let lastY = 0;
	for (let index = 0; index < points.length; index += 1) {
		const value = points[index] ?? min;
		const x = (index / (points.length - 1)) * CHART_W;
		const y = CHART_PAD + (1 - (value - min) / span) * (CHART_H - CHART_PAD * 2);
		line += `${index === 0 ? 'M' : ' L'}${x.toFixed(1)} ${y.toFixed(1)}`;
		lastX = x;
		lastY = y;
	}
	return {
		line,
		area: `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`,
		dotX: lastX.toFixed(1),
		dotY: lastY.toFixed(1),
		high: max,
		low: min,
	};
}

function buildNetworkDisplay(stats: SolanaStatsPayload): NetworkDisplay {
	const market = stats.market ?? FALLBACK_MARKET;
	const series = stats.series.length > 3 ? stats.series : FALLBACK_SERIES;
	const chart = buildChartGeometry(series);
	const changeUp = market.change24 >= 0;

	const barHeights = [...FALLBACK_BAR_HEIGHTS];
	let barsLabel = FALLBACK_BARS_LABEL;
	if (stats.tpsSamples.length > 0) {
		const max = Math.max(...stats.tpsSamples);
		const start = barHeights.length - stats.tpsSamples.length;
		for (let index = 0; index < stats.tpsSamples.length; index += 1) {
			const sample = stats.tpsSamples[index] ?? 0;
			const target = start + index;
			if (target >= 0 && target < barHeights.length) {
				barHeights[target] = max > 0 ? Math.max(8, Math.round((sample / max) * 98)) : 8;
			}
		}
		const sum = stats.tpsSamples.reduce((total, sample) => total + sample, 0);
		barsLabel = `PEAK ${Math.round(max).toLocaleString('en-US')} TPS · AVG ${Math.round(
			sum / stats.tpsSamples.length,
		).toLocaleString('en-US')}`;
	}

	const epoch = stats.epoch ?? FALLBACK_EPOCH;
	const epochPct = stats.epochPct ?? FALLBACK_EPOCH_PCT;
	const epochEtaSeconds = stats.epochEtaSeconds ?? FALLBACK_EPOCH_ETA_SECONDS;

	return {
		live: stats.live,
		price: formatMoney(market.price, 2),
		changeText: `${changeUp ? '▲ +' : '▼ '}${market.change24.toFixed(2)}%`,
		changeUp,
		chartLine: chart.line,
		chartArea: chart.area,
		dotX: chart.dotX,
		dotY: chart.dotY,
		chartHigh: formatMoney(chart.high, 2),
		chartLow: formatMoney(chart.low, 2),
		mktCap: formatBig(market.cap),
		mktVol: formatBig(market.vol),
		dayRange: `${formatMoney(market.low24, 2)} – ${formatMoney(market.high24, 2)}`,
		ath: formatMoney(market.ath, 2),
		tps: Math.round(stats.tps ?? FALLBACK_TPS).toLocaleString('en-US'),
		barHeights,
		barsLabel,
		epochLabel: `EPOCH ${epoch}`,
		epochPct: `${Math.round(epochPct)}% · ${formatEta(epochEtaSeconds)} left`,
		epochBarWidth: Math.min(100, Math.max(0, epochPct)),
	};
}

interface SectionProps {
	ctx: MarketingContext;
}

function HomeHero({ctx}: SectionProps): JSX.Element {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);

	return (
		<section class="mv-hero">
			<div>
				<h1 class="mv-hero-title">
					{t('home.hero.headline_prefix')} <span class="mv-gradient-text">{t('home.hero.headline_highlight')}</span>
				</h1>
				<p class="mv-hero-sub">{t('home.hero.subtitle')}</p>
				<div class="mv-features">
					<div class="mv-feature">
						<span class="mv-feature-marker is-square" />
						<div>
							<div class="mv-feature-title">{t('home.hero.feature_keys.title')}</div>
							<div class="mv-feature-desc">{t('home.hero.feature_keys.description')}</div>
						</div>
					</div>
					<div class="mv-feature">
						<span class="mv-feature-marker is-round" />
						<div>
							<div class="mv-feature-title">{t('home.hero.feature_voice.title')}</div>
							<div class="mv-feature-desc">{t('home.hero.feature_voice.description')}</div>
						</div>
					</div>
					<div class="mv-feature">
						<span class="mv-feature-marker is-diamond" />
						<div>
							<div class="mv-feature-title">{t('home.hero.feature_passwordless.title')}</div>
							<div class="mv-feature-desc">{t('home.hero.feature_passwordless.description')}</div>
						</div>
					</div>
				</div>
			</div>

			<div class="mv-card-float">
				<div class="mv-card-aura" />
				<div class="mv-card-ring">
					<div class="mv-card-panel">
						<div class="mv-card-scanlines" />
						<div class="mv-card-topglow" />
						<div class="mv-card-content">
							<h2 class="mv-welcome">{t('home.hero.welcome_back')}</h2>
							<button
								type="button"
								id="mv-wallet-connect-hero"
								class="mv-signin mv-wallet-trigger"
								data-default-label={t('home.hero.sign_in_with_solana')}
							>
								<span class="mv-signin-inner mv-wallet-trigger-label">{t('home.hero.sign_in_with_solana')}</span>
							</button>
							<div class="mv-card-links">
								<span>
									{t('home.hero.new_here')}{' '}
									<a href={`${ctx.appEndpoint}/register`} class="mv-create-link">
										{t('home.hero.create_identity')}
									</a>
								</span>
								<span class="mv-card-links-divider" />
								<a href={`${ctx.appEndpoint}/forgot`} class="mv-recover-link">
									{t('home.hero.recover')}
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

interface HomeNewsSectionProps {
	ctx: MarketingContext;
	stories: ReadonlyArray<NewsStoryDisplay>;
}

function HomeNewsSection({ctx, stories}: HomeNewsSectionProps): JSX.Element {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);
	const pageCount = Math.max(1, Math.ceil(stories.length / STORIES_PER_PAGE_DESKTOP));
	const dotIndices = Array.from({length: pageCount}, (_, index) => index);

	return (
		<section class="mv-news">
			<div class="mv-news-head">
				<div class="mv-news-kicker">
					<span class="mv-kicker-dot" />
					<span class="mv-kicker-label">{t('home.news.whats_new')}</span>
					<span class="mv-kicker-count">{`${String(stories.length).padStart(2, '0')} STORIES`}</span>
				</div>
				<div class="mv-news-controls">
					<button type="button" id="mv-prev" class="mv-arrow-btn" aria-label={t('home.news.previous_stories')}>
						←
					</button>
					<button type="button" id="mv-next" class="mv-arrow-btn" aria-label={t('home.news.next_stories')}>
						→
					</button>
					<a href={href(ctx, '/news')} class="mv-allnews">
						{t('home.news.all_news')}
					</a>
				</div>
			</div>

			<div id="mv-rail" class="mv-rail">
				{stories.map((story) => (
					<NewsStoryCard ctx={ctx} story={story} headingLevel="h3" />
				))}
			</div>

			<div id="mv-dots" class="mv-dots">
				{dotIndices.map((index) => (
					<button
						type="button"
						class={index === 0 ? 'mv-dot is-active' : 'mv-dot'}
						aria-label={`Go to slide ${index + 1}`}
					/>
				))}
			</div>
		</section>
	);
}

interface HomeNetworkSectionProps {
	ctx: MarketingContext;
	display: NetworkDisplay;
}

function HomeNetworkSection({ctx, display}: HomeNetworkSectionProps): JSX.Element {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);

	return (
		<section id="mv-network" class="mv-net">
			<div class="mv-net-head">
				<div>
					<div class="mv-net-kicker">
						<span class="mv-net-kicker-dot" />
						<span class="mv-kicker-label">SOLANA NETWORK · LIVE</span>
					</div>
					<h2 class="mv-net-heading">{t('home.network.heading')}</h2>
				</div>
				<p class="mv-net-desc">{t('home.network.description')}</p>
			</div>

			<div class="mv-chart-grid">
				<div class="mv-panel mv-chart-panel">
					<div class="mv-chart-head">
						<div>
							<div class="mv-pair-row">
								<span class="mv-pair-label">SOL / USD</span>
								<span id="mv-live-badge" class="mv-live-badge" style={display.live ? 'display:flex' : 'display:none'}>
									<span class="mv-live-dot" />
									LIVE
								</span>
								<span
									id="mv-cached-badge"
									class="mv-cached-badge"
									style={display.live ? 'display:none' : 'display:inline'}
								>
									CACHED
								</span>
							</div>
							<div class="mv-price-row">
								<span id="mv-sol-price" class="mv-price">
									{display.price}
								</span>
								<span id="mv-sol-change" class={`mv-change-badge ${display.changeUp ? 'is-up' : 'is-down'}`}>
									{display.changeText}
								</span>
							</div>
						</div>
						<div class="mv-range-btns">
							<button type="button" class="mv-range-btn" data-range="1">
								24H
							</button>
							<button type="button" class="mv-range-btn is-active" data-range="7">
								7D
							</button>
							<button type="button" class="mv-range-btn" data-range="30">
								30D
							</button>
						</div>
					</div>
					<div class="mv-chart-wrap">
						<svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" class="mv-chart-svg">
							<defs>
								<linearGradient id="mvSolFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#14f195" stop-opacity=".28" />
									<stop offset="100%" stop-color="#14f195" stop-opacity="0" />
								</linearGradient>
								<linearGradient id="mvSolLine" x1="0" y1="0" x2="1" y2="0">
									<stop offset="0%" stop-color="#9945ff" />
									<stop offset="100%" stop-color="#14f195" />
								</linearGradient>
							</defs>
							<path id="mv-chart-area" d={display.chartArea} fill="url(#mvSolFill)" />
							<path
								id="mv-chart-line"
								d={display.chartLine}
								fill="none"
								stroke="url(#mvSolLine)"
								stroke-width="2"
								vector-effect="non-scaling-stroke"
								stroke-linejoin="round"
							/>
							<circle id="mv-chart-dot" cx={display.dotX} cy={display.dotY} r="3.5" fill="#14f195" />
						</svg>
						<span id="mv-chart-high" class="mv-chart-high">
							{display.chartHigh}
						</span>
						<span id="mv-chart-low" class="mv-chart-low">
							{display.chartLow}
						</span>
					</div>
					<div id="mv-range-label" class="mv-chart-source">
						LAST 7 DAYS · COINGECKO
					</div>
				</div>

				<div class="mv-panel mv-market-panel">
					<span class="mv-panel-kicker">MARKET</span>
					<div class="mv-kv">
						<span class="mv-kv-label">Market cap</span>
						<span id="mv-mkt-cap" class="mv-kv-value">
							{display.mktCap}
						</span>
					</div>
					<div class="mv-divider" />
					<div class="mv-kv">
						<span class="mv-kv-label">24h volume</span>
						<span id="mv-mkt-vol" class="mv-kv-value">
							{display.mktVol}
						</span>
					</div>
					<div class="mv-divider" />
					<div class="mv-kv">
						<span class="mv-kv-label">24h range</span>
						<span id="mv-mkt-range" class="mv-kv-mono">
							{display.dayRange}
						</span>
					</div>
					<div class="mv-divider" />
					<div class="mv-kv">
						<span class="mv-kv-label">All-time high</span>
						<span id="mv-mkt-ath" class="mv-kv-mono">
							{display.ath}
						</span>
					</div>
				</div>
			</div>

			<div class="mv-stat-grid">
				<div class="mv-stat-tile">
					<div class="mv-stat-label">TRANSACTIONS / SEC</div>
					<div id="mv-tps" class="mv-stat-value is-green">
						{display.tps}
					</div>
					<div class="mv-stat-sub">true TPS, non-vote</div>
				</div>
				<div class="mv-stat-tile">
					<div class="mv-stat-label">AVG FEE</div>
					<div class="mv-stat-value">$0.00025</div>
					<div class="mv-stat-sub">per transaction</div>
				</div>
				<div class="mv-stat-tile">
					<div class="mv-stat-label">BLOCK TIME</div>
					<div class="mv-stat-value">
						400<span class="mv-stat-unit">ms</span>
					</div>
					<div class="mv-stat-sub">sub-second finality</div>
				</div>
				<div class="mv-stat-tile">
					<div class="mv-stat-label">VALIDATORS</div>
					<div class="mv-stat-value">1,295</div>
					<div class="mv-stat-sub">across 40+ countries</div>
				</div>
			</div>

			<div class="mv-bottom-grid">
				<div class="mv-panel mv-bars-panel">
					<div class="mv-bars-head">
						<span class="mv-panel-kicker">THROUGHPUT · LAST 24 SLOTS</span>
						<span class="mv-uptime">100% uptime</span>
					</div>
					<div id="mv-bars" class="mv-bars">
						{BAR_GRADIENTS.map(([top, bottom], index) => (
							<div
								class="mv-bar"
								style={`height:${display.barHeights[index] ?? 50}%;background:linear-gradient(180deg,${top},${bottom})`}
							/>
						))}
					</div>
					<div class="mv-bars-foot">
						<span>-24 SLOTS</span>
						<span id="mv-bars-label" class="mv-bars-foot-mid">
							{display.barsLabel}
						</span>
						<span>NOW</span>
					</div>
				</div>

				<div class="mv-panel mv-epoch-panel">
					<div class="mv-epoch-head">
						<span id="mv-epoch-label" class="mv-panel-kicker">
							{display.epochLabel}
						</span>
						<span id="mv-epoch-pct" class="mv-epoch-pct">
							{display.epochPct}
						</span>
					</div>
					<div class="mv-epoch-track">
						<div id="mv-epoch-bar" class="mv-epoch-fill" style={`width:${display.epochBarWidth}%`} />
					</div>
					<div class="mv-epoch-stats">
						<div class="mv-kv">
							<span class="mv-kv-label">Total transactions</span>
							<span class="mv-kv-value-sm">418.6B</span>
						</div>
						<div class="mv-divider" />
						<div class="mv-kv">
							<span class="mv-kv-label">Multiverse messages</span>
							<span class="mv-kv-value-sm">2.4M</span>
						</div>
						<div class="mv-divider" />
						<div class="mv-kv">
							<span class="mv-kv-label">Avg confirm</span>
							<span class="mv-kv-value-sm is-green">0.42s</span>
						</div>
					</div>
				</div>
			</div>
			<div class="mv-net-source">SOURCE: SOLANA RPC · SAMPLE PERFORMANCE DATA, REFRESHED EVERY SLOT</div>
		</section>
	);
}

export async function renderHomePage(c: Context, ctx: MarketingContext): Promise<Response> {
	const pageMeta = defaultPageMeta();
	const pageUrl = ctx.baseUrl;

	const [stories, statsResult] = await Promise.all([
		fetchPublishedNewsStories(ctx),
		getSolanaStats('7').catch(() => null),
	]);
	const display = buildNetworkDisplay(
		statsResult ?? {
			live: false,
			range: '7',
			market: null,
			series: [],
			tps: null,
			tpsSamples: [],
			epoch: null,
			epochPct: null,
			epochSlotsRemaining: null,
			epochEtaSeconds: null,
		},
	);

	const html = (
		<html lang={ctx.locale}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				{buildMetaTags(ctx, pageMeta, pageUrl)}
				<title>{pageMeta.title}</title>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
				<link rel="stylesheet" href={GOOGLE_FONTS_URL} />
				<link rel="stylesheet" href={cacheBustedAsset(ctx, '/static/app.css')} />
				{buildIconLinks(ctx.staticCdnEndpoint)}
				{homePageScript(href(ctx, '/_solana'))}
				{newsPopupScript(ctx.apiEndpoint, href(ctx, '/news'))}
				{siwsConnectScript(ctx.apiEndpoint, ctx.appEndpoint, `${ctx.staticCdnEndpoint}/images/multiverse-mark.png`)}
			</head>
			<body class="bg-[#08080a]">
				<div class="mv-home">
					<div class="mv-glow" />
					<div class="mv-grid-overlay" />
					<HomeHeader ctx={ctx} active="home" />
					<main class="mv-main">
						<HomeHero ctx={ctx} />
						<HomeNewsSection ctx={ctx} stories={stories} />
						<HomeNetworkSection ctx={ctx} display={display} />
						<HomeFooter ctx={ctx} />
					</main>
					<NewsStoryPopup stories={stories} />
				</div>
			</body>
		</html>
	);

	return c.html(html);
}
