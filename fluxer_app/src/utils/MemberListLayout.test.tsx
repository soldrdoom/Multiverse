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

import {
	buildMemberListLayout,
	getMemberIndexForRow,
	getMemberIndexRangeForRowRange,
	getRowIndexForMemberIndex,
	getRowIndexRangeForMemberIndexRange,
	getTotalRowsFromLayout,
} from '@app/utils/MemberListLayout';
import {describe, expect, test} from 'vitest';

describe('MemberListLayout', () => {
	test('builds row and member indices for group layouts', () => {
		const layouts = buildMemberListLayout([
			{id: 'online', count: 2},
			{id: 'offline', count: 1},
		]);

		expect(layouts).toHaveLength(2);
		expect(layouts[0]?.headerRowIndex).toBe(0);
		expect(layouts[0]?.memberStartIndex).toBe(0);
		expect(layouts[0]?.memberEndIndex).toBe(1);
		expect(layouts[1]?.headerRowIndex).toBe(3);
		expect(layouts[1]?.memberStartIndex).toBe(2);
		expect(layouts[1]?.memberEndIndex).toBe(2);
		expect(getTotalRowsFromLayout(layouts)).toBe(5);
	});

	test('maps row indices to member indices', () => {
		const layouts = buildMemberListLayout([
			{id: 'online', count: 2},
			{id: 'offline', count: 1},
		]);

		expect(getMemberIndexForRow(layouts, 0, 'forward')).toBe(0);
		expect(getMemberIndexForRow(layouts, 1, 'forward')).toBe(0);
		expect(getMemberIndexForRow(layouts, 2, 'forward')).toBe(1);
		expect(getMemberIndexForRow(layouts, 3, 'forward')).toBe(2);
	});

	test('derives member index ranges from row ranges', () => {
		const layouts = buildMemberListLayout([
			{id: 'online', count: 1},
			{id: 'offline', count: 2},
		]);

		expect(getMemberIndexRangeForRowRange(layouts, 0, 2)).toEqual([0, 0]);
		expect(getMemberIndexRangeForRowRange(layouts, 1, 4)).toEqual([0, 2]);
	});

	test('maps member indices back to row indices', () => {
		const layouts = buildMemberListLayout([
			{id: 'online', count: 2},
			{id: 'offline', count: 1},
		]);

		expect(getRowIndexForMemberIndex(layouts, 0)).toBe(1);
		expect(getRowIndexForMemberIndex(layouts, 1)).toBe(2);
		expect(getRowIndexForMemberIndex(layouts, 2)).toBe(4);
	});

	test('derives row index ranges from member ranges', () => {
		const layouts = buildMemberListLayout([
			{id: 'online', count: 1},
			{id: 'offline', count: 2},
		]);

		expect(getRowIndexRangeForMemberIndexRange(layouts, 0, 0)).toEqual([1, 1]);
		expect(getRowIndexRangeForMemberIndexRange(layouts, 0, 2)).toEqual([1, 4]);
	});

	test('allocates a header row for a zero-count group instead of skipping it', () => {
		// Reproduces a real guild's group layout: two single-member role groups,
		// an empty "online" bucket (everyone with no hoisted role happens to be
		// offline), then "offline". The server allocates one row per group
		// header regardless of count, so the client's row-index space must too,
		// or every row at/after the empty group shifts by one and the last
		// member falls out of totalRows entirely.
		const layouts = buildMemberListLayout([
			{id: 'role-a', count: 1},
			{id: 'role-b', count: 1},
			{id: 'online', count: 0},
			{id: 'offline', count: 5},
		]);

		expect(layouts).toHaveLength(4);

		// role-a: header row 0, member row 1
		expect(layouts[0]).toMatchObject({headerRowIndex: 0, memberStartIndex: 0, memberEndIndex: 0, rowEndIndex: 1});
		// role-b: header row 2, member row 3
		expect(layouts[1]).toMatchObject({headerRowIndex: 2, memberStartIndex: 1, memberEndIndex: 1, rowEndIndex: 3});
		// online: header row 4 only, no member rows, no member-index slots consumed
		expect(layouts[2]).toMatchObject({headerRowIndex: 4, memberStartIndex: 2, memberEndIndex: 1, rowEndIndex: 4});
		// offline: header row 5, members at rows 6-10
		expect(layouts[3]).toMatchObject({headerRowIndex: 5, memberStartIndex: 2, memberEndIndex: 6, rowEndIndex: 10});

		// 4 headers + 7 members = 11 rows total (indices 0-10)
		expect(getTotalRowsFromLayout(layouts)).toBe(11);

		// The last offline member (global member index 6) must land on row 10,
		// not fall outside totalRows.
		expect(getRowIndexForMemberIndex(layouts, 6)).toBe(10);
		expect(getMemberIndexForRow(layouts, 10, 'forward')).toBe(6);
	});
});
