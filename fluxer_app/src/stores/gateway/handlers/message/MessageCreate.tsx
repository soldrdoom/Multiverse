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

import CallStateStore from '@app/stores/CallStateStore';
import GuildMemberStore from '@app/stores/GuildMemberStore';
import GuildReadStateStore from '@app/stores/GuildReadStateStore';
import type {GatewayHandlerContext} from '@app/stores/gateway/handlers';
import MessageReferenceStore from '@app/stores/MessageReferenceStore';
import MessageStore from '@app/stores/MessageStore';
import NotificationStore from '@app/stores/NotificationStore';
import ReadStateStore from '@app/stores/ReadStateStore';
import RecentMentionsStore from '@app/stores/RecentMentionsStore';
import TypingStore from '@app/stores/TypingStore';
import VaultStore from '@app/stores/VaultStore';
import {openMessage, base64ToU8} from '@app/services/crypto/crypto-utils';
import TtsUtils from '@app/utils/TtsUtils';
import {MessageFlags} from '@fluxer/constants/src/ChannelConstants';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';
import type {Message} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

function decryptIfE2EE(data: Message): Message {
	if (!(data.flags & MessageFlags.E2EE) || !data.encrypted_content) {
		return data;
	}
	if (!VaultStore.isUnlocked) {
		return {...data, content: '🔒 Encrypted message — unlock vault to view'};
	}
	try {
		const parsed = JSON.parse(data.encrypted_content);
		const forRecipient = parsed.forRecipient ?? parsed;
		const forSender = parsed.forSender ?? null;
		const privateKeyBytes = base64ToU8(VaultStore.keyPair!.privateKeyB64);
		const plaintext =
			openMessage(forRecipient, privateKeyBytes) ??
			(forSender ? openMessage(forSender, privateKeyBytes) : null);
		if (plaintext != null) {
			return {...data, content: plaintext};
		}
	} catch {
		// Fall through to placeholder.
	}
	return {...data, content: '🔒 Could not decrypt message'};
}

export function handleMessageCreate(rawData: Message, _context: GatewayHandlerContext): void {
	const data = decryptIfE2EE(rawData);

	if (data.guild_id && data.member) {
		GuildMemberStore.handleMemberAdd(data.guild_id, {
			...data.member,
			user: data.author,
		} as GuildMemberData);
	}

	if (data.mentions && data.guild_id) {
		for (const mention of data.mentions) {
			if (mention.member) {
				GuildMemberStore.handleMemberAdd(data.guild_id, {
					...mention.member,
					user: mention,
				} as GuildMemberData);
			}
		}
	}

	TypingStore.stopTypingOnMessageCreate(data);
	MessageStore.handleIncomingMessage({channelId: data.channel_id, message: data});
	MessageReferenceStore.handleMessageCreate(data, false);
	NotificationStore.handleMessageCreate({message: data});
	ReadStateStore.handleIncomingMessage({channelId: data.channel_id, message: data});
	GuildReadStateStore.handleGenericUpdate(data.channel_id);
	RecentMentionsStore.handleMessageCreate(data);
	TtsUtils.handleIncomingTtsMessage(data);
	if (data.call && data.channel_id) {
		CallStateStore.handleCallParticipants(data.channel_id, [...data.call.participants]);
	}
}
