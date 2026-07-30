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

import {newsPopupScript} from '@fluxer/marketing/src/pages/home/NewsPopupScript';
import {siwsConnectScript} from '@fluxer/marketing/src/pages/home/SiwsConnectScript';
import {describe, expect, it} from 'vitest';

// These scripts are built as template literals and injected with dangerouslySetInnerHTML, so nothing
// in the normal build pipeline ever parses them. A stray backtick or a typo inside the string is
// invisible to tsgo and biome alike and only shows up as a dead front page in the browser.
function extractScriptBody(element: JSX.Element): string {
	const html = String(element);
	const match = html.match(/<script[^>]*>([\s\S]*)<\/script>/);
	if (match?.[1] === undefined) throw new Error(`Could not extract script body from: ${html.slice(0, 200)}`);
	return match[1];
}

const CASES: ReadonlyArray<{name: string; build: () => JSX.Element}> = [
	{
		name: 'newsPopupScript',
		build: () => newsPopupScript('https://multiverse.forum/api', '/news', '1234567890'),
	},
	{
		name: 'newsPopupScript (no initial story)',
		build: () => newsPopupScript('https://multiverse.forum/api', '/news', null),
	},
	{
		name: 'siwsConnectScript',
		build: () => siwsConnectScript('https://multiverse.forum/api', 'https://multiverse.forum', 'https://cdn/mark.png'),
	},
];

describe.each(CASES)('$name', ({build}) => {
	it('emits syntactically valid JavaScript', () => {
		const body = extractScriptBody(build());

		// Compiles the source without running it — throws SyntaxError on malformed output.
		expect(() => new Function(body)).not.toThrow();
	});

	it('never emits a closing script tag that would break out of the inline block', () => {
		expect(extractScriptBody(build()).toLowerCase()).not.toContain('</script');
	});

	it('is wrapped in an IIFE so it leaks nothing but its explicit globals', () => {
		const body = extractScriptBody(build()).trim();

		expect(body.startsWith('(function()')).toBe(true);
		expect(body.endsWith('})();')).toBe(true);
	});
});

describe('script parameter interpolation', () => {
	it('JSON-encodes interpolated values rather than concatenating them raw', () => {
		const body = extractScriptBody(newsPopupScript("https://example.com/api'; alert(1); //", '/news', null));

		expect(body).toContain('var API_ENDPOINT = "https://example.com/api\'; alert(1); //";');
		expect(() => new Function(body)).not.toThrow();
	});

	it('encodes a null initial story id as a null literal, not the string "null"', () => {
		expect(extractScriptBody(newsPopupScript('https://x/api', '/news', null))).toContain(
			'var INITIAL_STORY_ID = null;',
		);
	});
});

describe('news popup / SIWS contract', () => {
	it('the popup calls the sign-in API that the SIWS script defines', () => {
		// These two inline scripts are independent <script> tags that only meet at this global. If
		// either side renames it the vote button silently stops offering sign-in.
		expect(extractScriptBody(newsPopupScript('https://x/api', '/news', null))).toContain('window.mvSiws');
		expect(extractScriptBody(siwsConnectScript('https://x/api', 'https://x', 'https://cdn/m.png'))).toContain(
			'window.mvSiws = {',
		);
	});

	it('the SIWS script no longer redirects a returning user into the chat app', () => {
		const body = extractScriptBody(siwsConnectScript('https://x/api', 'https://x', 'https://cdn/m.png'));

		expect(body).not.toContain("'/channels/@me'");
		// A brand-new wallet still has to onboard — there's no account to vote as yet.
		expect(body).toContain('ONBOARDING_PATH');
	});
});
