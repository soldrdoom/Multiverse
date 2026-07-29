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

import {readMarketingResponseAsText, sendMarketingRequest} from '@fluxer/marketing/src/MarketingHttpClient';

export type SolanaChartRange = '1' | '7' | '30';

export interface SolanaMarketSnapshot {
	price: number;
	change24: number;
	cap: number;
	vol: number;
	ath: number;
	low24: number;
	high24: number;
}

export interface SolanaStatsPayload {
	live: boolean;
	range: SolanaChartRange;
	market: SolanaMarketSnapshot | null;
	series: ReadonlyArray<number>;
	tps: number | null;
	tpsSamples: ReadonlyArray<number>;
	epoch: number | null;
	epochPct: number | null;
	epochSlotsRemaining: number | null;
	epochEtaSeconds: number | null;
}

interface SolanaRpcSnapshot {
	tps: number | null;
	tpsSamples: ReadonlyArray<number>;
	epoch: number | null;
	epochPct: number | null;
	epochSlotsRemaining: number | null;
	epochEtaSeconds: number | null;
}

const COINGECKO_COIN_URL =
	'https://api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&community_data=false&developer_data=false';
const COINGECKO_CHART_BASE_URL = 'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

const MARKET_TTL_MS = 30_000;
// Chart data is hourly/daily-granularity upstream; refreshing it slowly keeps the
// free CoinGecko tier well under its rate limit while price stays on the 30s cadence.
const CHART_TTL_MS: Record<SolanaChartRange, number> = {
	'1': 60_000,
	'7': 300_000,
	'30': 300_000,
};
const RPC_TTL_MS = 3_000;
const LIVE_WINDOW_MS = 90_000;
const COLD_RETRY_MS = 10_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const CHART_TARGET_POINTS = 90;
const PERFORMANCE_SAMPLE_COUNT = 24;
const SOLANA_SLOT_TIME_SECONDS = 0.4;

interface CacheSlot<T> {
	value: T | null;
	fetchedAt: number;
	lastAttemptAt: number;
	inflight: Promise<void> | null;
}

function createSlot<T>(): CacheSlot<T> {
	return {value: null, fetchedAt: 0, lastAttemptAt: 0, inflight: null};
}

async function readSlot<T>(slot: CacheSlot<T>, ttlMs: number, fetcher: () => Promise<T>): Promise<T | null> {
	const now = Date.now();
	const attemptIntervalMs = slot.value === null ? Math.min(ttlMs, COLD_RETRY_MS) : ttlMs;
	if (!slot.inflight && now - slot.lastAttemptAt >= attemptIntervalMs) {
		slot.lastAttemptAt = now;
		slot.inflight = fetcher()
			.then((value) => {
				slot.value = value;
				slot.fetchedAt = Date.now();
			})
			.catch(() => {})
			.finally(() => {
				slot.inflight = null;
			});
	}
	if (slot.value === null && slot.inflight) {
		await slot.inflight;
	}
	return slot.value;
}

function isSlotLive(slot: CacheSlot<unknown>, ttlMs: number): boolean {
	const windowMs = Math.max(LIVE_WINDOW_MS, ttlMs * 3);
	return slot.value !== null && Date.now() - slot.fetchedAt <= windowMs;
}

