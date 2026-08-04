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

import AppStorage from '@app/lib/AppStorage';
import {Logger} from '@app/lib/Logger';
import {getNativeLocaleIdentifier} from '@app/lib/Platform';
import {i18n, type Messages} from '@lingui/core';

const supportedLocales = [
	'ar',
	'bg',
	'cs',
	'da',
	'de',
	'el',
	'en-GB',
	'en-US',
	'es-ES',
	'es-419',
	'fi',
	'fr',
	'he',
	'hi',
	'hr',
	'hu',
	'id',
	'it',
	'ja',
	'ko',
	'lt',
	'nl',
	'no',
	'pl',
	'pt-BR',
	'ro',
	'ru',
	'sv-SE',
	'th',
	'tr',
	'uk',
	'vi',
	'zh-CN',
	'zh-TW',
] as const;

type LocaleCode = (typeof supportedLocales)[number];
const DEFAULT_LOCALE: LocaleCode = 'en-US';
const supportedLocaleSet = new Set<LocaleCode>(supportedLocales);

const logger = new Logger('i18n');

const LANGUAGE_OVERRIDES: Record<string, LocaleCode> = {
	en: 'en-US',
};

type LocaleLoader = () => Promise<{messages: Messages}>;

// Dynamic imports: previously these were static top-level imports of all 33 catalogs, which
// meant every visitor's initial bundle shipped every locale's translations (~11MB, by far the
// single largest contributor to the eager bundle) even though only one is ever active per
// session. Each entry now becomes its own on-demand chunk, fetched only for the resolved locale.
const loaders: Record<LocaleCode, LocaleLoader> = {
	ar: () => import('@app/locales/ar/messages.mjs'),
	bg: () => import('@app/locales/bg/messages.mjs'),
	cs: () => import('@app/locales/cs/messages.mjs'),
	da: () => import('@app/locales/da/messages.mjs'),
	de: () => import('@app/locales/de/messages.mjs'),
	el: () => import('@app/locales/el/messages.mjs'),
	'en-GB': () => import('@app/locales/en-GB/messages.mjs'),
	'en-US': () => import('@app/locales/en-US/messages.mjs'),
	'es-ES': () => import('@app/locales/es-ES/messages.mjs'),
	'es-419': () => import('@app/locales/es-419/messages.mjs'),
	fi: () => import('@app/locales/fi/messages.mjs'),
	fr: () => import('@app/locales/fr/messages.mjs'),
	he: () => import('@app/locales/he/messages.mjs'),
	hi: () => import('@app/locales/hi/messages.mjs'),
	hr: () => import('@app/locales/hr/messages.mjs'),
	hu: () => import('@app/locales/hu/messages.mjs'),
	id: () => import('@app/locales/id/messages.mjs'),
	it: () => import('@app/locales/it/messages.mjs'),
	ja: () => import('@app/locales/ja/messages.mjs'),
	ko: () => import('@app/locales/ko/messages.mjs'),
	lt: () => import('@app/locales/lt/messages.mjs'),
	nl: () => import('@app/locales/nl/messages.mjs'),
	no: () => import('@app/locales/no/messages.mjs'),
	pl: () => import('@app/locales/pl/messages.mjs'),
	'pt-BR': () => import('@app/locales/pt-BR/messages.mjs'),
	ro: () => import('@app/locales/ro/messages.mjs'),
	ru: () => import('@app/locales/ru/messages.mjs'),
	'sv-SE': () => import('@app/locales/sv-SE/messages.mjs'),
	th: () => import('@app/locales/th/messages.mjs'),
	tr: () => import('@app/locales/tr/messages.mjs'),
	uk: () => import('@app/locales/uk/messages.mjs'),
	vi: () => import('@app/locales/vi/messages.mjs'),
	'zh-CN': () => import('@app/locales/zh-CN/messages.mjs'),
	'zh-TW': () => import('@app/locales/zh-TW/messages.mjs'),
};

function formatLocaleValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}

	const segments = trimmed.split(/[-_]/).filter(Boolean);
	if (segments.length === 0) {
		return '';
	}

	const language = segments[0].toLowerCase();
	if (segments.length === 1) {
		return language;
	}

	const region = segments
		.slice(1)
		.map((segment) => segment.toUpperCase())
		.join('-');

	return `${language}-${region}`;
}

function normalizeLocale(value?: string | null): LocaleCode {
	if (!value) {
		return DEFAULT_LOCALE;
	}

	const formatted = formatLocaleValue(value);
	if (!formatted) {
		return DEFAULT_LOCALE;
	}

	if (supportedLocaleSet.has(formatted as LocaleCode)) {
		return formatted as LocaleCode;
	}

	const [language] = formatted.split('-');
	if (!language) {
		return DEFAULT_LOCALE;
	}

	const override = LANGUAGE_OVERRIDES[language];
	if (override) {
		return override;
	}

	const fallback = supportedLocales.find((code) => code.split('-')[0].toLowerCase() === language);
	if (fallback) {
		return fallback;
	}

	return DEFAULT_LOCALE;
}

function detectBrowserLocale(): string | null {
	if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
		return navigator.languages[0];
	}

	return navigator.language ?? null;
}

function detectPreferredLocale(forceLocale?: string): LocaleCode {
	if (forceLocale) {
		return normalizeLocale(forceLocale);
	}

	const storedLocale = AppStorage.getItem('locale');
	if (storedLocale) {
		return normalizeLocale(storedLocale);
	}

	const nativeLocale = getNativeLocaleIdentifier();
	if (nativeLocale) {
		return normalizeLocale(nativeLocale);
	}

	const browserLocale = detectBrowserLocale();
	if (browserLocale) {
		return normalizeLocale(browserLocale);
	}

	return DEFAULT_LOCALE;
}

async function activateLocaleCatalog(normalized: LocaleCode): Promise<void> {
	const {messages} = await loaders[normalized]();
	i18n.loadAndActivate({locale: normalized, messages});
}

// Synchronous signature preserved for existing callers (UserSettingsStore, LocaleUtils) that
// assign the returned code immediately without needing the catalog to have finished loading yet
// — the fetch+activate happens in the background. Prefer `loadLocaleCatalogAsync` when the
// caller can await (e.g. initial boot, where rendering before the catalog is ready would flash
// untranslated message IDs).
export function loadLocaleCatalog(localeCode: string): LocaleCode {
	const normalized = normalizeLocale(localeCode);
	AppStorage.setItem('locale', normalized);
	void activateLocaleCatalog(normalized).catch((error) => {
		logger.error(`Failed to load locale catalog for ${normalized}`, error);
	});
	return normalized;
}

export async function loadLocaleCatalogAsync(localeCode: string): Promise<LocaleCode> {
	const normalized = normalizeLocale(localeCode);
	await activateLocaleCatalog(normalized);
	AppStorage.setItem('locale', normalized);
	return normalized;
}

let initPromise: Promise<typeof i18n> | null = null;

export async function initI18n(forceLocale?: string) {
	if (!initPromise) {
		initPromise = (async () => {
			try {
				const localeToLoad = detectPreferredLocale(forceLocale);
				await loadLocaleCatalogAsync(localeToLoad);
			} catch (error) {
				logger.error('Failed to initialize i18n, falling back to default locale', error);
				await loadLocaleCatalogAsync(DEFAULT_LOCALE);
			}

			return i18n;
		})();
	}

	return initPromise;
}

export default i18n;
