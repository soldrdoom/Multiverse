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

export enum PricingTier {
	Monthly = 'monthly',
	Yearly = 'yearly',
}

enum Currency {
	USD = 'USD',
	EUR = 'EUR',
}

const EEA_COUNTRIES = [
	'AT',
	'BE',
	'BG',
	'HR',
	'CY',
	'CZ',
	'DK',
	'EE',
	'FI',
	'FR',
	'DE',
	'GR',
	'HU',
	'IE',
	'IT',
	'LV',
	'LT',
	'LU',
	'MT',
	'NL',
	'PL',
	'PT',
	'RO',
	'SK',
	'SI',
	'ES',
	'SE',
	'IS',
	'LI',
	'NO',
];

function getCurrency(countryCode: string | null): Currency {
	if (!countryCode) return Currency.USD;
	return isEEACountry(countryCode) ? Currency.EUR : Currency.USD;
}

function isEEACountry(countryCode: string): boolean {
	return EEA_COUNTRIES.includes(countryCode.toUpperCase());
}

function getPrice(tier: PricingTier, currency: Currency): number {
	const prices: Record<PricingTier, Record<Currency, number>> = {
		[PricingTier.Monthly]: {
			[Currency.USD]: 4.99,
			[Currency.EUR]: 4.99,
		},
		[PricingTier.Yearly]: {
			[Currency.USD]: 49.99,
			[Currency.EUR]: 49.99,
		},
	};

	return prices[tier][currency];
}

function formatPrice(price: number, currency: Currency): string {
	const currencySymbols: Record<Currency, string> = {
		[Currency.USD]: '$',
		[Currency.EUR]: '€',
	};

	return `${currencySymbols[currency]}${price.toFixed(2).replace(/\.00$/, '')}`;
}

export function getFormattedPrice(tier: PricingTier, countryCode: string | null): string {
	const currency = getCurrency(countryCode);
	const price = getPrice(tier, currency);
	return formatPrice(price, currency);
}

const USD_FIXED_PRICES: Record<PricingTier, number> = {
	[PricingTier.Monthly]: 5.00,
	[PricingTier.Yearly]: 50.00,
};

export function getSolPrice(tier: PricingTier): string {
	const price = USD_FIXED_PRICES[tier];
	return `$${price.toFixed(2).replace(/\.00$/, '')}`;
}
