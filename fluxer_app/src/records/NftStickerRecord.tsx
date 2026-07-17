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

export interface NftStickerData {
	readonly mint: string;
	readonly name: string;
	readonly description: string;
	readonly imageUrl: string;
	readonly mediaType: 'image' | 'video' | 'gif' | 'model';
	readonly collection: string | null;
	readonly collectionMint: string | null;
	readonly compressed: boolean;
}

/**
 * Represents an NFT or cNFT from a user's Solana wallet used as a sticker.
 *
 * Provides a compatible surface with GuildStickerRecord so it can be stored in
 * ChannelStickerStore as a pending sticker and rendered by ChannelStickersArea.
 */
export class NftStickerRecord {
	readonly mint: string;
	readonly name: string;
	readonly description: string;
	readonly imageUrl: string;
	readonly mediaType: 'image' | 'video' | 'gif' | 'model';
	readonly collection: string | null;
	readonly collectionMint: string | null;
	readonly compressed: boolean;

	constructor(data: NftStickerData) {
		this.mint = data.mint;
		this.name = data.name;
		this.description = data.description;
		this.imageUrl = data.imageUrl;
		this.mediaType = data.mediaType;
		this.collection = data.collection;
		this.collectionMint = data.collectionMint;
		this.compressed = data.compressed;
	}

	/** Alias for mint — satisfies the sticker-area id interface. */
	get id(): string {
		return this.mint;
	}

	/** Direct external image URL (IPFS/Arweave/HTTPS). */
	get url(): string {
		return this.imageUrl;
	}

	get animated(): boolean {
		return this.mediaType === 'video' || this.mediaType === 'gif';
	}

	get tags(): ReadonlyArray<string> {
		return this.collection ? [this.collection] : [];
	}

	toNftStickerItem(): NftStickerItem {
		return {
			mint: this.mint,
			name: this.name,
			image_url: this.imageUrl,
			media_type: this.mediaType,
			collection: this.collection ?? undefined,
			compressed: this.compressed,
		};
	}
}

/** Wire format included in message payloads for NFT stickers. */
export interface NftStickerItem {
	readonly mint: string;
	readonly name: string;
	readonly image_url: string;
	readonly media_type: 'image' | 'video' | 'gif' | 'model';
	readonly collection?: string;
	readonly compressed: boolean;
}
