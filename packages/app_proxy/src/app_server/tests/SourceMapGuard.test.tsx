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

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {HonoEnv} from '@fluxer/app_proxy/src/AppServerTypes';
import {registerAppServerRoutes} from '@fluxer/app_proxy/src/app_server/AppServerRoutes';
import type {Logger} from '@fluxer/logger/src/Logger';
import {Hono} from 'hono';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

const SECRET = 'SOURCE_MAP_SECRET_MARKER';

const logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
} as unknown as Logger;

let staticDir: string;
let app: Hono<HonoEnv>;

const request = async (path: string): Promise<Response> => app.request(`http://localhost${path}`);

beforeAll(() => {
	staticDir = mkdtempSync(join(tmpdir(), 'fluxer-app-proxy-'));
	mkdirSync(join(staticDir, 'assets'));

	writeFileSync(join(staticDir, 'index.html'), '<html>{{CSP_NONCE_PLACEHOLDER}}</html>');
	writeFileSync(join(staticDir, 'sw.js'), 'self.addEventListener("install", () => {});');
	writeFileSync(join(staticDir, 'sw.js.map'), `{"sourcesContent":["${SECRET}"]}`);

	// A real source map sitting next to the bundle it belongs to.
	writeFileSync(join(staticDir, 'assets', 'abc.js'), 'console.log(1);');
	writeFileSync(join(staticDir, 'assets', 'abc.js.map'), `{"sourcesContent":["${SECRET}"]}`);
	writeFileSync(join(staticDir, 'assets', 'abc.css'), 'body{color:red}');
	writeFileSync(join(staticDir, 'assets', 'abc.css.map'), `{"sourcesContent":["${SECRET}"]}`);

	// Legitimate assets that must keep serving.
	writeFileSync(join(staticDir, 'assets', 'font.woff2'), 'woff2-bytes');
	writeFileSync(join(staticDir, 'assets', 'icon.svg'), '<svg />');
	writeFileSync(join(staticDir, 'assets', 'image.png'), 'png-bytes');
	writeFileSync(join(staticDir, 'assets', 'core.wasm'), 'wasm-bytes');

	// Deliberately adversarial-looking but legitimate filenames.
	writeFileSync(join(staticDir, 'assets', 'weird.map.js'), 'console.log(2);');
	writeFileSync(join(staticDir, 'assets', 'mapbox.js'), 'console.log(3);');

	app = new Hono<HonoEnv>({strict: true});
	registerAppServerRoutes({app, logger, staticDir});
});

afterAll(() => {
	rmSync(staticDir, {recursive: true, force: true});
});

describe('SourceMapGuard', () => {
	describe('blocks source maps', () => {
		const blocked = [
			['plain asset map', '/assets/abc.js.map'],
			['css map', '/assets/abc.css.map'],
			['service worker map', '/sw.js.map'],
			['encoded dot (lowercase)', '/assets/abc.js%2emap'],
			['encoded dot (uppercase)', '/assets/abc.js%2Emap'],
			['double-encoded dot', '/assets/abc.js%252emap'],
			['encoded final char', '/assets/abc.js.ma%70'],
			['uppercase extension', '/assets/abc.js.MAP'],
			['mixed case extension', '/assets/abc.js.MaP'],
			['fully uppercase path', '/ASSETS/ABC.JS.MAP'],
			['query string appended', '/assets/abc.js.map?x=1'],
			['fragment-ish query', '/assets/abc.js.map?'],
			['trailing slash', '/assets/abc.js.map/'],
			['encoded trailing slash', '/assets/abc.js.map%2f'],
			['encoded trailing backslash', '/assets/abc.js.map%5c'],
			['trailing space', '/assets/abc.js.map%20'],
			['poison null byte', '/assets/abc.js.map%00.js'],
			['traversal back into assets', '/assets/../assets/abc.js.map'],
			['traversal out of root', '/../../etc/abc.js.map'],
			['encoded traversal', '/assets/..%2fassets%2fabc.js.map'],
			['double extension', '/assets/abc.js.map.map'],
			['nonexistent map', '/assets/does-not-exist.js.map'],
		] as const;

		test.each(blocked)('%s -> 404 without body', async (_name, path) => {
			const response = await request(path);
			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain(SECRET);
		});

		test('blocked map is indistinguishable from a missing one', async () => {
			const existing = await request('/assets/abc.js.map');
			const missing = await request('/assets/nope.js.map');
			expect(existing.status).toBe(missing.status);
			expect(await existing.text()).toBe(await missing.text());
		});

		test('the SPA catch-all does not answer a map request with index.html', async () => {
			const response = await request('/assets/abc.js.map');
			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain('<html>');
		});
	});

	describe('legitimate assets still serve', () => {
		const allowed = [
			['/assets/abc.js', 'application/javascript; charset=utf-8', 'console.log(1);'],
			['/assets/abc.css', 'text/css; charset=utf-8', 'body{color:red}'],
			['/assets/font.woff2', 'font/woff2', 'woff2-bytes'],
			['/assets/icon.svg', 'image/svg+xml', '<svg />'],
			['/assets/image.png', 'image/png', 'png-bytes'],
			['/assets/core.wasm', 'application/wasm', 'wasm-bytes'],
			['/assets/weird.map.js', 'application/javascript; charset=utf-8', 'console.log(2);'],
			['/assets/mapbox.js', 'application/javascript; charset=utf-8', 'console.log(3);'],
		] as const;

		test.each(allowed)('%s serves 200', async (path, mimeType, body) => {
			const response = await request(path);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe(mimeType);
			expect(await response.text()).toBe(body);
		});

		test('service worker still serves', async () => {
			const response = await request('/sw.js');
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('addEventListener');
		});

		test('health check still serves', async () => {
			const response = await request('/_health');
			expect(response.status).toBe(200);
		});

		test('SPA route still falls back to index.html', async () => {
			const response = await request('/channels/123');
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('<html>');
		});
	});
});
