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

import {cn} from '@fluxer/admin/src/utils/ClassNames';
import type {Child} from 'hono/jsx';

interface AlertProps {
	variant?: 'success' | 'warning' | 'error' | 'info';
	title?: string;
	children: Child;
	class?: string;
}

export function Alert({variant = 'info', title, children, class: className}: AlertProps) {
	const variantStyles = {
		success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
		warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
		error: 'bg-red-500/10 border-red-500/30 text-red-300',
		info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
	};

	return (
		<div class={cn('rounded-lg border p-4', variantStyles[variant], className)}>
			{title && <div class="mb-2 font-bold">{title}</div>}
			<div>{children}</div>
		</div>
	);
}
