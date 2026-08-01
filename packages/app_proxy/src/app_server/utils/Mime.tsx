/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',

	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',

	'.css': 'text/css; charset=utf-8',

	'.json': 'application/json; charset=utf-8',

	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',

	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.eot': 'application/vnd.ms-fontobject',

	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.ogg': 'audio/ogg',
	'.wav': 'audio/wav',

	'.pdf': 'application/pdf',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',

	'.webmanifest': 'application/manifest+json',

	// '.map' is deliberately absent: source maps embed unminified `sourcesContent`
	// and are never served. See isSourceMapPath / createSourceMapGuard.

	'.wasm': 'application/wasm',
};

const SOURCE_MAP_EXTENSION = '.map';

/**
 * Reduces a request path to the form that actually decides which file is opened,
 * so a suffix check cannot be dodged with encoding or trailing noise.
 */
function normalizeForExtensionCheck(value: string): string {
	let candidate = value;

	// Hono already decodes most percent-escapes into `c.req.path`, but it leaves
	// `%2f`/`%5c` intact, and a client can double-encode. Decode to a fixed point.
	for (let iteration = 0; iteration < 3; iteration += 1) {
		let decoded: string;
		try {
			decoded = decodeURIComponent(candidate);
		} catch {
			// Malformed percent-encoding: keep the best form we already have.
			break;
		}
		if (decoded === candidate) {
			break;
		}
		candidate = decoded;
	}

	// Poison null byte: path handling truncates at NUL, so test the truncated form too.
	const nulIndex = candidate.indexOf('\0');
	if (nulIndex >= 0) {
		candidate = candidate.slice(0, nulIndex);
	}

	// Trailing separators/whitespace do not change which file a path resolves to.
	return candidate.replace(/[\s/\\]+$/, '').toLowerCase();
}

/**
 * True if the path addresses a source map, under any encoding or casing.
 * Checks the raw form as well so NUL truncation cannot open a hole.
 */
export function isSourceMapPath(path: string): boolean {
	return (
		normalizeForExtensionCheck(path).endsWith(SOURCE_MAP_EXTENSION) || path.toLowerCase().endsWith(SOURCE_MAP_EXTENSION)
	);
}

export function getMimeType(path: string): string {
	const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
	return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function isStaticAsset(path: string): boolean {
	const lastSlashIndex = path.lastIndexOf('/');
	const filename = lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path;
	return filename.includes('.');
}

export function isHashedAsset(path: string): boolean {
	const ext = '(?:js|css|mjs|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|webp|avif|svg|wasm)';
	// .hash.ext  or  -hash.ext  (webpack/vite style)
	const hashPattern = new RegExp(`\\.[a-f0-9]{8,}\\.${ext}$`, 'i');
	const hashPattern2 = new RegExp(`-[a-f0-9]{8,}\\.${ext}$`, 'i');
	// hash.ext  (rspack content-hash-as-filename style: e.g. 425e6d65812b7e2b.js)
	const hashPattern3 = new RegExp(`^[a-f0-9]{8,}\\.${ext}$`, 'i');
	const filename = path.slice(path.lastIndexOf('/') + 1);
	return hashPattern.test(path) || hashPattern2.test(path) || hashPattern3.test(filename);
}
