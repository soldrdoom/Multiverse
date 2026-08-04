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

import {AppBadge} from '@app/components/AppBadge';
import {ChannelIndexPage} from '@app/components/channel/ChannelIndexPage';
import {ChannelLayout} from '@app/components/channel/ChannelLayout';
import {DMLayout} from '@app/components/channel/direct_message/DMLayout';
import {GuildMembersPage} from '@app/components/channel/GuildMembersPage';
import {AppLayout} from '@app/components/layout/AppLayout';
import {FavoritesLayout} from '@app/components/layout/FavoritesLayout';
import {GuildsLayout} from '@app/components/layout/GuildsLayout';
import {BookmarksBottomSheet} from '@app/components/modals/BookmarksBottomSheet';
import {StatusChangeBottomSheet} from '@app/components/modals/StatusChangeBottomSheet';
import {NotificationsPage} from '@app/components/pages/NotificationsPage';
import {YouPage} from '@app/components/pages/YouPage';
import {createRoute} from '@app/lib/router/Builder';
import {useParams} from '@app/lib/router/React';
import {Redirect} from '@app/lib/router/RouterTypes';
import SessionManager from '@app/lib/SessionManager';
import {Routes} from '@app/Routes';
import {GuildChannelRouter} from '@app/router/components/GuildChannelRouter';
import {rootRoute} from '@app/router/routes/RootRoutes';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import ChannelStore from '@app/stores/ChannelStore';
import MobileLayoutStore from '@app/stores/MobileLayoutStore';
import SelectedChannelStore from '@app/stores/SelectedChannelStore';
import * as RouterUtils from '@app/utils/RouterUtils';
import {ME} from '@fluxer/constants/src/AppConstants';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {observer} from 'mobx-react-lite';
import * as React from 'react';
import {useEffect, useState} from 'react';

// Rarely-hit one-shot redirect landing pages (post-payment/post-OAuth callbacks) — unlike the
// core app shell below, an authenticated user's normal session never touches these, so they're
// lazy-loaded rather than inline imports like the rest of this file's core layouts/pages.
const ConnectionCallbackPage = React.lazy(() => import('@app/components/pages/ConnectionCallbackPage'));
const PremiumCallbackPage = React.lazy(() => import('@app/components/pages/PremiumCallbackPage'));

// ─── DEV AUTH BYPASS — Milestone 0.0.1.5 ─────────────────────────────────────
// Allows UI inspection when the backend provider is offline.
// Seeds a fake session so AuthenticationStore.currentUserId / UserStore.currentUserId
// resolve to a stable dev identity without requiring a live backend.
// !! REMOVE THIS BLOCK BEFORE PROMOTING TO PRODUCTION !!
const DEV_AUTH_BYPASS = process.env.NODE_ENV === 'development';

if (DEV_AUTH_BYPASS) {
	void SessionManager.login('mv-dev-bypass-token-00000000', '100000000000000');
}
// ─────────────────────────────────────────────────────────────────────────────

const appLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'appLayout',
	onEnter: () => {
		if (DEV_AUTH_BYPASS) return undefined;
		if (!SessionManager.isInitialized) {
			return undefined;
		}
		if (!AuthenticationStore.isAuthenticated) {
			// Sign-in lives on the marketing front page now, not the in-app /login screen. The path
			// they were reaching for rides along so they land there after authenticating.
			const current = window.location.pathname + window.location.search;
			RouterUtils.redirectToMarketingSignIn(current);
			return undefined;
		}
		return undefined;
	},
	layout: ({children}) => (
		<>
			<AppBadge />
			<AppLayout>{children}</AppLayout>
		</>
	),
});

const guildsLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'guildsLayout',
	layout: ({children}) => <GuildsLayout>{children}</GuildsLayout>,
});

const notificationsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'notifications',
	path: Routes.NOTIFICATIONS,
	component: () => {
		const [bookmarksSheetOpen, setBookmarksSheetOpen] = useState(false);

		return (
			<>
				<NotificationsPage onBookmarksClick={() => setBookmarksSheetOpen(true)} />
				<BookmarksBottomSheet isOpen={bookmarksSheetOpen} onClose={() => setBookmarksSheetOpen(false)} />
			</>
		);
	},
});

const youRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'you',
	path: Routes.YOU,
	component: () => {
		const [statusSheetOpen, setStatusSheetOpen] = useState(false);

		return (
			<>
				<YouPage onAvatarClick={() => setStatusSheetOpen(true)} />
				<StatusChangeBottomSheet isOpen={statusSheetOpen} onClose={() => setStatusSheetOpen(false)} />
			</>
		);
	},
});

export const premiumCallbackRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'premiumCallback',
	path: Routes.PREMIUM_CALLBACK,
	component: () => <PremiumCallbackPage />,
});

export const connectionCallbackRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'connectionCallback',
	path: Routes.CONNECTION_CALLBACK,
	component: () => <ConnectionCallbackPage />,
});

const bookmarksRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'bookmarks',
	path: Routes.BOOKMARKS,
	component: () => <DMLayout />,
});

const mentionsRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'mentions',
	path: Routes.MENTIONS,
	component: () => <DMLayout />,
});

const meRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'me',
	path: '/channels/@me',
	component: observer(() => {
		const isMobileLayout = MobileLayoutStore.enabled;

		useEffect(() => {
			if (!isMobileLayout && SelectedChannelStore.selectedChannelIds.has(ME)) {
				SelectedChannelStore.clearGuildSelection(ME);
			}
		}, [isMobileLayout]);

		return <DMLayout />;
	}),
});

const favoritesRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'favorites',
	path: '/channels/@favorites',
	layout: ({children}) => <FavoritesLayout>{children}</FavoritesLayout>,
});

const favoritesChannelRoute = createRoute({
	getParentRoute: () => favoritesRoute,
	id: 'favoritesChannel',
	path: '/channels/@favorites/:channelId',
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

const channelsRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'channels',
	path: '/channels/:guildId',
	layout: ({children}) => {
		const params = useParams() as {guildId: string};
		const {guildId} = params;

		if (guildId === ME) {
			return <DMLayout>{children}</DMLayout>;
		}

		return guildId ? <GuildChannelRouter guildId={guildId}>{children}</GuildChannelRouter> : null;
	},
});

const membersRoute = createRoute({
	getParentRoute: () => channelsRoute,
	id: 'guildMembers',
	path: '/channels/:guildId/members',
	component: () => {
		const {guildId} = useParams() as {guildId: string};
		return <GuildMembersPage guildId={guildId} />;
	},
});

const channelRoute = createRoute({
	getParentRoute: () => channelsRoute,
	id: 'channel',
	path: '/channels/:guildId/:channelId',
	onEnter: (ctx) => {
		const {guildId, channelId} = ctx.params;
		const channel = ChannelStore.getChannel(channelId);
		if (channel && (channel.type === ChannelTypes.GUILD_CATEGORY || channel.type === ChannelTypes.GUILD_LINK)) {
			return new Redirect(Routes.guildChannel(guildId));
		}
		return undefined;
	},
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

const messageRoute = createRoute({
	getParentRoute: () => channelRoute,
	id: 'message',
	path: '/channels/:guildId/:channelId/:messageId',
	onEnter: (ctx) => {
		const {guildId, channelId} = ctx.params;
		const channel = ChannelStore.getChannel(channelId);
		if (channel && (channel.type === ChannelTypes.GUILD_CATEGORY || channel.type === ChannelTypes.GUILD_LINK)) {
			return new Redirect(Routes.guildChannel(guildId));
		}
		return undefined;
	},
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

export const appRouteTree = appLayoutRoute.addChildren([
	notificationsRoute,
	youRoute,
	guildsLayoutRoute.addChildren([
		bookmarksRoute,
		mentionsRoute,
		meRoute,
		favoritesRoute.addChildren([favoritesChannelRoute]),
		channelsRoute.addChildren([membersRoute, channelRoute.addChildren([messageRoute])]),
	]),
]);
