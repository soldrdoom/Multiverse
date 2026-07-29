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

interface HomeFooterProps {
	ctx: MarketingContext;
}

export function HomeFooter({ctx}: HomeFooterProps): JSX.Element {
	const t = (key: Parameters<MarketingContext['i18n']['getMessage']>[0]) => ctx.i18n.getMessage(key, ctx.locale);

	return (
		<footer class="mv-footer">
			<span class="mv-footer-copy">{t('home.footer.copyright')}</span>
			<div class="mv-footer-links">
				<a href="https://github.com/fluxerapp/fluxer" class="mv-footer-link">
					{t('home.footer.github')}
				</a>
				<a href="https://docs.fluxer.app" class="mv-footer-link">
					{t('company_and_resources.docs')}
				</a>
				<a href={href(ctx, '/privacy')} class="mv-footer-link">
					{t('home.footer.privacy')}
				</a>
			</div>
		</footer>
	);
}
