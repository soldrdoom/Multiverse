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

import * as UserSettingsActionCreators from '@app/actions/UserSettingsActionCreators';
import i18n, {loadLocaleCatalog} from '@app/I18n';
import {Logger} from '@app/lib/Logger';
import UserSettingsStore from '@app/stores/UserSettingsStore';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const logger = new Logger('LocaleUtils');

interface LocaleInfo {
	code: string;
	name: MessageDescriptor;
	nativeName: string;
	flag: string;
	region?: string;
}

const SUPPORTED_LOCALES: Array<LocaleInfo> = [
	{code: 'ar', name: msg`Arabic`, nativeName: 'العربية', flag: '🇸🇦'},
	{code: 'bg', name: msg`Bulgarian`, nativeName: 'Български', flag: '🇧🇬'},
	{code: 'cs', name: msg`Czech`, nativeName: 'Čeština', flag: '🇨🇿'},
	{code: 'da', name: msg`Danish`, nativeName: 'Dansk', flag: '🇩🇰'},
	{code: 'de', name: msg`German`, nativeName: 'Deutsch', flag: '🇩🇪'},
	{code: 'el', name: msg`Greek`, nativeName: 'Ελληνικά', flag: '🇬🇷'},
	{code: 'en-GB', name: msg`English`, nativeName: 'English', flag: '🇬🇧'},
	{code: 'en-US', name: msg`English (US)`, nativeName: 'English (US)', flag: '🇺🇸'},
	{code: 'es-ES', name: msg`Spanish (Spain)`, nativeName: 'Español (España)', flag: '🇪🇸'},
	{code: 'es-419', name: msg`Spanish (Latin America)`, nativeName: 'Español (Latinoamérica)', flag: '🌎'},
	{code: 'fi', name: msg`Finnish`, nativeName: 'Suomi', flag: '🇫🇮'},
	{code: 'fr', name: msg`French`, nativeName: 'Français', flag: '🇫🇷'},
	{code: 'he', name: msg`Hebrew`, nativeName: 'עברית', flag: '🇮🇱'},
	{code: 'hi', name: msg`Hindi`, nativeName: 'हिन्दी', flag: '🇮🇳'},
	{code: 'hr', name: msg`Croatian`, nativeName: 'Hrvatski', flag: '🇭🇷'},
	{code: 'hu', name: msg`Hungarian`, nativeName: 'Magyar', flag: '🇭🇺'},
	{code: 'id', name: msg`Indonesian`, nativeName: 'Bahasa Indonesia', flag: '🇮🇩'},
	{code: 'it', name: msg`Italian`, nativeName: 'Italiano', flag: '🇮🇹'},
	{code: 'ja', name: msg`Japanese`, nativeName: '日本語', flag: '🇯🇵'},
	{code: 'ko', name: msg`Korean`, nativeName: '한국어', flag: '🇰🇷'},
	{code: 'lt', name: msg`Lithuanian`, nativeName: 'Lietuvių', flag: '🇱🇹'},
	{code: 'nl', name: msg`Dutch`, nativeName: 'Nederlands', flag: '🇳🇱'},
	{code: 'no', name: msg`Norwegian`, nativeName: 'Norsk', flag: '🇳🇴'},
	{code: 'pl', name: msg`Polish`, nativeName: 'Polski', flag: '🇵🇱'},
	{code: 'pt-BR', name: msg`Portuguese (Brazil)`, nativeName: 'Português (Brasil)', flag: '🇧🇷'},
	{code: 'ro', name: msg`Romanian`, nativeName: 'Română', flag: '🇷🇴'},
	{code: 'ru', name: msg`Russian`, nativeName: 'Русский', flag: '🇷🇺'},
	{code: 'sv-SE', name: msg`Swedish`, nativeName: 'Svenska', flag: '🇸🇪'},
	{code: 'th', name: msg`Thai`, nativeName: 'ไทย', flag: '🇹🇭'},
	{code: 'tr', name: msg`Turkish`, nativeName: 'Türkçe', flag: '🇹🇷'},
	{code: 'uk', name: msg`Ukrainian`, nativeName: 'Українська', flag: '🇺🇦'},
	{code: 'vi', name: msg`Vietnamese`, nativeName: 'Tiếng Việt', flag: '🇻🇳'},
	{code: 'zh-CN', name: msg`Chinese (Simplified)`, nativeName: '中文 (简体)', flag: '🇨🇳'},
	{code: 'zh-TW', name: msg`Chinese (Traditional)`, nativeName: '中文 (繁體)', flag: '🇹🇼'},
];

const DEFAULT_LOCALE = 'en-US';

export function getCurrentLocale(): string {
	return UserSettingsStore.getLocale() || DEFAULT_LOCALE;
}

export function setLocale(localeCode: string): void {
	if (!SUPPORTED_LOCALES.find((locale) => locale.code === localeCode)) {
		logger.warn(`Unsupported locale: ${localeCode}`);
		return;
	}

	try {
		const normalized = loadLocaleCatalog(localeCode);
		UserSettingsActionCreators.update({
			locale: normalized,
		});
	} catch (error) {
		logger.error(`Failed to load locale ${localeCode}:`, error);
	}
}

interface TranslatedLocaleInfo {
	code: string;
	name: string;
	nativeName: string;
	flag: string;
	region?: string;
}

export function getSortedLocales(): Array<TranslatedLocaleInfo> {
	return [...SUPPORTED_LOCALES]
		.map((locale) => ({
			...locale,
			name: i18n._(locale.name),
		}))
		.sort((a, b) => a.nativeName.localeCompare(b.nativeName));
}
