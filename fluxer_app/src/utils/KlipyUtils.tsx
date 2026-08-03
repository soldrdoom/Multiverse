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

interface KlipyPath {
	type: 'gif' | 'clip';
	slug: string;
	klipyId?: string;
}

function parseKlipyPath(url: string): KlipyPath | null {
	if (!url) return null;

	try {
		const parsedUrl = new URL(url);
		const hostname = parsedUrl.hostname.toLowerCase();
		if (hostname !== 'klipy.com' && hostname !== 'www.klipy.com') {
			return null;
		}

		const pathMatch = parsedUrl.pathname.match(/^\/(gif|gifs|clip|clips)\/([^/]+)/i);
		if (!pathMatch?.[1] || !pathMatch[2]) {
			return null;
		}

		const type = pathMatch[1].toLowerCase().startsWith('clip') ? 'clip' : 'gif';
		const slug = decodeURIComponent(pathMatch[2]).trim();
		if (!slug) {
			return null;
		}

		const klipyId = parsedUrl.searchParams.get('kid');

		return {type, slug, klipyId: klipyId ?? undefined};
	} catch {
		return null;
	}
}

export function extractKlipySlug(url: string): string | null {
	return parseKlipyPath(url)?.slug ?? null;
}

export function buildKlipyShareUrl({
	slug,
	type = 'gif',
	klipyId,
}: {
	slug: string;
	type?: 'gif' | 'clip';
	klipyId?: string;
}): string {
	const normalizedSlug = slug.trim();
	if (!normalizedSlug) {
		return 'https://klipy.com/gifs';
	}
	const path = type === 'clip' ? 'clips' : 'gifs';
	const shareUrl = `https://klipy.com/${path}/${encodeURIComponent(normalizedSlug)}`;
	if (!klipyId?.trim()) {
		return shareUrl;
	}
	const withId = new URL(shareUrl);
	withId.searchParams.set('kid', klipyId.trim());
	return withId.href;
}

export function resolveKlipyShareUrl({
	url,
	fallbackSlug,
	fallbackType = 'gif',
	klipyId,
}: {
	url: string;
	fallbackSlug?: string | null;
	fallbackType?: 'gif' | 'clip';
	klipyId?: string;
}): string {
	const parsed = parseKlipyPath(url);
	if (parsed) {
		return buildKlipyShareUrl({...parsed, klipyId: parsed.klipyId ?? klipyId});
	}
	if (fallbackSlug?.trim()) {
		return buildKlipyShareUrl({slug: fallbackSlug, type: fallbackType, klipyId});
	}
	return url;
}

export function parseTitleFromUrl(url: string): string {
	if (!url) return '';

	const klipyPath = parseKlipyPath(url);
	if (klipyPath) {
		return klipyPath.slug
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	const srcMatch = url.match(/\/([^/]+?)(?:\.[^.]+)?$/);
	if (srcMatch?.[1]) {
		return srcMatch[1]
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	return 'GIF';
}
