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

import type {NftStickerRecord} from '@app/records/NftStickerRecord';
import type {GuildStickerRecord} from '@app/records/GuildStickerRecord';
import {makeAutoObservable, observable} from 'mobx';

/** Union of all sticker types that can sit in the compose box. */
export type PendingSticker = GuildStickerRecord | NftStickerRecord;

class ChannelStickerStore {
	pendingStickers: Map<string, PendingSticker> = observable.map();

	constructor() {
		makeAutoObservable(
			this,
			{
				pendingStickers: false,
			},
			{autoBind: true},
		);
	}

	setPendingSticker(channelId: string, sticker: PendingSticker): void {
		this.pendingStickers.set(channelId, sticker);
	}

	removePendingSticker(channelId: string): void {
		this.pendingStickers.delete(channelId);
	}

	clearPendingStickerOnMessageSend(channelId: string): void {
		if (this.pendingStickers.has(channelId)) {
			this.pendingStickers.delete(channelId);
		}
	}

	getPendingSticker(channelId: string): PendingSticker | null {
		return this.pendingStickers.get(channelId) ?? null;
	}
}

export default new ChannelStickerStore();
