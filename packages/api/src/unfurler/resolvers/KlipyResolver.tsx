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

import {Config} from '@fluxer/api/src/Config';
import {Logger} from '@fluxer/api/src/Logger';
import {BaseResolver} from '@fluxer/api/src/unfurler/resolvers/BaseResolver';
import {buildEmbedMediaPayload} from '@fluxer/api/src/unfurler/resolvers/media/MediaMetadataHelpers';
import type {MessageEmbedResponse} from '@fluxer/schema/src/domains/message/EmbedSchemas';
import {URLType} from '@fluxer/schema/src/primitives/UrlValidators';

const KLIPY_API_BASE_URL = 'https://api.klipy.com/v2';
const KLIPY_CLIENT_KEY = 'fluxer';
// The search fallback below is the only path here reachable with fully
// attacker-controlled input (any klipy.com link's slug, straight from message
// text) — unlike the numeric `kid` lookup, a bogus slug that never matches
// anything still costs one real request to Klipy's rate/cost-limited API. This
// cache blunts the cheap case (the same fake link posted repeatedly) by
// short-circuiting known-recent misses without a live call. It's in-memory only
// (this resolver instance lives for the process's lifetime) rather than backed by
// the shared cache service — good enough to cut repeat cost, not meant to be a
// distributed rate limit.
const SEARCH_FALLBACK_NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_FALLBACK_NEGATIVE_CACHE_MAX_SIZE = 5000;

interface KlipyMediaFormat {
	url?: string;
	dims?: [number, number];
}

interface KlipyMediaFormats {
	webp?: KlipyMediaFormat;
	mp4?: KlipyMediaFormat;
}

interface KlipyPost {
	id?: string;
	title?: string;
	itemurl?: string;
	media_formats?: KlipyMediaFormats;
}

interface KlipyPostsResponse {
	results?: Array<KlipyPost>;
}

export class KlipyResolver extends BaseResolver {
	private readonly searchFallbackNegativeCache = new Map<string, number>();

	// klipy.com itself is behind a Cloudflare bot challenge (returns 403 to any
	// non-browser fetch, including ours), so this resolver never scrapes the public
	// site. Links our own GIF picker produces embed the real numeric Klipy ID as
	// `kid`, which is looked up directly via Klipy's partner API (the same
	// authenticated API `KlipyService` already uses for search, not behind that
	// challenge). Links without a `kid` — GIFs favorited before this ID was tracked,
	// or a klipy.com link a user pastes directly — fall back to a best-effort search
	// using words from the slug, filtered in resolve() to the exact matching slug.
	// That fallback isn't guaranteed to find the right result, but it beats the
	// alternative of never resolving those links at all.
	override transformUrl(url: URL): URL | null {
		const hostname = url.hostname.toLowerCase();
		if (hostname !== 'klipy.com' && hostname !== 'www.klipy.com') {
			return null;
		}
		const slug = this.extractSlug(url);
		if (!slug) {
			return null;
		}

		const klipyId = url.searchParams.get('kid');
		if (klipyId && /^\d+$/.test(klipyId)) {
			const apiUrl = new URL(`${KLIPY_API_BASE_URL}/posts`);
			apiUrl.searchParams.set('ids', klipyId);
			apiUrl.searchParams.set('client_key', KLIPY_CLIENT_KEY);
			apiUrl.searchParams.set('contentfilter', 'low');
			apiUrl.searchParams.set('key', Config.klipy.apiKey ?? '');
			return apiUrl;
		}

		if (this.isRecentSearchFallbackMiss(slug)) {
			return null;
		}
		const query = slug.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
		if (!query) {
			return null;
		}
		const apiUrl = new URL(`${KLIPY_API_BASE_URL}/search`);
		apiUrl.searchParams.set('q', query);
		apiUrl.searchParams.set('client_key', KLIPY_CLIENT_KEY);
		apiUrl.searchParams.set('contentfilter', 'low');
		apiUrl.searchParams.set('country', 'US');
		apiUrl.searchParams.set('locale', 'en');
		apiUrl.searchParams.set('limit', '50');
		apiUrl.searchParams.set('key', Config.klipy.apiKey ?? '');
		return apiUrl;
	}

