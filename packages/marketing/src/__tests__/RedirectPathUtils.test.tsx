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

import {sanitizeInternalRedirectPath} from '@fluxer/marketing/src/RedirectPathUtils';
import {describe, expect, test} from 'vitest';

describe('sanitizeInternalRedirectPath', () => {
	test('allows same-site relative paths', () => {
		expect(sanitizeInternalRedirectPath('/partners')).toBe('/partners');
		expect(sanitizeInternalRedirectPath('/download?channel=canary')).toBe('/download?channel=canary');
		expect(sanitizeInternalRedirectPath('/docs#faq')).toBe('/docs#faq');
	});

	test('rejects absolute and protocol-relative external redirects', () => {
		expect(sanitizeInternalRedirectPath('https://evil.example/path')).toBe('/');
		expect(sanitizeInternalRedirectPath('//evil.example/path')).toBe('/');
		expect(sanitizeInternalRedirectPath('javascript:alert(1)')).toBe('/');
	});

	test('rejects dot-segment paths that normalise into protocol-relative URLs', () => {
		// These pass an origin check and a startsWith('/') check, because URL() only collapses the
		// dot segments afterwards — leaving a pathname of '//evil.example', which reaches c.redirect()
		// as a protocol-relative Location header and leaves the site.
		expect(sanitizeInternalRedirectPath('/..//evil.example')).toBe('/');
		expect(sanitizeInternalRedirectPath('/../..//evil.example')).toBe('/');
		expect(sanitizeInternalRedirectPath('/./..//evil.example')).toBe('/');
		expect(sanitizeInternalRedirectPath('/x/..//evil.example')).toBe('/');
		expect(sanitizeInternalRedirectPath('/..///evil.example')).toBe('/');
	});

	test('still allows dot segments that normalise to an ordinary internal path', () => {
		expect(sanitizeInternalRedirectPath('/x/../partners')).toBe('/partners');
		expect(sanitizeInternalRedirectPath('/./download')).toBe('/download');
	});

	test('normalises blank and relative values to internal paths', () => {
		expect(sanitizeInternalRedirectPath('')).toBe('/');
		expect(sanitizeInternalRedirectPath('   ')).toBe('/');
		expect(sanitizeInternalRedirectPath('download')).toBe('/download');
	});
});
