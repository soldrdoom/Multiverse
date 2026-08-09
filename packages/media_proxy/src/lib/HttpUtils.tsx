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

import type {Context} from 'hono';

export function parseRange(rangeHeader: string | null, fileSize: number) {
	if (!rangeHeader) return null;
	const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
	if (!matches) return null;

	const start = matches[1] ? Number.parseInt(matches[1], 10) : 0;
	const end = matches[2] ? Number.parseInt(matches[2], 10) : fileSize - 1;

	return start >= fileSize || end >= fileSize || start > end ? null : {start, end};
}

export function setHeaders(
	ctx: Context,
	size: number,
	contentType: string,
	range: {start: number; end: number} | null,
	lastModified?: Date,
) {
	const isStreamableMedia = contentType.startsWith('video/') || contentType.startsWith('audio/');

	const headers: Record<string, string> = {
		'Accept-Ranges': 'bytes',
		'Access-Control-Allow-Origin': '*',
		'Cache-Control': isStreamableMedia
			? 'public, max-age=31536000, no-transform, immutable'
			: 'public, max-age=31536000',
		'Content-Type': contentType,
		Date: new Date().toUTCString(),
		Expires: new Date(Date.now() + 31536000000).toUTCString(),
		'Last-Modified': lastModified?.toUTCString() ?? new Date().toUTCString(),
		Vary: 'Accept-Encoding, Range',
	};

	// Defense-in-depth for user-uploaded SVGs served from this same-origin CDN path
	// (see CosmeticsSvgSanitizer.tsx for the primary control: sanitizing the SVG
	// itself before it's ever stored). This header only takes effect if the response
	// is ever loaded as a *document* — a direct top-level navigation to the raw file
	// URL — which is exactly the scenario sanitization can't rely on `<img>`
	// rendering semantics to neutralize. `<img src=...>` subresource loads inside the
	// app are unaffected: a response's own CSP header doesn't restrict how it's used
	// as an image subresource, only what it's allowed to do if treated as a document.
	//
	// `img-src 'none'; style-src 'unsafe-inline'` closes the remaining gap once
	// `script-src 'none'; sandbox` alone stops execution: a sanitized SVG can still
	// carry a same-document `@import`/`url()` CSS reference the sanitizer failed to
	// catch (belt-and-suspenders — CosmeticsSvgSanitizer.tsx's own CSS handling is the
	// primary control there), and without an `img-src`/`style-src` restriction the
	// document could still fire that as a live subresource fetch — an external network
	// beacon (viewer IP/UA, or an internal-network probe) even though script execution
	// itself is already blocked by `sandbox`. `style-src 'unsafe-inline'` is kept
	// permissive so a legitimate SVG's own inline `<style>` (the whole reason `<style>`
	// is allowed by the sanitizer) still renders normally — this only blocks *loading*
	// further resources via CSS/`<image>`, not applying the stylesheet's rules.
	if (contentType === 'image/svg+xml') {
		headers['Content-Security-Policy'] = "script-src 'none'; sandbox; img-src 'none'; style-src 'unsafe-inline'";
	}

	Object.entries(headers).forEach(([k, v]) => {
		ctx.header(k, v);
	});

	if (range) {
		ctx.status(206);
		ctx.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
	}
}
