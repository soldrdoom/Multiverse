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

import {AdminRepository} from '@fluxer/api/src/admin/AdminRepository';
import {Config} from '@fluxer/api/src/Config';
import {IP_BAN_REFRESH_CHANNEL} from '@fluxer/api/src/constants/IpBan';
import {Logger} from '@fluxer/api/src/Logger';
import type {HonoEnv} from '@fluxer/api/src/types/HonoEnv';
import {parseIpBanEntry, tryParseSingleIp} from '@fluxer/api/src/utils/IpRangeUtils';
import {IpBannedError} from '@fluxer/errors/src/domains/moderation/IpBannedError';
import {extractClientIp} from '@fluxer/ip_utils/src/ClientIp';
import type {IpAddressFamily} from '@fluxer/ip_utils/src/IpAddress';
import type {IKVProvider, IKVSubscription} from '@fluxer/kv_client/src/IKVProvider';
import {createMiddleware} from 'hono/factory';

type FamilyMap<T> = Record<IpAddressFamily, Map<string, T>>;

interface SingleCacheEntry {
	value: bigint;
	count: number;
}

interface RangeCacheEntry {
	start: bigint;
	end: bigint;
	count: number;
}

class IpBanCache {
	private singleIpBans: FamilyMap<SingleCacheEntry>;
	private rangeIpBans: FamilyMap<RangeCacheEntry>;
	private isInitialized = false;
	private adminRepository = new AdminRepository();
	private consecutiveFailures = 0;
	private maxConsecutiveFailures = 5;
	private kvClient: IKVProvider | null = null;
	private kvSubscription: IKVSubscription | null = null;
	private subscriberInitialized = false;

	constructor() {
		this.singleIpBans = this.createFamilyMaps();
		this.rangeIpBans = this.createFamilyMaps();
	}

	setRefreshSubscriber(kvClient: IKVProvider | null): void {
		this.kvClient = kvClient;
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		await this.refresh();
		this.isInitialized = true;
		this.setupSubscriber();
	}

	private setupSubscriber(): void {
		if (this.subscriberInitialized || !this.kvClient) {
			return;
		}

		const subscription = this.kvClient.duplicate();
		this.kvSubscription = subscription;

		subscription
			.connect()
			.then(() => subscription.subscribe(IP_BAN_REFRESH_CHANNEL))
			.then(() => {
				subscription.on('message', (channel) => {
					if (channel === IP_BAN_REFRESH_CHANNEL) {
						this.refresh().catch((err) => {
							this.consecutiveFailures++;
							const message = err instanceof Error ? err.message : String(err);
							if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
								Logger.error({error: message}, 'Failed to refresh IP ban cache after notification');
							} else {
								Logger.warn({error: message}, 'Failed to refresh IP ban cache after notification');
							}
						});
					}
				});
			})
			.catch((error) => {
				Logger.error({error}, 'Failed to subscribe to IP ban refresh channel');
			});

