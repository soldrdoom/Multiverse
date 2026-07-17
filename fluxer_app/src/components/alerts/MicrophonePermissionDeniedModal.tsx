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

import {ConfirmModal} from '@app/components/modals/ConfirmModal';
import {openNativePermissionSettings} from '@app/utils/NativePermissions';
import {isDesktop, isNativeMacOS} from '@app/utils/NativeUtils';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

export const MicrophonePermissionDeniedModal = observer(() => {
	const {t} = useLingui();

	if (isDesktop() && isNativeMacOS()) {
		return (
			<ConfirmModal
				title={t`Microphone Permission Required`}
				description={t`Multiverse needs access to your microphone. Open System Settings → Privacy & Security → Microphone, allow Multiverse, and then restart the app.`}
				primaryText={t`Open Settings`}
				primaryVariant="primary"
				onPrimary={() => openNativePermissionSettings('microphone')}
				secondaryText={t`Close`}
			/>
		);
	}

	const message = isDesktop()
		? t`Multiverse needs access to your microphone. Allow microphone access in your operating system privacy settings and restart the app.`
		: t`Multiverse needs access to your microphone to enable voice chat. Please grant microphone permission in your browser settings and try again.`;

	return (
		<ConfirmModal
			title={t`Microphone Permission Required`}
			description={message}
			primaryText={t`Understood`}
			onPrimary={() => {}}
		/>
	);
});
