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

import * as ChannelStickerActionCreators from '@app/actions/ChannelStickerActionCreators';
import * as MessageActionCreators from '@app/actions/MessageActionCreators';
import * as SlowmodeActionCreators from '@app/actions/SlowmodeActionCreators';
import {CloudUpload} from '@app/lib/CloudUpload';
import {NftStickerRecord} from '@app/records/NftStickerRecord';
import type {GuildStickerRecord} from '@app/records/GuildStickerRecord';
import {MessageRecord} from '@app/records/MessageRecord';
import DraftStore from '@app/stores/DraftStore';
import UserStore from '@app/stores/UserStore';
import {TypingUtils} from '@app/utils/TypingUtils';
import {MessageStates, MessageTypes} from '@fluxer/constants/src/ChannelConstants';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

export function handleStickerSelect(channelId: string, sticker: GuildStickerRecord): void {
	const draft = DraftStore.getDraft(channelId);
	const hasTextContent = draft && draft.trim().length > 0;
	const hasAttachments = CloudUpload.getTextareaAttachments(channelId).length > 0;

	if (!hasTextContent && !hasAttachments) {
		sendStickerMessage(channelId, sticker);
	} else {
		ChannelStickerActionCreators.setPendingSticker(channelId, sticker);
	}
}

export function handleNftStickerSelect(channelId: string, nft: NftStickerRecord): void {
	const draft = DraftStore.getDraft(channelId);
	const hasTextContent = draft && draft.trim().length > 0;
	const hasAttachments = CloudUpload.getTextareaAttachments(channelId).length > 0;

	if (!hasTextContent && !hasAttachments) {
		sendNftStickerMessage(channelId, nft);
	} else {
		ChannelStickerActionCreators.setPendingSticker(channelId, nft);
	}
}

function sendStickerMessage(channelId: string, sticker: GuildStickerRecord): void {
	const nonce = SnowflakeUtils.fromTimestamp(Date.now());
	const currentUser = UserStore.getCurrentUser();

	if (!currentUser) {
		return;
	}

	TypingUtils.clear(channelId);

	const message = new MessageRecord({
		id: nonce,
		channel_id: channelId,
		author: currentUser.toJSON(),
		type: MessageTypes.DEFAULT,
		flags: 0,
		pinned: false,
		mention_everyone: false,
		content: '',
		timestamp: new Date().toISOString(),
		mentions: [],
		state: MessageStates.SENDING,
		nonce,
		attachments: [],
		stickers: [sticker.toJSON()],
	});

	MessageActionCreators.createOptimistic(channelId, message.toJSON());
	SlowmodeActionCreators.recordMessageSend(channelId);

	MessageActionCreators.send(channelId, {
		content: '',
		nonce,
		stickers: [sticker.toJSON()],
	});
}

function sendNftStickerMessage(channelId: string, nft: NftStickerRecord): void {
	const nonce = SnowflakeUtils.fromTimestamp(Date.now());
	const currentUser = UserStore.getCurrentUser();

	if (!currentUser) {
		return;
	}

	TypingUtils.clear(channelId);

	const nftItem = nft.toNftStickerItem();

	const message = new MessageRecord({
		id: nonce,
		channel_id: channelId,
		author: currentUser.toJSON(),
		type: MessageTypes.DEFAULT,
		flags: 0,
		pinned: false,
		mention_everyone: false,
		content: '',
		timestamp: new Date().toISOString(),
		mentions: [],
		state: MessageStates.SENDING,
		nonce,
		attachments: [],
		nft_stickers: [nftItem],
	});

	MessageActionCreators.createOptimistic(channelId, message.toJSON());
	SlowmodeActionCreators.recordMessageSend(channelId);

	MessageActionCreators.send(channelId, {
		content: '',
		nonce,
		nft_stickers: [nftItem],
	});
}

/**
 * Called when a message with a pending sticker is actually submitted.
 * Routes to the correct send path based on the sticker type.
 */
export function sendPendingStickerWithMessage(
	channelId: string,
	sticker: GuildStickerRecord | NftStickerRecord,
): void {
	if (sticker instanceof NftStickerRecord) {
		sendNftStickerMessage(channelId, sticker);
	} else {
		sendStickerMessage(channelId, sticker);
	}
}
