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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {href} from '@fluxer/marketing/src/UrlUtils';

interface HomeHeaderProps {
	ctx: MarketingContext;
	/** Which pill nav link, if any, should render in its active state. */
	active?: 'home';
}

export function HomeHeader({ctx, active}: HomeHeaderProps): JSX.Element {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);

	return (
		<header class="mv-header">
			<div class="mv-header-inner">
				<a href={href(ctx, '/')} class="mv-brand" aria-label={t('navigation.go_home')}>
					<img src={`${ctx.staticCdnEndpoint}/images/multiverse-mark.png`} alt="" class="mv-brand-logo" />
					<span class="mv-brand-text">MULTIVERSE</span>
				</a>
				<nav class="mv-nav">
					<a href={href(ctx, '/')} class={active === 'home' ? 'mv-nav-link is-active' : 'mv-nav-link'}>
						{t('home.nav.home')}
					</a>
					<a href={href(ctx, '/support')} class="mv-nav-link">
						{t('company_and_resources.support.label')}
					</a>
					<a href={href(ctx, '/roadmap')} class="mv-nav-link">
						{t('company_and_resources.support.roadmap')}
					</a>
					<a href={href(ctx, '/whitepaper')} class="mv-nav-link">
						{t('company_and_resources.support.whitepaper')}
					</a>
					<a href={href(ctx, '/developers')} class="mv-nav-link">
						{t('company_and_resources.support.developers')}
					</a>
				</nav>
				<a href={`${ctx.appEndpoint}/channels/@me`} class="mv-launch">
					{t('home.launch_app')}
				</a>
			</div>
		</header>
	);
}
