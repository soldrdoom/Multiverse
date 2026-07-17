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

import {canDeleteAttachmentUtil} from '@app/components/channel/MessageActionUtils';
import type {MessageRecord} from '@app/records/MessageRecord';
import AccessibilityStore from '@app/stores/AccessibilityStore';

export interface MediaButtonVisibilityOptions {
	disableDelete?: boolean;
}

export interface MediaButtonVisibility {
	showFavoriteButton: boolean;
	showDownloadButton: boolean;
	showDeleteButton: boolean;
}

export function getMediaButtonVisibility(
	canFavorite: boolean,
	message?: MessageRecord,
	attachmentId?: string,
	options?: MediaButtonVisibilityOptions,
): MediaButtonVisibility {
	const showMediaFavoriteButton = AccessibilityStore.showMediaFavoriteButton;
	const showMediaDownloadButton = AccessibilityStore.showMediaDownloadButton;
	const showMediaDeleteButton = AccessibilityStore.showMediaDeleteButton;
	const disableDelete = options?.disableDelete ?? false;

	return {
		showFavoriteButton: showMediaFavoriteButton && canFavorite,
		showDownloadButton: showMediaDownloadButton,
		showDeleteButton:
			showMediaDeleteButton && !disableDelete && !!(message && attachmentId && canDeleteAttachmentUtil(message)),
	};
}
