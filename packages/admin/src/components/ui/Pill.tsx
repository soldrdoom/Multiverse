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

export interface PillProps {
	tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
}

export function Pill({tone = 'neutral', children}: PropsWithChildren<PillProps>) {
	const classes = clsx('inline-block rounded-lg border px-3 py-2 font-medium text-sm', {
		'border-neutral-200 bg-neutral-100 text-neutral-700': tone === 'neutral',
		'border-emerald-500/30 bg-emerald-500/10 text-emerald-300': tone === 'success',
		'border-red-500/30 bg-red-500/10 text-red-300': tone === 'danger',
		'border-amber-500/30 bg-amber-500/10 text-amber-300': tone === 'warning',
		'border-blue-500/30 bg-blue-500/10 text-blue-300': tone === 'info',
	});

	return <span class={classes}>{children}</span>;
}
