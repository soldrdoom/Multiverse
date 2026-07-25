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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import {HttpError} from '@app/lib/HttpError';
import {Logger} from '@app/lib/Logger';
import {NftStickerRecord} from '@app/records/NftStickerRecord';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('NftStickerStore');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** The `/v1/nfts` route reports failures as `{error: string}`, not the `{message}` shape used elsewhere. */
function getServerErrorMessage(e: unknown): string | undefined {
	if (!(e instanceof HttpError) || typeof e.body !== 'object' || e.body === null) return undefined;
	const {error} = e.body as {error?: unknown};
	return typeof error === 'string' ? error : undefined;
}

interface NftApiItem {
	mint: string;
	name: string;
	imageUrl: string;
	mediaType: 'image' | 'video' | 'gif' | 'model';
	collection: string | null;
	collectionMint: string | null;
	compressed: boolean;
}

interface NftApiResponse {
	nfts: Array<NftApiItem>;
	dasEnabled?: boolean;
}

class NftStickerStore {
	nfts: Array<NftStickerRecord> = [];
	loading = false;
	error: string | null = null;
	dasEnabled = false;

	private lastFetchTime = 0;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get hasNfts(): boolean {
		return this.nfts.length > 0;
	}

	/** Returns NFTs whose name or collection matches `query` (case-insensitive). */
	search(query: string): ReadonlyArray<NftStickerRecord> {
		const term = query.trim().toLowerCase();
		if (!term) return this.nfts;
		return this.nfts.filter(
			(nft) => nft.name.toLowerCase().includes(term) || (nft.collection?.toLowerCase().includes(term) ?? false),
		);
	}

	async fetchNfts(): Promise<void> {
		const isCacheValid = Date.now() - this.lastFetchTime < CACHE_TTL_MS;
		if (isCacheValid) return;

		this.loading = true;
		this.error = null;

		try {
			const response = await http.get<NftApiResponse>({
				url: Endpoints.NFTS,
			});

			const data = response.body;

			if (!Array.isArray(data?.nfts)) {
				throw new Error((data as unknown as {error?: string})?.error ?? 'Unexpected response from server');
			}

			this.nfts = data.nfts.map(
				(item) =>
					new NftStickerRecord({
						mint: item.mint,
						name: item.name,
						description: '',
						imageUrl: item.imageUrl,
						mediaType: item.mediaType ?? 'image',
						collection: item.collection,
						collectionMint: item.collectionMint,
						compressed: item.compressed,
					}),
			);
			this.dasEnabled = data.dasEnabled ?? false;

			this.lastFetchTime = Date.now();
			logger.info(`Loaded ${this.nfts.length} NFT stickers`);
		} catch (e: unknown) {
			this.error = getServerErrorMessage(e) ?? (e instanceof Error ? e.message : 'Failed to fetch NFTs');
			logger.error('NFT sticker fetch failed:', e);
		} finally {
			this.loading = false;
		}
	}

	/** Invalidate the cache so the next fetchNfts call goes to the server. */
	invalidate(): void {
		this.lastFetchTime = 0;
	}
}

export default new NftStickerStore();
