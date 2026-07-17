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

import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import {modal} from '@app/actions/ModalActionCreators';
import {ScreenRecordingPermissionDeniedModal} from '@app/components/alerts/ScreenRecordingPermissionDeniedModal';
import {ScreenShareUnsupportedModal} from '@app/components/alerts/ScreenShareUnsupportedModal';
import {Logger} from '@app/lib/Logger';
import {ScreenRecordingPermissionDeniedError} from '@app/utils/errors/ScreenRecordingPermissionDeniedError';

const logger = new Logger('ScreenShareUtils');

const isScreenShareUnsupportedError = (error: unknown): boolean => {
	if (!(error instanceof Error)) return false;

	return (
		error.name === 'DeviceUnsupportedError' || error.name === 'NotSupportedError' || error.name === 'NotAllowedError'
	);
};

const handleScreenShareError = (error: unknown): void => {
	if (error instanceof ScreenRecordingPermissionDeniedError) {
		ModalActionCreators.push(modal(() => <ScreenRecordingPermissionDeniedModal />));
		return;
	}
	if (isScreenShareUnsupportedError(error)) {
		ModalActionCreators.push(modal(() => <ScreenShareUnsupportedModal />));
	} else {
		logger.error('Failed to start screen share:', error);
	}
};

export async function executeScreenShareOperation(
	operation: () => Promise<void>,
	onError?: (error: unknown) => void,
): Promise<void> {
	try {
		await operation();
	} catch (error) {
		handleScreenShareError(error);
		if (onError) {
			onError(error);
		}
		throw error;
	}
}
