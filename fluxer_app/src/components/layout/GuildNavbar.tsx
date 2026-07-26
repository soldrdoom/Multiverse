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

import * as UserGuildSettingsActionCreators from '@app/actions/UserGuildSettingsActionCreators';
import {TopNagbarContext} from '@app/components/layout/app_layout/TopNagbarContext';
import {ChannelListContent} from '@app/components/layout/ChannelListContent';
import {GuildHeader} from '@app/components/layout/GuildHeader';
import {GuildSidebar} from '@app/components/layout/GuildSidebar';
import {doesEventMatchShortcut} from '@app/hooks/useMarkdownKeybinds';
import {useNativePlatform} from '@app/hooks/useNativePlatform';
import type {GuildRecord} from '@app/records/GuildRecord';
import ChannelStore from '@app/stores/ChannelStore';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {useMotionValue} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useContext, useEffect, useMemo} from 'react';

export const GuildNavbar = observer(({guild}: {guild: GuildRecord}) => {
	const scrollY = useMotionValue(0);
	const {isNative, isWindows, isLinux} = useNativePlatform();
	const hasTopNagbar = useContext(TopNagbarContext);
	const shouldRoundTopLeft = isNative && (isWindows || isLinux) && !hasTopNagbar;

	useEffect(() => {
		scrollY.set(0);
	}, [guild.id, scrollY]);

	useEffect(() => {
		void CosmeticsStore.loadGuildCosmetics(guild.id);
	}, [guild.id]);

	const channels = ChannelStore.getGuildChannels(guild.id);

	const categoryIds = useMemo(() => {
		return channels.filter((ch) => ch.type === ChannelTypes.GUILD_CATEGORY).map((ch) => ch.id);
	}, [channels]);

	// Collapse/expand all categories on mod+shift+a. Matched by event.key (the
	// typed character) rather than event.code: physical-code matching fires on
	// the wrong key on non-QWERTY layouts (e.g. AZERTY's physical KeyA types
	// "q") and, because this shortcut stays active while typing in inputs, a
	// code-based match can swallow printable keystrokes in text fields. A
	// ctrl/cmd+shift+letter chord by key never inserts text, so keeping it
	// enabled while an editable element has focus is safe.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!doesEventMatchShortcut(event, {key: 'a', ctrlOrMeta: true, shift: true, alt: false})) {
				return;
			}
			event.preventDefault();
			if (categoryIds.length > 0) {
				UserGuildSettingsActionCreators.toggleAllCategoriesCollapsed(guild.id, categoryIds);
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [guild.id, categoryIds]);

	return (
		<GuildSidebar
			roundTopLeft={shouldRoundTopLeft}
			guildId={guild.id}
			header={<GuildHeader guild={guild} />}
			content={<ChannelListContent guild={guild} scrollY={scrollY} />}
		/>
	);
});
