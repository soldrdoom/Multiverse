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

import type {Rarity} from '@app/utils/cosmetics/rarity';

/** The 4 rail-navigated surfaces of the Cosmetics Shop modal. */
export type ShopView = 'shop' | 'creator' | 'your_items' | 'server';

/** Shop-view category filter — combines (AND) with type + rarity. */
export type ShopFilter = 'all' | 'profile' | 'server';

export interface TypeFilterOption {
	type: string;
	label: string;
	count: number;
}

export type RarityFilter = Rarity | null;
