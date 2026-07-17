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

import {useEffect, useState} from 'react';

export function useTextOverflow(ref: React.RefObject<HTMLElement | null>): boolean {
	const [isOverflowing, setIsOverflowing] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			setIsOverflowing(false);
			return;
		}

		const checkOverflow = () => {
			const {scrollWidth, clientWidth} = el;
			setIsOverflowing(scrollWidth - clientWidth > 1);
		};

		checkOverflow();

		const resizeObserver = new ResizeObserver(checkOverflow);
		resizeObserver.observe(el);

		return () => {
			resizeObserver.disconnect();
		};
	}, [ref]);

	return isOverflowing;
}