	// Resolution only ever happens via the `transformUrl` path above, so there is
	// nothing left for this resolver to match against the original klipy.com URL.
	match(_url: URL, _mimeType: string, _content: Uint8Array): boolean {
		return false;
	}

	async resolve(url: URL, content: Uint8Array, isNSFWAllowed: boolean = false): Promise<Array<MessageEmbedResponse>> {
		const klipyId = url.searchParams.get('kid');
		const isSearchFallback = !(klipyId && /^\d+$/.test(klipyId));
		const targetSlug = this.extractSlug(url);
		const results = this.parsePostsResponse(content);
		const post = isSearchFallback
			? results.find((result) => this.extractSlugFromItemUrl(result.itemurl) === targetSlug)
			: results[0];
		if (!post) {
			if (isSearchFallback && targetSlug) {
				this.recordSearchFallbackMiss(targetSlug);
			}
			return [];
		}

		const {thumbnail: thumbnailFormat, video: videoFormat} = this.extractMediaFormats(post);
		const thumbnail = thumbnailFormat ? await this.resolveKlipyMedia(thumbnailFormat, isNSFWAllowed) : undefined;
		const video = videoFormat ? await this.resolveKlipyMedia(videoFormat, isNSFWAllowed) : undefined;
		const embed: MessageEmbedResponse = {
			type: 'gifv',
			url: this.stripInternalParams(url),
			provider: {name: 'KLIPY', url: 'https://klipy.com'},
			thumbnail: thumbnail ?? undefined,
			video: video ?? undefined,
		};
		return [embed];
	}

	private isRecentSearchFallbackMiss(slug: string): boolean {
		const recordedAt = this.searchFallbackNegativeCache.get(slug);
		if (recordedAt === undefined) {
			return false;
		}
		if (Date.now() - recordedAt > SEARCH_FALLBACK_NEGATIVE_CACHE_TTL_MS) {
			this.searchFallbackNegativeCache.delete(slug);
			return false;
		}
		return true;
	}

	private recordSearchFallbackMiss(slug: string): void {
		if (this.searchFallbackNegativeCache.size >= SEARCH_FALLBACK_NEGATIVE_CACHE_MAX_SIZE) {
			this.searchFallbackNegativeCache.clear();
		}
		this.searchFallbackNegativeCache.set(slug, Date.now());
	}

	private extractSlug(url: URL): string | null {
		const pathMatch = url.pathname.match(/^\/(gif|gifs|clip|clips)\/([^/]+)/);
		if (!pathMatch?.[2]) {
			return null;
		}
		try {
			const slug = decodeURIComponent(pathMatch[2]).trim();
			return slug || null;
		} catch {
			return null;
		}
	}

	private extractSlugFromItemUrl(itemurl?: string): string | null {
		if (!itemurl) {
			return null;
		}
		try {
			return this.extractSlug(new URL(itemurl));
		} catch {
			return null;
		}
	}

	private async resolveKlipyMedia(
		format: KlipyMediaFormat,
		isNSFWAllowed: boolean,
	): Promise<MessageEmbedResponse['image']> {
		if (!format.url || !URLType.safeParse(format.url).success) {
			return null;
		}
		try {
			const metadata = await this.mediaService.getMetadata({
				type: 'external',
				url: format.url,
				isNSFWAllowed,
			});
			return buildEmbedMediaPayload(format.url, metadata, {
				width: format.dims?.[0],
				height: format.dims?.[1],
			});
		} catch (error) {
			Logger.error({error}, 'Failed to resolve Klipy media URL metadata');
			return null;
		}
	}

	private parsePostsResponse(content: Uint8Array): Array<KlipyPost> {
		try {
			const parsed = JSON.parse(Buffer.from(content).toString('utf-8')) as KlipyPostsResponse;
			return parsed.results ?? [];
		} catch (error) {
			Logger.error({error}, 'Failed to parse KLIPY posts response');
			return [];
		}
	}

	private extractMediaFormats(post: KlipyPost): {thumbnail?: KlipyMediaFormat; video?: KlipyMediaFormat} {
		return {
			thumbnail: post.media_formats?.webp,
			video: post.media_formats?.mp4,
		};
	}

	private stripInternalParams(url: URL): string {
		const clean = new URL(url.href);
		clean.searchParams.delete('kid');
		return clean.href;
	}
}
