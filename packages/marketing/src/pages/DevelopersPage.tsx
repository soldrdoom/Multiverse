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

import {MarketingButton} from '@fluxer/marketing/src/components/MarketingButton';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {renderContentLayout} from '@fluxer/marketing/src/pages/Layout';
import {pageMeta} from '@fluxer/marketing/src/pages/layout/Meta';
import {GRADIENTS} from '@fluxer/ui/src/styles/Gradients';
import type {Context} from 'hono';

const DOCS_URL = 'https://docs.fluxer.app';

export async function renderDevelopersPage(c: Context, ctx: MarketingContext): Promise<Response> {
	const content: ReadonlyArray<JSX.Element> = [renderDevelopersBody(ctx)];

	const meta = pageMeta(
		`Multiverse | ${ctx.i18n.getMessage('company_and_resources.support.developers', ctx.locale)}`,
		ctx.i18n.getMessage('company_and_resources.support.developers_description', ctx.locale),
		'website',
	);

	return c.html(renderContentLayout(c, ctx, meta, content, {footerClassName: 'rounded-t-3xl', theme: 'dark'}));
}

const darkCardClass =
	'block rounded-xl border border-white/10 bg-[#151921] p-5 transition-colors duration-150 ease-in-out hover:border-white/20';

function renderDevelopersBody(ctx: MarketingContext): JSX.Element {
	return (
		<section class="mx-auto max-w-5xl">
			<header class="mb-10 space-y-3">
				<h1 class="font-bold text-4xl text-white">{ctx.i18n.getMessage('developers_page.hero.title', ctx.locale)}</h1>
				<p class="text-lg text-white/70">{ctx.i18n.getMessage('developers_page.hero.description', ctx.locale)}</p>
				<div class="flex flex-wrap items-center gap-4 pt-2">
					<MarketingButton
						href={`${ctx.appEndpoint}/channels/@me`}
						size="medium"
						class={`${GRADIENTS.purple} whitespace-nowrap`}
					>
						{ctx.i18n.getMessage('developers_page.hero.create_app', ctx.locale)}
					</MarketingButton>
					<a href={DOCS_URL} class="font-semibold text-[#14F195] transition-colors hover:text-[#6FFFC2]">
						{ctx.i18n.getMessage('developers_page.hero.read_the_docs', ctx.locale)}
					</a>
				</div>
				<p class="text-sm text-white/50">{ctx.i18n.getMessage('developers_page.hero.create_app_hint', ctx.locale)}</p>
			</header>

			<h2 class="mb-4 font-bold text-2xl text-white">
				{ctx.i18n.getMessage('developers_page.today.title', ctx.locale)}
			</h2>
			<div class="help-grid">
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.applications.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.applications.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.tokens.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.tokens.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.teams.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.teams.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.portal.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.portal.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.sdk.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.sdk.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.today.compatibility.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.today.compatibility.description', ctx.locale)}
					</p>
				</div>
			</div>

			<h2 class="mt-14 mb-2 font-bold text-2xl text-white">
				{ctx.i18n.getMessage('developers_page.not_yet.title', ctx.locale)}
			</h2>
			<p class="mb-6 text-sm text-white/60">{ctx.i18n.getMessage('developers_page.not_yet.description', ctx.locale)}</p>
			<div class="help-grid">
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.not_yet.interactions.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.not_yet.interactions.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.not_yet.sharding.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.not_yet.sharding.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.not_yet.intents.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.not_yet.intents.description', ctx.locale)}
					</p>
				</div>
				<div class={darkCardClass}>
					<h3 class="mb-1 font-semibold text-white">
						{ctx.i18n.getMessage('developers_page.not_yet.directory.title', ctx.locale)}
					</h3>
					<p class="text-sm text-white/60">
						{ctx.i18n.getMessage('developers_page.not_yet.directory.description', ctx.locale)}
					</p>
				</div>
			</div>
		</section>
	);
}
