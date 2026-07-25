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

import {BlueskyIcon} from '@fluxer/marketing/src/components/icons/BlueskyIcon';
import {DownloadIcon} from '@fluxer/marketing/src/components/icons/DownloadIcon';
import {GithubIcon} from '@fluxer/marketing/src/components/icons/GithubIcon';
import {MenuIcon} from '@fluxer/marketing/src/components/icons/MenuIcon';
import {RssIcon} from '@fluxer/marketing/src/components/icons/RssIcon';
import {TranslateIcon} from '@fluxer/marketing/src/components/icons/TranslateIcon';
import {XIcon} from '@fluxer/marketing/src/components/icons/XIcon';
import {LocaleSelectorTrigger} from '@fluxer/marketing/src/components/LocaleSelector';
import {MarketingButton} from '@fluxer/marketing/src/components/MarketingButton';
import {getPlatformDownloadInfo} from '@fluxer/marketing/src/components/PlatformDownloadButton';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {href} from '@fluxer/marketing/src/UrlUtils';
import {GRADIENTS} from '@fluxer/ui/src/styles/Gradients';
import type {Context} from 'hono';

interface NavigationProps {
	ctx: MarketingContext;
	request: Context;
	theme?: 'light' | 'dark';
}

export function Navigation(props: NavigationProps): JSX.Element {
	const {ctx, theme = 'light'} = props;
	const drawer = getPlatformDownloadInfo(ctx);
	const isDark = theme === 'dark';

	const pillClass = isDark ? 'border-white/10 bg-[#151921]/95' : 'border-gray-200/60 bg-white/95';
	const linkClass = isDark
		? 'body-lg font-semibold text-white/80 transition-colors hover:text-white'
		: 'body-lg font-semibold text-gray-900/90 transition-colors hover:text-gray-900';
	const iconButtonClass = isDark
		? 'hidden items-center rounded-lg p-2 text-[#14F195] transition-colors hover:bg-white/10 hover:text-[#6FFFC2] lg:flex'
		: 'hidden items-center rounded-lg p-2 text-[#4641D9] transition-colors hover:bg-gray-100 hover:text-[#3d38c7] lg:flex';
	const menuIconClass = isDark ? 'h-6 w-6 text-white peer-checked:hidden' : 'h-6 w-6 text-gray-900 peer-checked:hidden';
	const drawerBgClass = isDark ? 'bg-[#0B0E14]' : 'bg-white';
	const drawerCloseButtonClass = isDark
		? 'cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/10'
		: 'cursor-pointer rounded-lg p-2 transition-colors hover:bg-gray-100';
	const drawerCloseIconClass = isDark ? 'h-6 w-6 text-white' : 'h-6 w-6 text-gray-900';
	const drawerSectionTitleClass = isDark
		? 'mb-2 font-semibold text-white/50 text-xs uppercase tracking-wide'
		: 'mb-2 font-semibold text-gray-500 text-xs uppercase tracking-wide';
	const drawerLinkClass = isDark
		? 'rounded-lg py-2.5 pr-3 pl-0 font-semibold text-base text-white transition-colors hover:bg-white/10'
		: 'rounded-lg py-2.5 pr-3 pl-0 font-semibold text-base text-gray-900 transition-colors hover:bg-gray-100';
	const drawerLogoLinkClass = isDark
		? 'flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-white/10'
		: 'flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-gray-50';
	const drawerBorderClass = isDark ? 'border-white/10' : 'border-gray-200';
	const drawerRssIconClass = isDark ? 'h-4 w-4 text-white/60' : 'h-4 w-4 text-gray-500';
	const logoTextColorClass = isDark ? 'text-[#14F195]' : 'text-[#4641D9]';
	const betaBadgeClass = isDark
		? 'absolute right-0 -bottom-1.5 whitespace-nowrap rounded-full border border-white bg-[#14F195] px-1.5 py-0.5 font-bold text-[#0B0E14] text-[8px] leading-none'
		: 'absolute right-0 -bottom-1.5 whitespace-nowrap rounded-full border border-white bg-[#4641D9] px-1.5 py-0.5 font-bold text-white text-[8px] leading-none';

	return (
		<nav id="navbar" class="fixed top-0 right-0 left-0 z-40">
			<input type="checkbox" id="nav-toggle" class="peer hidden" />
			<div class="px-6 py-4 sm:px-8 md:px-12 md:py-5 lg:px-8 xl:px-16">
				<div
					class={`mx-auto max-w-7xl rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-lg md:px-5 md:py-2.5 ${pillClass}`}
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-4 xl:gap-6">
							<a
								href={href(ctx, '/')}
								class="relative z-10 flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
								aria-label={ctx.i18n.getMessage('navigation.go_home', ctx.locale)}
							>
								<img
									src={`${ctx.staticCdnEndpoint}/images/multiverse-mark.png`}
									alt=""
									class="h-8 w-8 shrink-0 object-contain md:h-9 md:w-9"
								/>
								<span class={`font-bold font-display text-lg md:text-xl ${logoTextColorClass}`}>Multiverse</span>
								<span class={betaBadgeClass}>{ctx.i18n.getMessage('beta_and_access.public_beta', ctx.locale)}</span>
							</a>
							<div class="marketing-nav-links hidden items-center gap-4 lg:flex xl:gap-6">
								<a href={href(ctx, '/download')} class={linkClass}>
									{ctx.i18n.getMessage('download.download', ctx.locale)}
								</a>
								<a href={href(ctx, '/help')} class={linkClass}>
									{ctx.i18n.getMessage('company_and_resources.help.label', ctx.locale)}
								</a>
								<a href={href(ctx, '/roadmap')} class={linkClass}>
									{ctx.i18n.getMessage('company_and_resources.support.roadmap', ctx.locale)}
								</a>
								<a href={href(ctx, '/whitepaper')} class={linkClass}>
									{ctx.i18n.getMessage('company_and_resources.support.whitepaper', ctx.locale)}
								</a>
								<a href="https://docs.fluxer.app" class={linkClass}>
									{ctx.i18n.getMessage('company_and_resources.docs', ctx.locale)}
								</a>
								<a href="https://blog.fluxer.app" class={linkClass}>
									{ctx.i18n.getMessage('company_and_resources.blog', ctx.locale)}
								</a>
							</div>
						</div>
						<div class="flex items-center gap-1 xl:gap-2">
							<a
								href="https://bsky.app/profile/fluxer.app"
								class={iconButtonClass}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={ctx.i18n.getMessage('social_and_feeds.bluesky.label', ctx.locale)}
							>
								<BlueskyIcon class="h-5 w-5" />
							</a>
							<a
								href="https://github.com/fluxerapp/fluxer"
								class={iconButtonClass}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={ctx.i18n.getMessage('social_and_feeds.github', ctx.locale)}
							>
								<GithubIcon class="h-5 w-5" />
							</a>
							<a
								href="https://blog.fluxer.app/rss/"
								class={`marketing-nav-rss ${iconButtonClass.replace('lg:flex', 'xl:flex')}`}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={ctx.i18n.getMessage('social_and_feeds.rss.label', ctx.locale)}
							>
								<RssIcon class="h-5 w-5" />
							</a>
							<LocaleSelectorTrigger
								ctx={ctx}
								className={`hidden lg:flex ${isDark ? 'text-[#14F195] hover:text-[#6FFFC2]' : 'text-[#4641D9] hover:text-[#3d38c7]'}`}
								dark={isDark}
							/>
							<MarketingButton
								href={`${ctx.appEndpoint}/channels/@me`}
								size="medium"
								class={`${GRADIENTS.purple} ml-2 hidden whitespace-nowrap lg:inline-flex lg:px-4 lg:py-2 lg:text-sm xl:px-6 xl:py-3 xl:text-base`}
							>
								{ctx.i18n.getMessage('app.open.open_fluxer', ctx.locale)}
							</MarketingButton>
							<label
								for="nav-toggle"
								class={`relative z-10 flex cursor-pointer items-center justify-center rounded-lg p-2 transition-colors lg:hidden ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
							>
								<MenuIcon class={menuIconClass} />
							</label>
						</div>
					</div>
				</div>
			</div>
			<div class="pointer-events-none fixed inset-0 z-50 bg-black/50 opacity-0 backdrop-blur-sm transition-opacity peer-checked:pointer-events-auto peer-checked:opacity-100 lg:hidden">
				<button
					type="button"
					onclick="document.getElementById('nav-toggle').checked = false"
					class="absolute inset-0"
					aria-label={ctx.i18n.getMessage('navigation.close_navigation_menu', ctx.locale)}
				></button>
			</div>
			<div
				class={`fixed top-0 right-0 bottom-0 z-50 w-full translate-x-full transform overflow-y-auto rounded-none shadow-2xl transition-transform peer-checked:translate-x-0 sm:w-[420px] sm:max-w-[90vw] sm:rounded-l-3xl lg:hidden ${drawerBgClass}`}
			>
				<div class="flex h-full flex-col p-6">
					<div class="mb-6 flex items-center justify-between">
						<a
							href={href(ctx, '/')}
							class={drawerLogoLinkClass}
							aria-label={ctx.i18n.getMessage('navigation.go_home', ctx.locale)}
						>
							<img
								src={`${ctx.staticCdnEndpoint}/images/multiverse-mark.png`}
								alt=""
								class="h-7 w-7 shrink-0 object-contain"
							/>
							<span class={`font-bold font-display text-lg ${logoTextColorClass}`}>Multiverse</span>
						</a>
						<label for="nav-toggle" class={drawerCloseButtonClass}>
							<XIcon class={drawerCloseIconClass} />
						</label>
					</div>
					<div class="-mx-2 flex-1 overflow-y-auto px-2">
						<div class="flex flex-col gap-6">
							<div>
								<p class={drawerSectionTitleClass}>
									{ctx.i18n.getMessage('company_and_resources.product', ctx.locale)}
								</p>
								<div class="flex flex-col gap-1">
									<a href={href(ctx, '/download')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('download.download', ctx.locale)}
									</a>
									<a href={href(ctx, '/partners')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('partner_program.label', ctx.locale)}
									</a>
								</div>
							</div>
							<div>
								<p class={drawerSectionTitleClass}>
									{ctx.i18n.getMessage('company_and_resources.resources', ctx.locale)}
								</p>
								<div class="flex flex-col gap-1">
									<a href={href(ctx, '/help')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.help.help_center', ctx.locale)}
									</a>
									<a href={href(ctx, '/roadmap')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.support.roadmap', ctx.locale)}
									</a>
									<a href={href(ctx, '/whitepaper')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.support.whitepaper', ctx.locale)}
									</a>
									<a href="https://docs.fluxer.app" class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.docs', ctx.locale)}
									</a>
									<a href="https://blog.fluxer.app" class={`flex items-center gap-2 ${drawerLinkClass}`}>
										{ctx.i18n.getMessage('company_and_resources.blog', ctx.locale)}
										<RssIcon class={drawerRssIconClass} />
									</a>
									<a href={href(ctx, '/press')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.press.label', ctx.locale)}
									</a>
								</div>
							</div>
							<div>
								<p class={drawerSectionTitleClass}>
									{ctx.i18n.getMessage('company_and_resources.connect', ctx.locale)}
								</p>
								<div class="flex flex-col gap-1">
									<a
										href="https://bsky.app/profile/fluxer.app"
										class={drawerLinkClass}
										target="_blank"
										rel="noopener noreferrer"
									>
										{ctx.i18n.getMessage('social_and_feeds.bluesky.label', ctx.locale)}
									</a>
									<a
										href="https://github.com/fluxerapp/fluxer"
										class={drawerLinkClass}
										target="_blank"
										rel="noopener noreferrer"
									>
										{ctx.i18n.getMessage('company_and_resources.source_and_contribution.source_code', ctx.locale)}
									</a>
								</div>
							</div>
							<div>
								<p class={drawerSectionTitleClass}>
									{ctx.i18n.getMessage('company_and_resources.company', ctx.locale)}
								</p>
								<div class="flex flex-col gap-1">
									<a href={href(ctx, '/company-information')} class={drawerLinkClass}>
										{ctx.i18n.getMessage('company_and_resources.company_info', ctx.locale)}
									</a>
								</div>
							</div>
						</div>
						<div class={`mt-4 flex flex-col gap-3 border-t pt-4 ${drawerBorderClass}`}>
							<MobileDrawerButton
								href={href(ctx, '#locale-modal-backdrop')}
								id="locale-button"
								ariaLabel={ctx.i18n.getMessage('languages.change_language', ctx.locale)}
								className="locale-toggle"
								icon={<TranslateIcon class="h-5 w-5" />}
								label={ctx.i18n.getMessage('languages.language_label', ctx.locale)}
								dark={isDark}
							/>
							<MobileDrawerButton
								href={drawer.url}
								icon={<DownloadIcon class="h-5 w-5" />}
								label={ctx.i18n.getMessage('download.download', ctx.locale)}
								dark={isDark}
							/>
						</div>
					</div>
					<div class="pt-6">
						<MarketingButton
							href={`${ctx.appEndpoint}/channels/@me`}
							size="medium"
							class={`${GRADIENTS.purple} flex w-full items-center justify-center px-5 py-3`}
						>
							{ctx.i18n.getMessage('app.open.open_fluxer', ctx.locale)}
						</MarketingButton>
					</div>
				</div>
			</div>
		</nav>
	);
}

interface MobileDrawerButtonProps {
	href: string;
	icon?: JSX.Element;
	label: string;
	ariaLabel?: string;
	id?: string;
	className?: string;
	target?: string;
	rel?: string;
	dark?: boolean;
}

function MobileDrawerButton(props: MobileDrawerButtonProps): JSX.Element {
	const {href, icon, label, ariaLabel, id, className, target, rel, dark = false} = props;
	const baseClass = dark
		? 'flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 font-semibold text-base text-white transition-colors hover:bg-white/10 lg:hidden'
		: 'flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 font-semibold text-base text-gray-900 transition-colors hover:bg-gray-100 lg:hidden';
	const classes = [baseClass, className].filter(Boolean).join(' ');

	return (
		<a href={href} id={id} aria-label={ariaLabel} class={classes} target={target} rel={rel}>
			{icon}
			<span class="flex-1 text-left">{label}</span>
		</a>
	);
}
