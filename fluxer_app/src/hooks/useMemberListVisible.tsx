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

import MemberListStore from '@app/stores/MemberListStore';
import {useEffect, useState} from 'react';

const MIN_WIDTH_FOR_MEMBERS = 1024;

export const useMemberListVisible = (): boolean => {
	const {isMembersOpen} = MemberListStore;
	const [canFit, setCanFit] = useState(() => window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);

	useEffect(() => {
		const checkWidth = () => {
			setCanFit(window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
		};

		window.addEventListener('resize', checkWidth);
		return () => window.removeEventListener('resize', checkWidth);
	}, []);

	return isMembersOpen && canFit;
};

export const useCanFitMemberList = (): boolean => {
	const [canFit, setCanFit] = useState(() => window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);

	useEffect(() => {
		const checkWidth = () => {
			setCanFit(window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
		};

		window.addEventListener('resize', checkWidth);
		return () => window.removeEventListener('resize', checkWidth);
	}, []);

	return canFit;
};