async function fetchJson(url: string, body?: unknown): Promise<unknown> {
	const response = await sendMarketingRequest({
		url,
		method: body === undefined ? 'GET' : 'POST',
		body,
		timeout: UPSTREAM_TIMEOUT_MS,
		serviceName: 'marketing_solana_stats',
	});
	const text = await readMarketingResponseAsText(response.stream);
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Upstream request failed with status ${response.status}`);
	}
	return JSON.parse(text) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function asArray(value: unknown): ReadonlyArray<unknown> | null {
	return Array.isArray(value) ? value : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function usdValue(container: Record<string, unknown> | null, key: string): number | null {
	const record = asRecord(container?.[key]);
	return asNumber(record?.['usd']);
}

async function fetchMarketSnapshot(): Promise<SolanaMarketSnapshot> {
	const payload = asRecord(await fetchJson(COINGECKO_COIN_URL));
	const marketData = asRecord(payload?.['market_data']);
	if (!marketData) {
		throw new Error('CoinGecko coin payload missing market_data');
	}

	const price = usdValue(marketData, 'current_price');
	const change24 = asNumber(marketData['price_change_percentage_24h']);
	const cap = usdValue(marketData, 'market_cap');
	const vol = usdValue(marketData, 'total_volume');
	const ath = usdValue(marketData, 'ath');
	const low24 = usdValue(marketData, 'low_24h');
	const high24 = usdValue(marketData, 'high_24h');
	if (price === null || cap === null || vol === null || ath === null || low24 === null || high24 === null) {
		throw new Error('CoinGecko coin payload incomplete');
	}

	return {price, change24: change24 ?? 0, cap, vol, ath, low24, high24};
}

function downsample(points: ReadonlyArray<number>, targetCount: number): ReadonlyArray<number> {
	const stride = Math.max(1, Math.floor(points.length / targetCount));
	return points.filter((_, index) => index % stride === 0);
}

async function fetchChartSeries(range: SolanaChartRange): Promise<ReadonlyArray<number>> {
	const payload = asRecord(await fetchJson(`${COINGECKO_CHART_BASE_URL}${range}`));
	const prices = asArray(payload?.['prices']);
	const points: Array<number> = [];
	for (const entry of prices ?? []) {
		const pair = asArray(entry);
		const value = pair ? asNumber(pair[1]) : null;
		if (value !== null) {
			points.push(value);
		}
	}
	if (points.length < 4) {
		throw new Error('CoinGecko chart payload too small');
	}
	return downsample(points, CHART_TARGET_POINTS);
}

function sampleTps(sample: unknown): number | null {
	const record = asRecord(sample);
	if (!record) {
		return null;
	}
	const period = asNumber(record['samplePeriodSecs']);
	if (period === null || period <= 0) {
		return null;
	}
	const transactionCount = asNumber(record['numNonVoteTransactions']) ?? asNumber(record['numTransactions']);
	if (transactionCount === null) {
		return null;
	}
	return transactionCount / period;
}

async function fetchRpcSnapshot(): Promise<SolanaRpcSnapshot> {
	const [samplesPayload, epochPayload] = await Promise.all([
		fetchJson(SOLANA_RPC_URL, {
			jsonrpc: '2.0',
			id: 1,
			method: 'getRecentPerformanceSamples',
			params: [PERFORMANCE_SAMPLE_COUNT],
		}),
		fetchJson(SOLANA_RPC_URL, {jsonrpc: '2.0', id: 2, method: 'getEpochInfo'}),
	]);

	const rawSamples = asArray(asRecord(samplesPayload)?.['result']) ?? [];
	const tpsSamples: Array<number> = [];
	// The RPC returns samples newest-first; the throughput chart reads oldest -> newest.
	for (let index = rawSamples.length - 1; index >= 0; index -= 1) {
		const tps = sampleTps(rawSamples[index]);
		if (tps !== null) {
			tpsSamples.push(tps);
		}
	}
	const latestTps = tpsSamples.length > 0 ? (tpsSamples[tpsSamples.length - 1] ?? null) : null;

	const epochInfo = asRecord(asRecord(epochPayload)?.['result']);
	const epoch = asNumber(epochInfo?.['epoch']);
	const slotIndex = asNumber(epochInfo?.['slotIndex']);
	const slotsInEpoch = asNumber(epochInfo?.['slotsInEpoch']);

	let epochPct: number | null = null;
	let epochSlotsRemaining: number | null = null;
	let epochEtaSeconds: number | null = null;
	if (slotIndex !== null && slotsInEpoch !== null && slotsInEpoch > 0) {
		epochPct = Math.min(100, Math.max(0, (slotIndex / slotsInEpoch) * 100));
		epochSlotsRemaining = Math.max(0, slotsInEpoch - slotIndex);
		epochEtaSeconds = epochSlotsRemaining * SOLANA_SLOT_TIME_SECONDS;
	}

	if (tpsSamples.length === 0 && epoch === null) {
		throw new Error('Solana RPC payload empty');
	}

	return {tps: latestTps, tpsSamples, epoch, epochPct, epochSlotsRemaining, epochEtaSeconds};
}

const coinSlot = createSlot<SolanaMarketSnapshot>();
const chartSlots: Record<SolanaChartRange, CacheSlot<ReadonlyArray<number>>> = {
	'1': createSlot(),
	'7': createSlot(),
	'30': createSlot(),
};
const rpcSlot = createSlot<SolanaRpcSnapshot>();

export function parseSolanaChartRange(value: string | undefined): SolanaChartRange {
	if (value === '1' || value === '30') {
		return value;
	}
	return '7';
}

export async function getSolanaStats(range: SolanaChartRange): Promise<SolanaStatsPayload> {
	const chartSlot = chartSlots[range];
	const chartTtlMs = CHART_TTL_MS[range];
	const [market, series, rpc] = await Promise.all([
		readSlot(coinSlot, MARKET_TTL_MS, fetchMarketSnapshot),
		readSlot(chartSlot, chartTtlMs, () => fetchChartSeries(range)),
		readSlot(rpcSlot, RPC_TTL_MS, fetchRpcSnapshot),
	]);

	return {
		live: isSlotLive(coinSlot, MARKET_TTL_MS) && isSlotLive(chartSlot, chartTtlMs),
		range,
		market,
		series: series ?? [],
		tps: rpc?.tps ?? null,
		tpsSamples: rpc?.tpsSamples ?? [],
		epoch: rpc?.epoch ?? null,
		epochPct: rpc?.epochPct ?? null,
		epochSlotsRemaining: rpc?.epochSlotsRemaining ?? null,
		epochEtaSeconds: rpc?.epochEtaSeconds ?? null,
	};
}
