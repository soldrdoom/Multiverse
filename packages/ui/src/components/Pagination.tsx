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

export interface PaginationProps {
	currentPage: number;
	totalPages: number;
	basePath?: string;
	showPageNumbers?: boolean;
	previousLabel?: string;
	nextLabel?: string;
	pageInfo?: string;
	buildUrlFn?: (page: number) => string;
}

export function Pagination({
	currentPage,
	totalPages,
	basePath = '',
	showPageNumbers = true,
	previousLabel = '← Previous',
	nextLabel = 'Next →',
	pageInfo,
	buildUrlFn,
}: PaginationProps) {
	const hasPrevious = currentPage > 0;
	const hasNext = currentPage < totalPages - 1;

	const getPageUrl = (page: number) => {
		if (buildUrlFn) {
			return `${basePath}${buildUrlFn(page)}`;
		}
		return `${basePath}?page=${page}`;
	};

	const previousButton = hasPrevious ? (
		<a
			href={getPageUrl(currentPage - 1)}
			class="rounded-lg border border-neutral-300 bg-[var(--background-secondary)] px-6 py-2 font-medium text-neutral-900 text-sm no-underline transition-colors hover:border-neutral-400"
		>
			{previousLabel}
		</a>
	) : (
		<div class="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-6 py-2 font-medium text-neutral-400 text-sm">
			{previousLabel}
		</div>
	);

	const nextButton = hasNext ? (
		<a
			href={getPageUrl(currentPage + 1)}
			class="rounded-lg bg-[image:var(--gradient-brand)] px-6 py-2 font-semibold text-[var(--button-primary-text)] text-sm no-underline transition-[filter] hover:brightness-110"
		>
			{nextLabel}
		</a>
	) : (
		<div class="cursor-not-allowed rounded-lg bg-neutral-100 px-6 py-2 font-medium text-neutral-400 text-sm">
			{nextLabel}
		</div>
	);

	const pageIndicator = pageInfo ?? `Page ${currentPage + 1} of ${totalPages}`;

	return (
		<div class="mt-6 flex items-center justify-center gap-3">
			{previousButton}
			{showPageNumbers && <span class="text-neutral-600 text-sm">{pageIndicator}</span>}
			{nextButton}
		</div>
	);
}
