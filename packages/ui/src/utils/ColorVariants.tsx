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

export type ColorTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary' | 'purple' | 'orange';
export type ColorIntensity = 'subtle' | 'normal' | 'strong';

export interface ColorVariant {
	bg: string;
	text: string;
	border?: string;
}

export const colorVariants: Record<ColorTone, Record<ColorIntensity, ColorVariant>> = {
	neutral: {
		subtle: {bg: 'bg-neutral-50', text: 'text-neutral-400', border: 'border-neutral-200'},
		normal: {bg: 'bg-neutral-100', text: 'text-neutral-300', border: 'border-neutral-200'},
		strong: {bg: 'bg-neutral-800', text: 'text-neutral-900'},
	},
	info: {
		subtle: {bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-500/25'},
		normal: {bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30'},
		strong: {bg: 'bg-blue-500', text: 'text-white'},
	},
	success: {
		subtle: {bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/25'},
		normal: {bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30'},
		strong: {bg: 'bg-emerald-500', text: 'text-[#06281c]'},
	},
	warning: {
		subtle: {bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/25'},
		normal: {bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30'},
		strong: {bg: 'bg-amber-500', text: 'text-[#2b1c02]'},
	},
	danger: {
		subtle: {bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/25'},
		normal: {bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30'},
		strong: {bg: 'bg-red-500', text: 'text-white'},
	},
	primary: {
		subtle: {bg: 'bg-[var(--brand-primary-fill)]', text: 'text-[var(--brand-primary)]'},
		normal: {bg: 'bg-[image:var(--gradient-brand)]', text: 'text-[var(--button-primary-text)]'},
		strong: {bg: 'bg-[image:var(--gradient-brand)]', text: 'text-[var(--button-primary-text)]'},
	},
	purple: {
		subtle: {bg: 'bg-purple-500/10', text: 'text-purple-300', border: 'border-purple-500/25'},
		normal: {bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30'},
		strong: {bg: 'bg-purple-500', text: 'text-white'},
	},
	orange: {
		subtle: {bg: 'bg-orange-500/10', text: 'text-orange-300', border: 'border-orange-500/25'},
		normal: {bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30'},
		strong: {bg: 'bg-orange-500', text: 'text-white'},
	},
};

export function getColorClasses(tone: ColorTone, intensity: ColorIntensity = 'normal'): string {
	const variant = colorVariants[tone][intensity];
	const classes = [variant.bg, variant.text];
	if (variant.border) {
		classes.push(variant.border);
	}
	return classes.join(' ');
}

export type AlertTone = 'error' | 'warning' | 'success' | 'info';

export function getAlertClasses(tone: AlertTone): string {
	const toneMapping: Record<AlertTone, ColorTone> = {
		error: 'danger',
		warning: 'warning',
		success: 'success',
		info: 'info',
	};
	return getColorClasses(toneMapping[tone], 'subtle');
}
