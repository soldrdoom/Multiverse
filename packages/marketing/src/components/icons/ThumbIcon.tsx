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

interface ThumbIconProps {
	size: number;
	/** Thumbs-down is the same glyph rotated 180deg, per the design handoff. */
	down?: boolean;
	class?: string;
}

export function ThumbIcon(props: ThumbIconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={props.size}
			height={props.size}
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={
				props.down
					? `mv-thumb-icon is-down${props.class ? ` ${props.class}` : ''}`
					: `mv-thumb-icon${props.class ? ` ${props.class}` : ''}`
			}
			aria-hidden="true"
		>
			<path d="M3 10h3v11H3z" />
			<path d="M6 11l4.5-8.2c1.4.1 2.3 1.1 2.3 2.5V9h5.3c1.2 0 2.1 1.1 1.9 2.3l-1.2 7A2.2 2.2 0 0 1 16.6 20H6" />
		</svg>
	);
}