		this.subscriberInitialized = true;
	}

	async refresh(): Promise<void> {
		const ips = await this.adminRepository.listBannedIps();
		this.resetCaches();
		for (const ip of ips) {
			this.addEntry(ip);
		}
		this.consecutiveFailures = 0;
	}

	isBanned(ip: string): boolean {
		const parsed = tryParseSingleIp(ip);
		if (!parsed) return false;

		const singleMap = this.singleIpBans[parsed.family];
		if (singleMap.has(parsed.canonical)) {
			return true;
		}

		const rangeMap = this.rangeIpBans[parsed.family];
		for (const range of rangeMap.values()) {
			if (parsed.value >= range.start && parsed.value <= range.end) {
				return true;
			}
		}

		return false;
	}

	ban(ip: string): void {
		this.addEntry(ip);
	}

	unban(ip: string): void {
		this.removeEntry(ip);
	}

	resetCaches(): void {
		this.singleIpBans = this.createFamilyMaps();
		this.rangeIpBans = this.createFamilyMaps();
	}

	private createFamilyMaps<T>(): FamilyMap<T> {
		return {
			ipv4: new Map(),
			ipv6: new Map(),
		};
	}

	private addEntry(value: string): void {
		const parsed = parseIpBanEntry(value);
		if (!parsed) {
			Logger.warn({value}, 'Skipping invalid IP ban entry');
			return;
		}

		if (parsed.type === 'single') {
			const map = this.singleIpBans[parsed.family];
			const existing = map.get(parsed.canonical);
			if (existing) {
				existing.count += 1;
			} else {
				map.set(parsed.canonical, {value: parsed.value, count: 1});
			}
		} else {
			const map = this.rangeIpBans[parsed.family];
			const existing = map.get(parsed.canonical);
			if (existing) {
				existing.count += 1;
			} else {
				map.set(parsed.canonical, {start: parsed.start, end: parsed.end, count: 1});
			}
		}
	}

	private removeEntry(value: string): void {
		const parsed = parseIpBanEntry(value);
		if (!parsed) return;

		if (parsed.type === 'single') {
			const map = this.singleIpBans[parsed.family];
			const existing = map.get(parsed.canonical);
			if (!existing) return;
			if (existing.count <= 1) {
				map.delete(parsed.canonical);
			} else {
				existing.count -= 1;
			}
		} else {
			const map = this.rangeIpBans[parsed.family];
			const existing = map.get(parsed.canonical);
			if (!existing) return;
			if (existing.count <= 1) {
				map.delete(parsed.canonical);
			} else {
				existing.count -= 1;
			}
		}
	}

	shutdown(): void {
		if (this.kvSubscription) {
			this.kvSubscription.disconnect();
			this.kvSubscription = null;
		}
	}
}

export const ipBanCache = new IpBanCache();

/**
 * Deliberately fails OPEN when no client IP can be resolved, and that is not an oversight.
 *
 * `extractClientIp` is headers-only (`packages/ip_utils/src/ClientIp.tsx` — X-Real-IP, then the
 * rightmost X-Forwarded-For entry, then CF-Connecting-IP if trusted); there is no socket-peer
 * fallback. So callers that legitimately reach this process without going through nginx resolve to
 * `null` — for example this app's own health route (`MiddlewarePipeline.tsx`, reachable as
 * `/api/_health`), which sets none of those headers and returns 200 today.
 *
 * Note the container health check is NOT such a caller, despite the obvious guess: `compose.yaml`'s
 * `curl -fsS http://127.0.0.1:8080/_health` hits the health route on the OUTER server app
 * (`fluxer_server/src/Routes.tsx`), which is not this pipeline — the API app is mounted under `/api`
 * only, and this middleware has exactly one registration site. The two are distinct handlers: the
 * outer one returns a JSON document, `/api/_health` returns plain `OK`.
 *
 * The load-bearing argument is not any single caller but that `routes.use(IpBanMiddleware)` is bare:
 * no exempt-path list, no config flag. Turning this into a hard failure would drop header-less
 * traffic unconditionally, in every deployment — including `devenv up` with no proxy in front.
 *
 * Presence of a client IP is therefore enforced in exactly one place, `RequireXForwardedForMiddleware`,
 * which has both (an exempt list covering `/_health`, and `proxy.require_forwarded_for`, off by
 * default). That middleware is registered immediately ahead of this one in
 * `packages/api/src/app/MiddlewarePipeline.tsx`, so when the flag IS on, an unresolvable IP is
 * rejected before this check is reached and the fail-open branch below is unreachable. When the flag
 * is off, fail-open is the intended behaviour: an operator who has not opted in must not have
 * header-less traffic dropped.
 */
export const IpBanMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	const clientIp = extractClientIp(ctx.req.raw, {trustCfConnectingIp: Config.proxy.trust_cf_connecting_ip});

	if (clientIp && ipBanCache.isBanned(clientIp)) {
		throw new IpBannedError();
	}

	await next();
});
