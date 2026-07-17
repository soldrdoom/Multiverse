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

import type {Gif} from '@app/actions/GifActionCreators';

export type View = 'default' | 'trending';
export type GifPickerGridItemData =
	| {
			type: 'category';
			key: string;
			id: string;
			title: string;
			categoryKind: 'favorites' | 'trending' | 'category';
			previewUrl: string;
			previewProxySrc: string;
			width: number;
			height: number;
	  }
	| {
			type: 'gif';
			key: string;
			gif: Gif;
	  }
	| {
			type: 'skeleton';
			key: string;
			width: number;
			height: number;
	  };
