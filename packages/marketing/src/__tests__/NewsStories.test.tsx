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

import {buildStoryPreview, splitStoryParagraphs} from '@fluxer/marketing/src/news/NewsStories';
import {describe, expect, it} from 'vitest';

describe('splitStoryParagraphs', () => {
	it('splits on blank lines', () => {
		expect(splitStoryParagraphs('First para.\n\nSecond para.')).toEqual(['First para.', 'Second para.']);
	});

	it('handles CRLF line endings', () => {
		expect(splitStoryParagraphs('First.\r\n\r\nSecond.')).toEqual(['First.', 'Second.']);
	});

	it('keeps single newlines inside one paragraph', () => {
		expect(splitStoryParagraphs('Line one\nline two')).toEqual(['Line one\nline two']);
	});

	it('drops blank runs rather than emitting empty paragraphs', () => {
		expect(splitStoryParagraphs('A.\n\n\n\n   \n\nB.')).toEqual(['A.', 'B.']);
	});

	it('returns no paragraphs for an empty body', () => {
		expect(splitStoryParagraphs('   ')).toEqual([]);
	});
});

describe('buildStoryPreview', () => {
	it('returns short bodies unchanged', () => {
		expect(buildStoryPreview('A short story.')).toBe('A short story.');
	});

	it('collapses newlines and repeated whitespace into single spaces', () => {
		expect(buildStoryPreview('First para.\n\nSecond    para.')).toBe('First para. Second para.');
	});

	it('truncates long bodies on a word boundary with an ellipsis', () => {
		const body = `${'word '.repeat(200)}end`;
		const preview = buildStoryPreview(body);

		expect(preview.length).toBeLessThanOrEqual(221);
		expect(preview.endsWith('…')).toBe(true);
		expect(preview).not.toContain('  ');
		// Cut on a boundary: the character before the ellipsis is the end of a whole word.
		expect(preview.slice(-5)).toBe('word…');
	});

	it('still truncates when the body has no spaces to break on', () => {
		const preview = buildStoryPreview('x'.repeat(500));

		expect(preview.length).toBe(221);
		expect(preview.endsWith('…')).toBe(true);
	});
});
