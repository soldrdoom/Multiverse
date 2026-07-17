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
import * as NavigationActionCreators from '@app/actions/NavigationActionCreators';
import {DirectCallLobbyBottomSheet} from '@app/components/bottomsheets/DirectCallLobbyBottomSheet';
import {VoiceLobbyBottomSheet} from '@app/components/bottomsheets/VoiceLobbyBottomSheet';
import styles from '@app/components/layout/MobileBottomNav.module.css';
import {CosmeticsShopModal} from '@app/components/modals/CosmeticsShopModal';
import {StatusAwareAvatar} from '@app/components/uikit/StatusAwareAvatar';
import {useConnectedVoiceSession} from '@app/hooks/useConnectedVoiceSession';
import {useLocation} from '@app/lib/router/React';
import {Routes} from '@app/Routes';
import type {UserRecord} from '@app/records/UserRecord';
import NavigationStore from '@app/stores/NavigationStore';
import * as RouterUtils from '@app/utils/RouterUtils';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {Trans} from '@lingui/react/macro';
import {BellIcon, HouseIcon, SpeakerHighIcon, StorefrontIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef, useState} from 'react';

interface MobileBottomNavProps {
	currentUser: UserRecord;
}

export const MobileBottomNav = observer(({currentUser}: MobileBottomNavProps) => {
	const location = useLocation();
	const lastChannelRef = useRef<{guildId: string | null; channelId: string | null} | null>(null);
	const [voiceLobbyOpen, setVoiceLobbyOpen] = useState(false);

	const isHomeActive = Routes.isChannelRoute(location.pathname);
	const isNotificationsActive = location.pathname === Routes.NOTIFICATIONS;
	const isYouActive = location.pathname === Routes.YOU;

	const {channel: voiceChannel, guild: voiceGuild, isConnected: isConnectedToVoice} = useConnectedVoiceSession();
	const isDirectCallChannel = Boolean(
		voiceChannel && (voiceChannel.type === ChannelTypes.DM || voiceChannel.type === ChannelTypes.GROUP_DM),
	);

	useEffect(() => {
		if (Routes.isChannelRoute(location.pathname)) {
			lastChannelRef.current = {guildId: NavigationStore.guildId, channelId: NavigationStore.channelId};
		}
	}, [location.pathname]);

	const handleHomeNavigation = () => {
		const last = lastChannelRef.current;
		if (last?.channelId && (isNotificationsActive || isYouActive)) {
			NavigationActionCreators.selectChannel(last.guildId ?? undefined, last.channelId);
		} else {
			NavigationActionCreators.deselectGuild();
		}
	};

	const handleNavigation = (path: string) => {
		RouterUtils.transitionTo(path);
	};

	const handleShop = () => {
		ModalActionCreators.push(modal(() => <CosmeticsShopModal />));
	};

	const handleVoiceIndicatorPress = () => {
		setVoiceLobbyOpen(true);
	};

	const handleCloseVoiceLobby = () => {
		setVoiceLobbyOpen(false);
	};

	return (
		<>
			<div className={styles.container}>
				<button
					type="button"
					onClick={handleHomeNavigation}
					className={clsx(styles.navButton, isHomeActive ? styles.navButtonActive : styles.navButtonInactive)}
				>
					<HouseIcon weight="fill" className={styles.icon} />
					<span className={styles.label}>
						<Trans>Home</Trans>
					</span>
				</button>

				{isConnectedToVoice && (
					<button
						type="button"
						onClick={handleVoiceIndicatorPress}
						className={clsx(styles.navButton, styles.voiceButton)}
					>
						<SpeakerHighIcon weight="fill" className={styles.icon} />
						<span className={styles.label}>
							<Trans>Voice</Trans>
						</span>
					</button>
				)}

				<button
					type="button"
					onClick={() => handleNavigation(Routes.NOTIFICATIONS)}
					className={clsx(styles.navButton, isNotificationsActive ? styles.navButtonActive : styles.navButtonInactive)}
				>
					<BellIcon weight="fill" className={styles.icon} />
					<span className={styles.label}>
						<Trans>Notifications</Trans>
					</span>
				</button>

				<button
					type="button"
					onClick={handleShop}
					className={clsx(styles.navButton, styles.navButtonInactive)}
				>
					<StorefrontIcon weight="fill" className={styles.icon} />
					<span className={styles.label}>
						<Trans>Shop</Trans>
					</span>
				</button>

				<button
					type="button"
					onClick={() => handleNavigation(Routes.YOU)}
					className={clsx(styles.navButton, isYouActive ? styles.navButtonActive : styles.navButtonInactive)}
				>
					<StatusAwareAvatar user={currentUser} size={24} showOffline={true} />
					<span className={styles.label}>
						<Trans>You</Trans>
					</span>
				</button>
			</div>

			{isConnectedToVoice && voiceChannel && voiceGuild && !isDirectCallChannel && (
				<VoiceLobbyBottomSheet
					isOpen={voiceLobbyOpen}
					onClose={handleCloseVoiceLobby}
					channel={voiceChannel}
					guild={voiceGuild}
				/>
			)}
			{isConnectedToVoice && voiceChannel && isDirectCallChannel && (
				<DirectCallLobbyBottomSheet isOpen={voiceLobbyOpen} onClose={handleCloseVoiceLobby} channel={voiceChannel} />
			)}
		</>
	);
});
