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

import {type CloudAttachment, CloudUpload} from '@app/lib/CloudUpload';
import {Logger} from '@app/lib/Logger';
import type {ApiAttachmentMetadata} from '@app/utils/MessageRequestUtils';

const logger = new Logger('MessageAttachmentUtils');

export interface PreparedMessageAttachments {
	attachments?: Array<ApiAttachmentMetadata>;
	files?: Array<File>;
}

export async function prepareAttachmentsForNonce(
	nonce: string,
	favoriteMemeId?: string,
): Promise<PreparedMessageAttachments> {
	logger.debug(`Preparing attachments for nonce ${nonce}`);

	const messageUpload = CloudUpload.getMessageUpload(nonce);
	if (!messageUpload) {
		throw new Error('No message upload found');
	}

	const inlineAttachments = messageUpload.attachments;
	const files = inlineAttachments.map((att) => att.file);
	const attachments = favoriteMemeId ? undefined : mapMessageUploadAttachments(messageUpload.attachments);

	return {attachments, files};
}

export function mapMessageUploadAttachments(attachments: Array<CloudAttachment>): Array<ApiAttachmentMetadata> {
	return attachments.map((att, index) => ({
		id: String(index),
		filename: att.filename,
		title: att.filename,
		description: att.description,
		flags: att.flags,
		duration: att.duration != null ? Math.ceil(att.duration) : undefined,
		waveform: att.waveform ?? undefined,
	}));
}
