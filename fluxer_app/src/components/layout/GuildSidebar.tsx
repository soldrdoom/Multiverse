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

import styles from '@app/components/layout/GuildNavbar.module.css';
import {useLocation} from '@app/lib/router/React';
import {Routes} from '@app/Routes';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import MobileLayoutStore from '@app/stores/MobileLayoutStore';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface GuildSidebarProps {
	header: React.ReactNode;
	content: React.ReactNode;
	roundTopLeft?: boolean;
	/** Guild ID used to look up server cosmetics for this sidebar. */
	guildId?: string;
}

export const GuildSidebar = observer(({header, content, roundTopLeft = true, guildId}: GuildSidebarProps) => {
	const mobileLayout = MobileLayoutStore;
	const location = useLocation();

	const showBottomNav =
		mobileLayout.enabled &&
		(location.pathname === Routes.ME ||
			Routes.isFavoritesRoute(location.pathname) ||
			location.pathname === Routes.NOTIFICATIONS ||
			location.pathname === Routes.YOU ||
			Routes.isGuildChannelRoute(location.pathname));

	const channelListBgUrl = guildId
		? CosmeticsStore.getGuildCosmeticImageUrl(guildId, 'channel_list_background')
		: null;

	return (
		<div
			className={clsx(
				styles.guildNavbarContainer,
				mobileLayout.enabled && styles.guildNavbarContainerMobile,
				showBottomNav && styles.guildNavbarReserveMobileBottomNav,
			)}
			style={{
				...(roundTopLeft ? {} : {borderTopLeftRadius: 0}),
				...(channelListBgUrl ? {
					backgroundImage: `url(${channelListBgUrl})`,
					backgroundSize: 'cover',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat',
				} : {}),
			}}
		>
			{header}
			{content}
		</div>
	);
});
