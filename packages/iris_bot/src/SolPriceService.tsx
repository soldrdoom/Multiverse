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

export interface SolPrice {
	usd: number;
	change24h: number;
}

export interface PriceProvider {
	getSolPrice(): Promise<SolPrice>;
}

const COINGECKO_URL =
	'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true';

// /sol can now fire from any guild channel, not just DMs, so it's cached
// in-memory to stay well under CoinGecko's free-tier rate limit — same
// approach and TTL ballpark as fluxer_server's fetchSolPriceUsd (Routes.tsx).
const CACHE_TTL_MS = 30_000;

export class CoinGeckoPriceProvider implements PriceProvider {
	private cached: {price: SolPrice; expiresAt: number} | null = null;

	async getSolPrice(): Promise<SolPrice> {
		if (this.cached && this.cached.expiresAt > Date.now()) {
			return this.cached.price;
		}

		const res = await fetch(COINGECKO_URL, {headers: {Accept: 'application/json'}});
		if (!res.ok) {
			throw new Error(`CoinGecko request failed with status ${res.status}`);
		}

		const data = (await res.json()) as {solana?: {usd?: number; usd_24h_change?: number}};
		const usd = data.solana?.usd;
		const change24h = data.solana?.usd_24h_change;
		if (typeof usd !== 'number' || usd <= 0 || typeof change24h !== 'number') {
			throw new Error('CoinGecko payload missing SOL price data');
		}

		const price: SolPrice = {usd, change24h};
		this.cached = {price, expiresAt: Date.now() + CACHE_TTL_MS};
		return price;
	}
}
