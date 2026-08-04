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
	parseRateLimitCacheState,
	serializeRateLimitCacheState,
} from '@fluxer/rate_limit/src/internal/RateLimitCacheState';

interface CacheEntry<T> {
	value: T;
	expiresAt: number | null;
}

export class InMemoryCacheService {
	private cache = new Map<string, CacheEntry<unknown>>();

	async get<T>(key: string): Promise<T | null> {
		const entry = this.cache.get(key);
		if (!entry) {
			return null;
		}

		if (entry.expiresAt && entry.expiresAt < Date.now()) {
			this.cache.delete(key);
			return null;
		}

		return entry.value as T;
	}

	async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
		const entry: CacheEntry<T> = {
			value,
			expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
		};
		this.cache.set(key, entry as CacheEntry<unknown>);
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	async gcraCheckAndSet(
		key: string,
		nowMs: number,
		emissionIntervalMs: number,
		burstCapacityMs: number,
		limit: number,
		windowMs: number,
	): Promise<{allowed: boolean; tatMs: number}> {
		const entry = this.cache.get(key);
		const raw = entry && (!entry.expiresAt || entry.expiresAt >= Date.now()) ? entry.value : null;
		const state = parseRateLimitCacheState(raw);
		const rawTatMs = state?.tatMs ?? nowMs;

		const effectiveTatMs = Math.max(rawTatMs, nowMs);
		const nextTatMs = effectiveTatMs + emissionIntervalMs;
		const allowAtMs = nextTatMs - burstCapacityMs;

		if (nowMs >= allowAtMs) {
			const ttlMs = nextTatMs - nowMs;
			const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
			this.cache.set(key, {
				value: serializeRateLimitCacheState({tatMs: nextTatMs, limit, windowMs}),
				expiresAt: Date.now() + ttlSeconds * 1000,
			});
			return {allowed: true, tatMs: nextTatMs};
		}

		return {allowed: false, tatMs: rawTatMs};
	}
}
