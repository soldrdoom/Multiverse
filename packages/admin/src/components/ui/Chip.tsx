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

export interface ChipProps {
	active?: boolean;
	href?: string;
}

export function Chip({active = false, href, children}: PropsWithChildren<ChipProps>) {
	const chipClasses = clsx(
		'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors no-underline',
		{
			'border-brand-primary bg-brand-primary text-white': active,
			'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50': !active,
		},
	);

	if (href) {
		return (
			<a href={href} class={chipClasses}>
				{children}
			</a>
		);
	}

	return <span class={chipClasses}>{children}</span>;
}
