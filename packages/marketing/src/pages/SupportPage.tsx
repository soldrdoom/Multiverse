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
import {renderContentLayout} from '@fluxer/marketing/src/pages/Layout';
import {pageMeta} from '@fluxer/marketing/src/pages/layout/Meta';
import type {Context} from 'hono';

export async function renderSupportPage(c: Context, ctx: MarketingContext): Promise<Response> {
	const content: ReadonlyArray<JSX.Element> = [renderSupportBody(ctx)];

	const meta = pageMeta(
		`Multiverse | ${ctx.i18n.getMessage('company_and_resources.support.label', ctx.locale)}`,
		ctx.i18n.getMessage('company_and_resources.support.page_description', ctx.locale),
		'website',
	);

	return c.html(renderContentLayout(c, ctx, meta, content, {footerClassName: 'rounded-t-3xl', theme: 'dark'}));
}

const darkCardClass =
	'block rounded-xl border border-white/10 bg-[#151921] p-5 transition-colors duration-150 ease-in-out hover:border-white/20';

function renderSupportBody(ctx: MarketingContext): JSX.Element {
	return (
		<section class="mx-auto max-w-5xl">
			<header class="mb-10 space-y-3">
				<h1 class="font-bold text-4xl text-white">
					{ctx.i18n.getMessage('company_and_resources.support.label', ctx.locale)}
				</h1>
				<p class="text-lg text-white/70">
					{ctx.i18n.getMessage('company_and_resources.support.page_description', ctx.locale)}
				</p>
			</header>
			<div class="help-grid">
				<a href="https://docs.fluxer.app" class={darkCardClass}>
					<h2 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('company_and_resources.support.documentation', ctx.locale)}
					</h2>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('company_and_resources.support.documentation_description', ctx.locale)}
					</p>
				</a>
				<a href="/whitepaper" class={darkCardClass}>
					<h2 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('company_and_resources.support.whitepaper', ctx.locale)}
					</h2>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('company_and_resources.support.whitepaper_description', ctx.locale)}
					</p>
				</a>
				<a href="/roadmap" class={darkCardClass}>
					<h2 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('company_and_resources.support.roadmap', ctx.locale)}
					</h2>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('company_and_resources.support.roadmap_description', ctx.locale)}
					</p>
				</a>
			</div>
		</section>
	);
}
