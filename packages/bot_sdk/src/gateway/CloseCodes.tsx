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

import {GatewayCloseCodes} from '@fluxer/constants/src/GatewayConstants';

/**
 * Close-code classification. The authority for the numeric values is the
 * Erlang gateway (`fluxer_gateway/src/utils/constants.erl:76-89`,
 * `close_code_to_num/1`), mirrored by `@fluxer/constants` `GatewayCloseCodes`
 * and documented in `fluxer_docs/gateway/close_codes.mdx`. These are Fluxer's
 * codes, read from source — not Discord's table.
 */

/**
 * 4013 is emitted by the Erlang gateway (`constants.erl`,
 * `close_code_to_num(ack_backpressure)`) when the socket falls too far behind
 * on acks. The session may still be resumable, so it classifies as `resume`.
 */
export const ACK_BACKPRESSURE_CLOSE_CODE = GatewayCloseCodes.ACK_BACKPRESSURE;

/**
 * 4014 (`close_code_to_num(session_revoked)`): the credential that opened the
 * session was revoked (e.g. a bot token was revoked or rotated). Fatal — the
 * token cannot open or resume a session, so reconnecting would hot-loop.
 */
export const SESSION_REVOKED_CLOSE_CODE = GatewayCloseCodes.SESSION_REVOKED;

export type CloseDisposition = 'fatal' | 'fresh-identify' | 'resume';

const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
	// The token is invalid or revoked. Reconnecting turns a revoked token into
	// an infinite hot loop (the exact iris_bot GatewayClient defect).
	GatewayCloseCodes.AUTHENTICATION_FAILED,
	SESSION_REVOKED_CLOSE_CODE,
	// Shard/version problems are configuration errors; retrying cannot fix them.
	GatewayCloseCodes.INVALID_SHARD,
	GatewayCloseCodes.SHARDING_REQUIRED,
	GatewayCloseCodes.INVALID_API_VERSION,
]);

const FRESH_IDENTIFY_CLOSE_CODES: ReadonlySet<number> = new Set([
	// The server rejected our sequence (`gateway_handler.erl` closes with
	// invalid_seq on a bad RESUME seq or heartbeat ack) — the session state we
	// hold is wrong, so drop it and IDENTIFY fresh.
	GatewayCloseCodes.INVALID_SEQ,
	// "Session timed out; reconnect and start a new one" (close_codes.mdx) —
	// the server-side session is gone, RESUME cannot succeed.
	GatewayCloseCodes.SESSION_TIMEOUT,
]);

/**
 * Classify a WebSocket close code:
 *
 * - `fatal` — do not reconnect; surface an error and stop.
 * - `fresh-identify` — reconnect (with backoff) but discard session state and
 *   send IDENTIFY.
 * - `resume` — reconnect (with backoff) and send RESUME if session state
 *   exists. This is the default for transport-level closes (1000-1015) and the
 *   recoverable 4xxx codes (4000-4003, 4005, 4008, 4013).
 */
export function classifyCloseCode(code: number): CloseDisposition {
	if (FATAL_CLOSE_CODES.has(code)) {
		return 'fatal';
	}
	if (FRESH_IDENTIFY_CLOSE_CODES.has(code)) {
		return 'fresh-identify';
	}
	return 'resume';
}
