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

import type {ICacheService} from '@fluxer/cache/src/ICacheService';
import {fetchGatingAssetsForWallet, type GatingAsset, matchesTokenGate} from '@fluxer/solana_das/src/NftFetcher';
import {seconds} from 'itty-time';

export type TokenGateCheckResult = 'satisfied' | 'unsatisfied' | 'unavailable';

const GATE_RESULT_TTL = seconds('10 minutes');
const WALLET_ASSETS_TTL = seconds('5 minutes');

/**
 * Evaluates and caches "does wallet W satisfy tokengate G" for channel/category
 * access checks. Deliberately separate from the unfiltered, display-shaped
 * NFT cache used by the cosmetics picker (`nfts:${owner}`, fluxer_server's
 * `GET /v1/nfts`): this one stores only the minimal fields needed to match a
 * gate, is checked far more often (every channel view vs. an occasional
 * picker open), and never caches a failure (`'unavailable'`) so a transient
 * DAS outage self-heals on the next check instead of being pinned for the
 * full TTL.
 */
export class TokenGateCacheService {
	constructor(
		private readonly cacheService: ICacheService,
		private readonly dasUrl: string | null,
	) {}

	async check({
		wallet,
		gateAddress,
		matchMode,
	}: {
		wallet: string;
		gateAddress: string;
		matchMode: number;
	}): Promise<TokenGateCheckResult> {
		const resultKey = this.resultCacheKey(wallet, gateAddress, matchMode);
		const cached = await this.cacheService.get<TokenGateCheckResult>(resultKey);
		if (cached !== null) return cached;

		if (!this.dasUrl) return 'unavailable';

		let assets: Array<GatingAsset>;
		try {
			assets = await this.getWalletAssets(wallet, this.dasUrl);
		} catch {
			return 'unavailable';
		}

		const result: TokenGateCheckResult = matchesTokenGate(assets, gateAddress, matchMode) ? 'satisfied' : 'unsatisfied';
		await this.cacheService.set(resultKey, result, GATE_RESULT_TTL);
		return result;
	}

	/** Bust cached state for one wallet so the next `check` re-fetches from DAS. */
	async invalidate({
		wallet,
		gateAddress,
		matchMode,
	}: {
		wallet: string;
		gateAddress: string;
		matchMode: number;
	}): Promise<void> {
		await this.cacheService.delete(this.resultCacheKey(wallet, gateAddress, matchMode));
		await this.cacheService.delete(this.walletAssetsCacheKey(wallet));
	}

	private async getWalletAssets(wallet: string, dasUrl: string): Promise<Array<GatingAsset>> {
		const key = this.walletAssetsCacheKey(wallet);
		const cached = await this.cacheService.get<Array<GatingAsset>>(key);
		if (cached !== null) return cached;

		const assets = await fetchGatingAssetsForWallet(wallet, dasUrl);
		await this.cacheService.set(key, assets, WALLET_ASSETS_TTL);
		return assets;
	}

	private resultCacheKey(wallet: string, gateAddress: string, matchMode: number): string {
		return `token_gate:${wallet}:${gateAddress}:${matchMode}`;
	}

	private walletAssetsCacheKey(wallet: string): string {
		return `token_gate_wallet_nfts:${wallet}`;
	}
}
