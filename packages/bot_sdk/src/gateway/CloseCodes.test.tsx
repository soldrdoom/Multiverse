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

import {describe, expect, it} from 'vitest';
import {classifyCloseCode} from './CloseCodes';

describe('classifyCloseCode', () => {
	// Numeric values verified against the Erlang authority:
	// fluxer_gateway/src/utils/constants.erl close_code_to_num/1.
	it('classifies fatal codes (never reconnect)', () => {
		expect(classifyCloseCode(4004)).toBe('fatal'); // AUTHENTICATION_FAILED
		expect(classifyCloseCode(4010)).toBe('fatal'); // INVALID_SHARD
		expect(classifyCloseCode(4011)).toBe('fatal'); // SHARDING_REQUIRED
		expect(classifyCloseCode(4012)).toBe('fatal'); // INVALID_API_VERSION
		expect(classifyCloseCode(4014)).toBe('fatal'); // SESSION_REVOKED
	});

	it('classifies fresh-identify codes (session state is dead)', () => {
		expect(classifyCloseCode(4007)).toBe('fresh-identify'); // INVALID_SEQ
		expect(classifyCloseCode(4009)).toBe('fresh-identify'); // SESSION_TIMEOUT
	});

	it('classifies recoverable 4xxx codes as resume-eligible', () => {
		expect(classifyCloseCode(4000)).toBe('resume'); // UNKNOWN_ERROR
		expect(classifyCloseCode(4001)).toBe('resume'); // UNKNOWN_OPCODE
		expect(classifyCloseCode(4002)).toBe('resume'); // DECODE_ERROR
		expect(classifyCloseCode(4003)).toBe('resume'); // NOT_AUTHENTICATED
		expect(classifyCloseCode(4005)).toBe('resume'); // ALREADY_AUTHENTICATED
		expect(classifyCloseCode(4008)).toBe('resume'); // RATE_LIMITED
		expect(classifyCloseCode(4013)).toBe('resume'); // ACK_BACKPRESSURE
	});

	it('classifies transport-level closes as resume-eligible', () => {
		expect(classifyCloseCode(1000)).toBe('resume');
		expect(classifyCloseCode(1001)).toBe('resume');
		expect(classifyCloseCode(1006)).toBe('resume'); // abnormal closure (killed socket)
		expect(classifyCloseCode(1011)).toBe('resume');
	});
});
