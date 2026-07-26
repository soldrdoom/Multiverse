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

import {noopLogger, type SdkLogger} from '../Logger';

/**
 * Client-side rate limiting. The API emits `X-RateLimit-Limit`,
 * `X-RateLimit-Remaining` and `X-RateLimit-Reset` (unix seconds) on every
 * response, and `Retry-After` (seconds) plus a `{retry_after, global}` body on
 * 429 (`packages/api/src/middleware/RateLimitMiddleware.tsx:88-102`).
 *
 * Requests are strictly serialized per bucket: one in flight at a time, each
 * waiting out any known block before executing. A 429 is waited out and
 * retried (bounded); this is safe because a 429 means the request was never
 * executed. Contrast with iris_bot's `RestClient.sendMessage`, which logged
 * the 429 and dropped the message on the floor.
 */

interface Bucket {
	tail: Promise<void>;
	blockedUntilMs: number;
}

export interface RateLimiterOptions {
	logger?: SdkLogger;
	max429Retries?: number;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private globalBlockedUntilMs = 0;
	private readonly log: SdkLogger;
	private readonly max429Retries: number;
	private readonly now: () => number;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(options: RateLimiterOptions = {}) {
		this.log = options.logger ?? noopLogger;
		this.max429Retries = options.max429Retries ?? 3;
		this.now = options.now ?? Date.now;
		this.sleep = options.sleep ?? defaultSleep;
	}

	/**
	 * Execute `task` under the given bucket key, serialized with every other
	 * request in that bucket, waiting out known rate-limit windows and bounded
	 * 429 retries. Returns the final response (which may still be a 429 if
	 * retries were exhausted — the caller decides how to surface it).
	 */
	async execute(bucketKey: string, task: () => Promise<Response>): Promise<Response> {
		const bucket = this.getBucket(bucketKey);
		const run = bucket.tail.then(() => this.runWithRetries(bucket, bucketKey, task));
		bucket.tail = run.then(
			() => {},
			() => {},
		);
		return run;
	}

	private getBucket(bucketKey: string): Bucket {
		let bucket = this.buckets.get(bucketKey);
		if (!bucket) {
			bucket = {tail: Promise.resolve(), blockedUntilMs: 0};
			this.buckets.set(bucketKey, bucket);
		}
		return bucket;
	}

	private async runWithRetries(bucket: Bucket, bucketKey: string, task: () => Promise<Response>): Promise<Response> {
		let response: Response;
		let attempt = 0;
		for (;;) {
			await this.waitForWindow(bucket);
			response = await task();
			this.recordHeaders(bucket, response);
			if (response.status !== 429) {
				return response;
			}
			const {retryAfterMs, global} = await this.parse429(response);
			if (global) {
				this.globalBlockedUntilMs = Math.max(this.globalBlockedUntilMs, this.now() + retryAfterMs);
			} else {
				bucket.blockedUntilMs = Math.max(bucket.blockedUntilMs, this.now() + retryAfterMs);
			}
			if (attempt >= this.max429Retries) {
				this.log.warn({bucketKey, attempt}, 'Rate limit retries exhausted');
				return response;
			}
			attempt += 1;
			this.log.info({bucketKey, retryAfterMs, global, attempt}, 'Rate limited; waiting before retry');
		}
	}

	private async waitForWindow(bucket: Bucket): Promise<void> {
		const waitMs = Math.max(bucket.blockedUntilMs, this.globalBlockedUntilMs) - this.now();
		if (waitMs > 0) {
			await this.sleep(waitMs);
		}
	}

	private recordHeaders(bucket: Bucket, response: Response): void {
		const remaining = response.headers.get('X-RateLimit-Remaining');
		const reset = response.headers.get('X-RateLimit-Reset');
		if (remaining !== null && reset !== null && Number.parseInt(remaining, 10) === 0) {
			const resetMs = Number.parseInt(reset, 10) * 1000;
			if (Number.isFinite(resetMs)) {
				bucket.blockedUntilMs = Math.max(bucket.blockedUntilMs, resetMs);
			}
		}
	}

	private async parse429(response: Response): Promise<{retryAfterMs: number; global: boolean}> {
		let retryAfterSeconds: number | null = null;
		const header = response.headers.get('Retry-After');
		if (header !== null) {
			const parsed = Number.parseFloat(header);
			if (Number.isFinite(parsed)) retryAfterSeconds = parsed;
		}
		let global = false;
		try {
			const body = (await response.clone().json()) as {retry_after?: number; global?: boolean};
			if (retryAfterSeconds === null && typeof body.retry_after === 'number') {
				retryAfterSeconds = body.retry_after;
			}
			global = body.global === true;
		} catch {
			// Body is not JSON; fall back to the header alone.
		}
		return {retryAfterMs: Math.max(0, (retryAfterSeconds ?? 1) * 1000), global};
	}
}
