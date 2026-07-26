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

import type {APIErrorCode} from './types/Api.generated';

/**
 * A non-2xx response from the REST API, carrying the API's machine-readable
 * `code` (from `@fluxer/constants` `APIErrorCodes`, surfaced in the generated
 * `APIErrorCode` union) so callers can branch on e.g. `MISSING_PERMISSIONS`
 * vs `UNKNOWN_CHANNEL` instead of string-matching messages.
 */
export class FluxerApiError extends Error {
	readonly status: number;
	readonly code: APIErrorCode | 'UNKNOWN';
	readonly raw: unknown;

	constructor(status: number, code: APIErrorCode | 'UNKNOWN', message: string, raw: unknown) {
		super(message);
		this.name = 'FluxerApiError';
		this.status = status;
		this.code = code;
		this.raw = raw;
	}
}

/**
 * A fatal gateway condition: the server closed the connection with a code the
 * client must not retry (e.g. 4004 AUTHENTICATION_FAILED for a revoked token).
 * Reconnecting on these turns one misconfiguration into an infinite hot loop,
 * so the GatewayClient emits this and stops instead.
 */
export class FluxerGatewayError extends Error {
	readonly closeCode: number;

	constructor(closeCode: number, message: string) {
		super(message);
		this.name = 'FluxerGatewayError';
		this.closeCode = closeCode;
	}
}
