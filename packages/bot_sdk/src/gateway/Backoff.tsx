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

/**
 * Full-jitter exponential backoff: `random(0, min(capMs, baseMs * 2**attempt))`.
 *
 * Full jitter (rather than a fixed delay like iris_bot's 3s constant, or
 * equal/decorrelated jitter) is deliberate: when a recovering gateway drops
 * every bot at once, a fixed delay reconnects the whole herd in lockstep and
 * keeps the gateway down. Randomizing across the entire window spreads the
 * retry load evenly.
 *
 * The first attempt draws from (0, baseMs], which matters for RESUME: the
 * server only holds a disconnected session for 10 seconds
 * (fluxer_gateway/src/session/session_monitor.erl:61), so early attempts must
 * stay well inside that window.
 */
export class Backoff {
	private attemptCount = 0;

	constructor(
		private readonly baseMs: number = 1_000,
		private readonly capMs: number = 60_000,
		private readonly random: () => number = Math.random,
	) {}

	get attempt(): number {
		return this.attemptCount;
	}

	/** Returns the next delay in milliseconds and advances the attempt counter. */
	next(): number {
		const ceiling = Math.min(this.capMs, this.baseMs * 2 ** this.attemptCount);
		this.attemptCount += 1;
		return this.random() * ceiling;
	}

	/** Reset on success (READY or RESUMED), so the next failure starts small again. */
	reset(): void {
		this.attemptCount = 0;
	}
}
