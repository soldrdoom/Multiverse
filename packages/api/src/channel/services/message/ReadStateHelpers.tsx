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

import type {ChannelID} from '@fluxer/api/src/BrandedTypes';
import type {User} from '@fluxer/api/src/models/User';
import type {ReadStateService} from '@fluxer/api/src/read_state/ReadStateService';

interface IncrementDmMentionCountsParams {
	readStateService: ReadStateService;
	user: User | null;
	recipients: Array<User>;
	channelId: ChannelID;
}

export async function incrementDmMentionCounts(params: IncrementDmMentionCountsParams): Promise<void> {
	const {readStateService, user, recipients, channelId} = params;

	if (!user || user.isBot) return;

	const validRecipients = recipients.filter((recipient) => recipient.id !== user.id && !recipient.isBot);

	if (validRecipients.length === 0) return;

	await readStateService.bulkIncrementMentionCounts(
		validRecipients.map((recipient) => ({
			userId: recipient.id,
			channelId,
		})),
	);
}
