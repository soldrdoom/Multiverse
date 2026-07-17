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

import {getConfig} from '@fluxer/config/src/ConfigLoader';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxBookmarksError extends BadRequestError {
	constructor(params: {maxBookmarks: number; isPremium?: boolean}) {
		const {maxBookmarks, isPremium} = params;
		const config = getConfig();
		const selfHosted = 'self_hosted' in config ? config.self_hosted : false;
		super({
			code: APIErrorCodes.MAX_BOOKMARKS,
			messageVariables: {maxBookmarks},
			data: {
				max_bookmarks: maxBookmarks,
				...(selfHosted || isPremium === undefined ? {} : {is_premium: isPremium}),
			},
		});
	}
}
