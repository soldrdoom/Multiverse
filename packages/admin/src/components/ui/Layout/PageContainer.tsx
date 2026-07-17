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

export interface PageContainerProps {
	maxWidth?: 'full' | '7xl';
}

export function PageContainer({maxWidth = '7xl', children}: PropsWithChildren<PageContainerProps>) {
	const widthClass = maxWidth === 'full' ? 'w-full' : 'max-w-7xl';

	return <div class={`mx-auto ${widthClass} space-y-6`}>{children}</div>;
}
