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

import {NotFoundPage} from '@app/components/pages/NotFoundPage';
import {createRootRoute, createRoute} from '@app/lib/router/Builder';
import {Redirect} from '@app/lib/router/RouterTypes';
import SessionManager from '@app/lib/SessionManager';
import {Routes} from '@app/Routes';
import {RootComponent} from '@app/router/components/RootComponent';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import * as RouterUtils from '@app/utils/RouterUtils';

export const rootRoute = createRootRoute({
	layout: ({children}) => <RootComponent>{children}</RootComponent>,
});

export const notFoundRoute = createRoute({
	id: '__notFound',
	path: '/__notfound',
	component: () => <NotFoundPage />,
});

export const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'home',
	path: '/',
	// Previously this redirected to Routes.ME unconditionally, with no auth check. For a signed-out
	// visitor that chained straight into appLayoutRoute's guard and produced
	// `/login?redirect_to=%2Fchannels%2F%40me` — so "go to the home page" was unreachable from inside
	// the app once you logged out. Authenticated users still land in the client; everyone else gets
	// the marketing front page, which is what `/` actually serves.
	onEnter: () => {
		if (!SessionManager.isInitialized) {
			void SessionManager.initialize().then(() => {
				if (AuthenticationStore.isAuthenticated) {
					RouterUtils.replaceWith(Routes.ME);
				} else {
					RouterUtils.redirectToMarketingSignIn();
				}
			});
			return undefined;
		}
		if (AuthenticationStore.isAuthenticated) {
			return new Redirect(Routes.ME);
		}
		RouterUtils.redirectToMarketingSignIn();
		return undefined;
	},
});
