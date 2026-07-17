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

import {formatDuration as formatDurationBase} from '@fluxer/date_utils/src/DateDuration';

export const formatDuration = (seconds: number | null | undefined): string => {
	if (!seconds || seconds <= 0) return '0:00';
	return formatDurationBase(seconds);
};

export const getFileExtension = (filename: string, contentType: string): string => {
	const extension = filename.split('.').pop()?.toUpperCase();
	if (extension && extension.length <= 4) return extension;

	const typeMatch = contentType.match(/\/([^;]+)/);
	return typeMatch?.[1]?.toUpperCase() || 'FILE';
};
