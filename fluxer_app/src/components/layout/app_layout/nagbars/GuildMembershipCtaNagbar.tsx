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

import {Nagbar} from '@app/components/layout/Nagbar';
import {NagbarButton} from '@app/components/layout/NagbarButton';
import {NagbarContent} from '@app/components/layout/NagbarContent';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import NagbarStore from '@app/stores/NagbarStore';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

const MULTIVERSE_INVITE_URL = 'https://multiverse.forum/invite/884IWviB';

export const GuildMembershipCtaNagbar = observer(({isMobile}: {isMobile: boolean}) => {
	const currentUserId = AuthenticationStore.currentUserId;

	useEffect(() => {
		NagbarStore.guildMembershipCtaDismissed = false;
	}, [currentUserId]);

	if (!currentUserId) {
		return null;
	}

	const handleJoinNow = () => {
		window.open(MULTIVERSE_INVITE_URL, '_self');
	};

	const handleDismiss = () => {
		NagbarStore.guildMembershipCtaDismissed = true;
	};

	return (
		<Nagbar
			isMobile={isMobile}
			backgroundColor="var(--brand-primary)"
			textColor="var(--text-on-brand-primary)"
			onDismiss={handleDismiss}
			dismissible={true}
		>
			<NagbarContent
				isMobile={isMobile}
				onDismiss={handleDismiss}
				message={<Trans>Welcome to the Multiverse. Stay updated on the latest!</Trans>}
				actions={
					<NagbarButton isMobile={isMobile} onClick={handleJoinNow} submitting={false} disabled={false}>
						<Trans>Join Now</Trans>
					</NagbarButton>
				}
			/>
		</Nagbar>
	);
});
