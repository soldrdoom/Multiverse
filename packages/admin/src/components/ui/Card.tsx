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

import clsx from 'clsx';
import type {PropsWithChildren} from 'hono/jsx';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type CardVariant = 'default' | 'bordered' | 'elevated';

export interface CardProps {
	padding?: CardPadding;
	variant?: CardVariant;
	className?: string;
}

const paddingClasses: Record<CardPadding, string> = {
	none: 'p-0',
	sm: 'p-4',
	md: 'p-6',
	lg: 'p-8',
	xl: 'p-12',
};

const variantClasses: Record<CardVariant, string> = {
	default: 'border border-[var(--vanguard-glass-border)]',
	bordered: 'border-2 border-[var(--brand-primary)]/30',
	elevated:
		'border border-[var(--vanguard-glass-border)] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6),0_0_40px_var(--vanguard-glass-glow-a)]',
};

export function Card({padding = 'md', variant = 'default', className, children}: PropsWithChildren<CardProps>) {
	const classes = clsx(
		'rounded-lg bg-[var(--background-secondary)]',
		variantClasses[variant],
		paddingClasses[padding],
		className,
	);

	return <div class={classes}>{children}</div>;
}
