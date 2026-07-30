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

import * as InviteActionCreators from '@app/actions/InviteActionCreators';
import * as ThemeActionCreators from '@app/actions/ThemeActionCreators';
import {AuthLayout} from '@app/components/layout/AuthLayout';
import AuthorizeIPPage from '@app/components/pages/AuthorizeIPPage';
import EmailRevertPage from '@app/components/pages/EmailRevertPage';
import ForgotPasswordPage from '@app/components/pages/ForgotPasswordPage';
import InviteLoginPage from '@app/components/pages/InviteLoginPage';
import InviteRegisterPage from '@app/components/pages/InviteRegisterPage';
import LoginPage from '@app/components/pages/LoginPage';
import OAuthAuthorizePage from '@app/components/pages/OAuthAuthorizePage';
import {ReportPage} from '@app/components/pages/ReportPage';
import ResetPasswordPage from '@app/components/pages/ResetPasswordPage';
import SolanaOnboardingPage from '@app/components/pages/SolanaOnboardingPage';
import SsoCallbackPage from '@app/components/pages/SsoCallbackPage';
import ThemeLoginPage from '@app/components/pages/ThemeLoginPage';
import ThemeRegisterPage from '@app/components/pages/ThemeRegisterPage';
import VerifyEmailPage from '@app/components/pages/VerifyEmailPage';
import {IS_DEV} from '@app/lib/Env';
import {createRoute} from '@app/lib/router/Builder';
import type {RouteContext} from '@app/lib/router/RouterTypes';
import {Redirect} from '@app/lib/router/RouterTypes';
import SessionManager from '@app/lib/SessionManager';
import {Routes} from '@app/Routes';
import {rootRoute} from '@app/router/routes/RootRoutes';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import * as RouterUtils from '@app/utils/RouterUtils';
import {setPathQueryParams} from '@app/utils/UrlUtils';
import {i18n} from '@lingui/core';

const resolveToPath = (to: Redirect['to']): string => {
	if (typeof to === 'string') {
		return to;
	}

	const url = new URL(to.to, window.location.origin);

	if (to.search) {
		url.search = '';
		for (const [k, v] of Object.entries(to.search)) {
			if (v === undefined) continue;
			if (v === null) {
				url.searchParams.set(k, '');
			} else {
				url.searchParams.set(k, String(v));
			}
		}
	}

	if (to.hash) {
		url.hash = to.hash.startsWith('#') ? to.hash : `#${to.hash}`;
	}

	return url.pathname + url.search + url.hash;
};

type AuthRedirectHandler = (ctx: RouteContext) => Redirect | undefined;

/**
 * Like `whenAuthenticated`, but the handler runs in both states once the session is known. Needed
 * for routes that have to act on *unauthenticated* visitors too: on a cold page load
 * `SessionManager.isInitialized` is false, and a guard that only fires for authenticated users would
 * silently fall through and render the page for exactly the visitors it was meant to redirect.
 */
const whenSessionResolved = (handler: (isAuthenticated: boolean) => Redirect | undefined) => {
	return (): Redirect | undefined => {
		if (SessionManager.isInitialized) {
			return handler(AuthenticationStore.isAuthenticated);
		}

		void SessionManager.initialize().then(() => {
			const result = handler(AuthenticationStore.isAuthenticated);
			if (result instanceof Redirect) {
				RouterUtils.replaceWith(resolveToPath(result.to));
			}
		});

		return undefined;
	};
};

const whenAuthenticated = (handler: AuthRedirectHandler) => {
	return (ctx: RouteContext): Redirect | undefined => {
		const execute = (): Redirect | undefined => handler(ctx);

		if (SessionManager.isInitialized) {
			return AuthenticationStore.isAuthenticated ? execute() : undefined;
		}

		void SessionManager.initialize().then(() => {
			if (AuthenticationStore.isAuthenticated) {
				const res = execute();
				if (res instanceof Redirect) {
					RouterUtils.replaceWith(resolveToPath(res.to));
				}
			}
		});

		return undefined;
	};
};

const authLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'authLayout',
	layout: ({children}) => <AuthLayout>{children}</AuthLayout>,
});

const loginRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'login',
	path: '/login',
	// This page is retired as a destination. In production it rendered nothing but a "Sign In with
	// Solana" button — the email/password form and passkey actions are `IS_DEV`-gated in
	// AuthLoginLayout — so it was a strictly worse copy of the marketing front page, which offers the
	// same wallet sign-in plus account creation and recovery. Signed-out visitors go there instead.
	//
	// Two cases still need the component and are deliberately exempt:
	//   - `desktop_handoff=1`, which renders the handoff code display rather than a login form.
	//   - an in-flight MFA challenge, which flips `loginState` without changing route; guarding on it
	//     keeps a client-side re-entry from throwing the challenge away.
	onEnter: whenSessionResolved((isAuthenticated) => {
		const qp = new URLSearchParams(window.location.search);
		// IS_DEV: the email/password form and passkey actions only render in development
		// (AuthLoginLayout), and marketing usually isn't running locally — redirecting would leave a
		// developer with no way to sign in at all.
		if (IS_DEV || qp.get('desktop_handoff') === '1' || AuthenticationStore.loginState === 'mfa') {
			return undefined;
		}

		const redirectTo = qp.get('redirect_to');
		if (isAuthenticated) {
			// Sanitized on this branch too. It used to hand the raw param straight to Redirect, which
			// only failed closed because history.replaceState throws SecurityError on a cross-origin
			// URL — a browser guarantee, not one this code was making.
			return new Redirect(RouterUtils.sanitizeSameOriginPath(redirectTo) ?? Routes.ME);
		}

		RouterUtils.redirectToMarketingSignIn(redirectTo);
		return undefined;
	}),
	component: () => <LoginPage />,
});

const ssoCallbackRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'ssoCallback',
	path: '/auth/sso/callback',
	component: () => <SsoCallbackPage />,
});

const inviteBaseRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'inviteBase',
	path: '/invite',
	onEnter: () => new Redirect(Routes.ME),
});

const giftBaseRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'giftBase',
	path: '/gift',
	onEnter: () => new Redirect(Routes.ME),
});

const themeBaseRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'themeBase',
	path: '/theme',
	onEnter: () => new Redirect(Routes.ME),
});

const registerRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'register',
	path: '/register',
	// Registration on this instance *is* wallet sign-in — a new wallet verifies, comes back
	// `needsOnboarding`, and picks a username. This used to bounce to /login; going straight to the
	// marketing front page skips a hop that would now just bounce again.
	onEnter: whenSessionResolved((isAuthenticated) => {
		if (isAuthenticated) {
			return new Redirect(Routes.ME);
		}
		if (IS_DEV) {
			return new Redirect(Routes.LOGIN);
		}
		RouterUtils.redirectToMarketingSignIn();
		return undefined;
	}),
	component: () => <LoginPage />,
});

const oauthAuthorizeRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'oauthAuthorize',
	path: Routes.OAUTH_AUTHORIZE,
	onEnter: () => {
		const current = window.location.pathname + window.location.search;

		if (!SessionManager.isInitialized) {
			void SessionManager.initialize().then(() => {
				if (!AuthenticationStore.isAuthenticated) {
					RouterUtils.replaceWith(setPathQueryParams(Routes.LOGIN, {redirect_to: current}));
				}
			});
			return undefined;
		}

		if (!AuthenticationStore.isAuthenticated) {
			return new Redirect(setPathQueryParams(Routes.LOGIN, {redirect_to: current}));
		}

		return undefined;
	},
	component: () => <OAuthAuthorizePage />,
});

const inviteRegisterRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'inviteRegister',
	path: '/invite/:code',
	onEnter: whenAuthenticated((ctx) => {
		const code = ctx.params['code'];
		if (code) {
			InviteActionCreators.openAcceptModal(code);
		}
		return new Redirect(Routes.ME);
	}),
	component: () => <InviteRegisterPage />,
});

const inviteLoginRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'inviteLogin',
	path: '/invite/:code/login',
	onEnter: whenAuthenticated((ctx) => {
		const code = ctx.params['code'];
		if (code) {
			InviteActionCreators.openAcceptModal(code);
		}
		return new Redirect(Routes.ME);
	}),
	component: () => <InviteLoginPage />,
});

// Bare top-level vanity link, e.g. multiverse.forum/official — matches only
// when no other route claims the path first (the router sorts by segment
// count then wildcard count, so every literal top-level route above always
// outranks this one; see Core.tsx's matchUrl). Vanity codes are literally
// invite codes at the resolution layer (vanityCodeToInviteCode is a no-op
// rebrand), so this reuses the invite flow verbatim rather than a separate
// resolution path — an unresolvable code still surfaces as "not found" inside
// InviteRegisterPage, exactly like an unknown /invite/:code does today.
const bareVanityRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'bareVanity',
	path: '/:code',
	onEnter: whenAuthenticated((ctx) => {
		const code = ctx.params['code'];
		if (code) {
			InviteActionCreators.openAcceptModal(code);
		}
		return new Redirect(Routes.ME);
	}),
	component: () => <InviteRegisterPage />,
});

const forgotPasswordRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'forgotPassword',
	path: Routes.FORGOT_PASSWORD,
	onEnter: whenAuthenticated(() => new Redirect(Routes.ME)),
	component: () => <ForgotPasswordPage />,
});

const resetPasswordRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'resetPassword',
	path: Routes.RESET_PASSWORD,
	component: () => <ResetPasswordPage />,
});

const emailRevertRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'emailRevert',
	path: Routes.EMAIL_REVERT,
	component: () => <EmailRevertPage />,
});

const verifyEmailRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'verifyEmail',
	path: Routes.VERIFY_EMAIL,
	component: () => <VerifyEmailPage />,
});

const authorizeIPRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'authorizeIP',
	path: Routes.AUTHORIZE_IP,
	component: () => <AuthorizeIPPage />,
});

const pendingRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'pending',
	path: Routes.PENDING,
	onEnter: () => new Redirect(Routes.ME),
});

const reportRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'report',
	path: Routes.REPORT,
	component: () => <ReportPage />,
});

const solanaOnboardingRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'solanaOnboarding',
	path: Routes.SOLANA_ONBOARDING,
	component: () => <SolanaOnboardingPage />,
});

const themeRegisterRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'themeRegister',
	path: Routes.THEME_REGISTER,
	onEnter: whenAuthenticated((ctx) => {
		const themeId = ctx.params.themeId;
		if (themeId) {
			ThemeActionCreators.openAcceptModal(themeId, i18n);
		}
		return new Redirect(Routes.ME);
	}),
	component: () => <ThemeRegisterPage />,
});

const themeLoginRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	id: 'themeLogin',
	path: Routes.THEME_LOGIN,
	onEnter: whenAuthenticated((ctx) => {
		const themeId = ctx.params.themeId;
		if (themeId) {
			ThemeActionCreators.openAcceptModal(themeId, i18n);
		}
		return new Redirect(Routes.ME);
	}),
	component: () => <ThemeLoginPage />,
});

export const authRouteTree = authLayoutRoute.addChildren([
	loginRoute,
	ssoCallbackRoute,
	registerRoute,
	oauthAuthorizeRoute,
	inviteBaseRoute,
	giftBaseRoute,
	themeBaseRoute,
	inviteRegisterRoute,
	inviteLoginRoute,
	themeRegisterRoute,
	themeLoginRoute,
	forgotPasswordRoute,
	resetPasswordRoute,
	emailRevertRoute,
	verifyEmailRoute,
	authorizeIPRoute,
	pendingRoute,
	reportRoute,
	solanaOnboardingRoute,
	bareVanityRoute,
]);
