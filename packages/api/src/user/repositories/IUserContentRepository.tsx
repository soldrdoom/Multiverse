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

import type {ChannelID, MessageID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {ExactRow} from '@fluxer/api/src/database/types/DatabaseRowTypes';
import type {PushSubscriptionRow, RecentMentionRow} from '@fluxer/api/src/database/types/UserTypes';
import type {PushSubscription} from '@fluxer/api/src/models/PushSubscription';
import type {RecentMention} from '@fluxer/api/src/models/RecentMention';
import type {SavedMessage} from '@fluxer/api/src/models/SavedMessage';

export interface IUserContentRepository {
	getRecentMention(userId: UserID, messageId: MessageID): Promise<RecentMention | null>;
	listRecentMentions(
		userId: UserID,
		includeEveryone: boolean,
		includeRole: boolean,
		includeGuilds: boolean,
		limit: number,
		before?: MessageID,
	): Promise<Array<RecentMention>>;
	createRecentMention(mention: ExactRow<RecentMentionRow>): Promise<RecentMention>;
	createRecentMentions(mentions: Array<ExactRow<RecentMentionRow>>): Promise<void>;
	deleteRecentMention(mention: RecentMention): Promise<void>;
	deleteAllRecentMentions(userId: UserID): Promise<void>;

	listSavedMessages(userId: UserID, limit?: number, before?: MessageID): Promise<Array<SavedMessage>>;
	createSavedMessage(userId: UserID, channelId: ChannelID, messageId: MessageID): Promise<SavedMessage>;
	deleteSavedMessage(userId: UserID, messageId: MessageID): Promise<void>;
	deleteAllSavedMessages(userId: UserID): Promise<void>;

	listPushSubscriptions(userId: UserID): Promise<Array<PushSubscription>>;
	createPushSubscription(data: ExactRow<PushSubscriptionRow>): Promise<PushSubscription>;
	deletePushSubscription(userId: UserID, subscriptionId: string): Promise<void>;
	getBulkPushSubscriptions(userIds: Array<UserID>): Promise<Map<UserID, Array<PushSubscription>>>;
	deleteAllPushSubscriptions(userId: UserID): Promise<void>;
}
