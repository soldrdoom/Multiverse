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

import type {Child, FC} from 'hono/jsx';

interface TextLinkProps {
	href: string;
	children: Child;
	external?: boolean;
	mono?: boolean;
	class?: string;
}

export const TextLink: FC<TextLinkProps> = ({
	href,
	children,
	external = false,
	mono = false,
	class: className = '',
}) => {
	const baseClass = `text-brand-primary underline decoration-brand-primary/30 hover:text-brand-primary-light hover:decoration-brand-primary-light/50 ${mono ? 'font-mono' : ''} ${className}`;
	const externalProps = external ? {target: '_blank', rel: 'noopener noreferrer'} : {};

	return (
		<a href={href} class={baseClass} {...externalProps}>
			{children}
		</a>
	);
};
