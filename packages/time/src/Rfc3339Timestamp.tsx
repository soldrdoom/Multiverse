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

function createInvalidRfc3339TimestampError(timestamp: string): Error {
	return new Error(`Invalid RFC3339 timestamp: ${timestamp}`);
}

export function parseRfc3339TimestampToMs(timestamp: string): number {
	const date = new Date(timestamp);
	const parsedTimestampMs = date.getTime();

	if (!Number.isFinite(parsedTimestampMs)) {
		throw createInvalidRfc3339TimestampError(timestamp);
	}

	return parsedTimestampMs;
}

export function formatRfc3339Timestamp(timestampMs: number): string {
	if (!Number.isFinite(timestampMs)) {
		throw new Error(`Invalid timestamp milliseconds: ${timestampMs}`);
	}

	return new Date(timestampMs).toISOString();
}
