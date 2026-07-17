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

import type {PropsWithChildren} from 'hono/jsx';

export interface FormGridProps {
	cols?: 2 | 3 | 4;
	gap?: 'sm' | 'md' | 'lg';
}

const colsClasses = {
	2: 'md:grid-cols-2',
	3: 'md:grid-cols-3',
	4: 'md:grid-cols-4',
};

const gapClasses = {
	sm: 'gap-2',
	md: 'gap-4',
	lg: 'gap-6',
};

export function FormGrid({cols = 2, gap = 'md', children}: PropsWithChildren<FormGridProps>) {
	return <div class={`grid grid-cols-1 ${colsClasses[cols]} ${gapClasses[gap]}`}>{children}</div>;
}
