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

import {KlipyResolver} from '@fluxer/api/src/unfurler/resolvers/KlipyResolver';
import {createMockContent, MockMediaService} from '@fluxer/api/src/unfurler/tests/ResolverTestUtils';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

interface KlipyPostData {
	id?: string;
	title?: string;
	itemurl?: string;
	media_formats?: {
		webp?: {url?: string; dims?: [number, number]};
		mp4?: {url?: string; dims?: [number, number]};
	};
}

function createKlipyPostsContent(posts: Array<KlipyPostData>): Uint8Array {
	return new TextEncoder().encode(JSON.stringify({results: posts}));
}

describe('KlipyResolver', () => {
	let mediaService: MockMediaService;
	let resolver: KlipyResolver;

	beforeEach(() => {
		mediaService = new MockMediaService();
		resolver = new KlipyResolver(mediaService);
	});

	afterEach(() => {
		mediaService.reset();
	});

	describe('transformUrl', () => {
		it('transforms a klipy.com gifs URL with a kid param into a KLIPY posts API URL', () => {
			const url = new URL('https://klipy.com/gifs/love-ghost-1?kid=2484942301552561');
			const result = resolver.transformUrl(url);
			expect(result?.origin).toBe('https://api.klipy.com');
			expect(result?.pathname).toBe('/v2/posts');
			expect(result?.searchParams.get('ids')).toBe('2484942301552561');
			expect(result?.searchParams.get('client_key')).toBe('fluxer');
		});

		it('transforms a klipy.com clips URL with a kid param', () => {
			const url = new URL('https://klipy.com/clips/some-clip?kid=123');
			const result = resolver.transformUrl(url);
			expect(result?.searchParams.get('ids')).toBe('123');
		});

		it('handles www.klipy.com', () => {
			const url = new URL('https://www.klipy.com/gifs/love-ghost-1?kid=123');
			const result = resolver.transformUrl(url);
			expect(result?.searchParams.get('ids')).toBe('123');
		});

		it('handles legacy singular gif/clip paths', () => {
			const url = new URL('https://klipy.com/gif/love-ghost-1?kid=123');
			const result = resolver.transformUrl(url);
			expect(result?.searchParams.get('ids')).toBe('123');
		});

		it('falls back to a KLIPY search API URL when there is no kid param', () => {
			const url = new URL('https://klipy.com/gifs/love-ghost-1');
			const result = resolver.transformUrl(url);
			expect(result?.origin).toBe('https://api.klipy.com');
			expect(result?.pathname).toBe('/v2/search');
			expect(result?.searchParams.get('q')).toBe('love ghost');
		});

		it('strips a trailing numeric disambiguator from the slug when building the search query', () => {
			const url = new URL('https://klipy.com/gifs/shocked-cat-12');
			const result = resolver.transformUrl(url);
			expect(result?.searchParams.get('q')).toBe('shocked cat');
		});

		it('falls back to search when the kid param is not numeric', () => {
			const url = new URL('https://klipy.com/gifs/love-ghost-1?kid=not-a-number');
			const result = resolver.transformUrl(url);
			expect(result?.pathname).toBe('/v2/search');
		});

		it('returns null for non-klipy domains', () => {
			const url = new URL('https://giphy.com/gifs/cat-12345?kid=123');
			const result = resolver.transformUrl(url);
			expect(result).toBeNull();
		});

		it('returns null for non-gifs/clips paths', () => {
			const url = new URL('https://klipy.com/about?kid=123');
			const result = resolver.transformUrl(url);
			expect(result).toBeNull();
		});

		it('returns null for klipy subdomains', () => {
			const url = new URL('https://static.klipy.com/image.gif?kid=123');
			const result = resolver.transformUrl(url);
			expect(result).toBeNull();
		});
	});

	describe('match', () => {
		it('always returns false, since resolution only happens via transformUrl', () => {
			const url = new URL('https://klipy.com/gifs/love-ghost-1');
			expect(resolver.match(url, 'text/html', createMockContent(''))).toBe(false);
			expect(resolver.match(url, 'application/json', createMockContent(''))).toBe(false);
		});
	});

	describe('resolve', () => {
		it('returns a gifv embed with thumbnail and video from a posts response', async () => {
			const post: KlipyPostData = {
				id: '2484942301552561',
				title: 'Cute Ghosts Sending Extra Love',
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/test/kIsgEOKn.webp', dims: [498, 498]},
					mp4: {url: 'https://static.klipy.com/ii/test/nyOtbnCFc6GfLxMBzd.mp4', dims: [640, 640]},
				},
			};

			const url = new URL('https://klipy.com/gifs/love-ghost-1?kid=2484942301552561');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds).toHaveLength(1);
			expect(embeds[0].type).toBe('gifv');
			expect(embeds[0].provider).toEqual({name: 'KLIPY', url: 'https://klipy.com'});
			expect(embeds[0].thumbnail).toBeDefined();
			expect(embeds[0].video).toBeDefined();
		});

		it('strips the internal kid param from the embed url', async () => {
			const post: KlipyPostData = {
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/test/thumb.webp', dims: [400, 400]},
					mp4: {url: 'https://static.klipy.com/ii/test/video.mp4', dims: [400, 400]},
				},
			};

			const url = new URL('https://klipy.com/gifs/love-ghost-1?kid=2484942301552561');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds[0].url).toBe('https://klipy.com/gifs/love-ghost-1');
		});

		it('extracts webp URL for thumbnail', async () => {
			const post: KlipyPostData = {
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/abc/thumbnail.webp', dims: [400, 400]},
					mp4: {url: 'https://static.klipy.com/ii/abc/video.mp4', dims: [400, 400]},
				},
			};

			const url = new URL('https://klipy.com/gifs/test-gif?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds[0].thumbnail?.url).toContain('thumbnail.webp');
		});

		it('extracts mp4 URL for video', async () => {
			const post: KlipyPostData = {
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/abc/thumbnail.webp', dims: [400, 400]},
					mp4: {url: 'https://static.klipy.com/ii/abc/video.mp4', dims: [640, 640]},
				},
			};

			const url = new URL('https://klipy.com/gifs/test-gif?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds[0].video?.url).toContain('video.mp4');
		});

		it('handles media with only thumbnail (no video)', async () => {
			const post: KlipyPostData = {
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/test/image.webp', dims: [400, 400]},
				},
			};

			const url = new URL('https://klipy.com/gifs/image-only?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds).toHaveLength(1);
			expect(embeds[0].thumbnail).toBeDefined();
			expect(embeds[0].video).toBeUndefined();
		});

		it('handles media with only video (no thumbnail)', async () => {
			const post: KlipyPostData = {
				media_formats: {
					mp4: {url: 'https://static.klipy.com/ii/test/video.mp4', dims: [640, 640]},
				},
			};

			const url = new URL('https://klipy.com/gifs/video-only?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]));

			expect(embeds).toHaveLength(1);
			expect(embeds[0].thumbnail).toBeUndefined();
			expect(embeds[0].video).toBeDefined();
		});

		it('returns empty array when the posts response has no results', async () => {
			const url = new URL('https://klipy.com/gifs/no-media?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([]));

			expect(embeds).toHaveLength(0);
		});

		it('returns empty array when the response is not valid JSON', async () => {
			const url = new URL('https://klipy.com/gifs/no-media?kid=123');
			const embeds = await resolver.resolve(url, createMockContent('not json'));

			expect(embeds).toHaveLength(0);
		});

		it('returns empty array when media_formats is missing entirely', async () => {
			const url = new URL('https://klipy.com/gifs/no-file?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([{id: 'test'}]));

			expect(embeds).toHaveLength(1);
			expect(embeds[0].thumbnail).toBeUndefined();
			expect(embeds[0].video).toBeUndefined();
		});

		it('handles NSFW flag when allowed', async () => {
			const post: KlipyPostData = {
				media_formats: {
					webp: {url: 'https://static.klipy.com/ii/nsfw/thumb.webp', dims: [400, 400]},
					mp4: {url: 'https://static.klipy.com/ii/nsfw/video.mp4', dims: [400, 400]},
				},
			};

			mediaService.markAsNsfw('https://static.klipy.com/ii/nsfw/thumb.webp');
			mediaService.markAsNsfw('https://static.klipy.com/ii/nsfw/video.mp4');

			const url = new URL('https://klipy.com/gifs/nsfw-gif?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent([post]), true);

			expect(embeds).toHaveLength(1);
		});

		it('takes the first result when the posts response contains multiple entries', async () => {
			const posts: Array<KlipyPostData> = [
				{
					media_formats: {
						webp: {url: 'https://static.klipy.com/ii/first/thumb.webp', dims: [400, 400]},
						mp4: {url: 'https://static.klipy.com/ii/first/video.mp4', dims: [400, 400]},
					},
				},
				{
					media_formats: {
						webp: {url: 'https://static.klipy.com/ii/second/thumb.webp', dims: [400, 400]},
					},
				},
			];

			const url = new URL('https://klipy.com/gifs/multi?kid=123');
			const embeds = await resolver.resolve(url, createKlipyPostsContent(posts));

			expect(embeds[0].thumbnail?.url).toContain('first/thumb.webp');
		});

		describe('search fallback (no kid param)', () => {
			it('resolves the result whose itemurl slug matches the original link', async () => {
				const posts: Array<KlipyPostData> = [
					{
						itemurl: 'https://klipy.com/gifs/some-other-gif',
						media_formats: {
							webp: {url: 'https://static.klipy.com/ii/wrong/thumb.webp', dims: [400, 400]},
							mp4: {url: 'https://static.klipy.com/ii/wrong/video.mp4', dims: [400, 400]},
						},
					},
					{
						itemurl: 'https://klipy.com/gifs/love-ghost-1',
						media_formats: {
							webp: {url: 'https://static.klipy.com/ii/right/thumb.webp', dims: [400, 400]},
							mp4: {url: 'https://static.klipy.com/ii/right/video.mp4', dims: [400, 400]},
						},
					},
				];

				const url = new URL('https://klipy.com/gifs/love-ghost-1');
				const embeds = await resolver.resolve(url, createKlipyPostsContent(posts));

				expect(embeds).toHaveLength(1);
				expect(embeds[0].thumbnail?.url).toContain('right/thumb.webp');
			});

			it('returns empty array when no search result matches the original slug', async () => {
				const posts: Array<KlipyPostData> = [
					{
						itemurl: 'https://klipy.com/gifs/some-other-gif',
						media_formats: {
							webp: {url: 'https://static.klipy.com/ii/wrong/thumb.webp', dims: [400, 400]},
						},
					},
				];

				const url = new URL('https://klipy.com/gifs/love-ghost-1');
				const embeds = await resolver.resolve(url, createKlipyPostsContent(posts));

				expect(embeds).toHaveLength(0);
			});

			it('returns empty array when the search response has no results at all', async () => {
				const url = new URL('https://klipy.com/gifs/love-ghost-1');
				const embeds = await resolver.resolve(url, createKlipyPostsContent([]));

				expect(embeds).toHaveLength(0);
			});
		});
	});
});
