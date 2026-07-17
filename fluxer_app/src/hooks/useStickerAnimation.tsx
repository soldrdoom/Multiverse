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

import UserSettingsStore from '@app/stores/UserSettingsStore';
import {StickerAnimationOptions} from '@fluxer/constants/src/UserConstants';
import {useMemo, useState} from 'react';

interface UseStickerAnimationOptions {
	respectUserSettings?: boolean;
	isInteracting?: boolean;
}

interface UseStickerAnimationResult {
	shouldAnimate: boolean;
	interactionHandlers: {
		onMouseEnter: () => void;
		onMouseLeave: () => void;
		onFocus: () => void;
		onBlur: () => void;
	};
}

export function useStickerAnimation(options: UseStickerAnimationOptions = {}): UseStickerAnimationResult {
	const {respectUserSettings = true, isInteracting: isInteractingOverride} = options;
	const [isInteracting, setIsInteracting] = useState(false);

	const animatePreference = UserSettingsStore.getAnimateStickers();

	const shouldAnimate = useMemo(() => {
		if (isInteractingOverride !== undefined) {
			return isInteractingOverride;
		}

		if (!respectUserSettings) {
			return true;
		}

		switch (animatePreference) {
			case StickerAnimationOptions.ALWAYS_ANIMATE:
				return true;
			case StickerAnimationOptions.ANIMATE_ON_INTERACTION:
				return isInteracting;
			case StickerAnimationOptions.NEVER_ANIMATE:
				return false;
			default:
				return true;
		}
	}, [animatePreference, isInteracting, isInteractingOverride, respectUserSettings]);

	const interactionHandlers = {
		onMouseEnter: () => setIsInteracting(true),
		onMouseLeave: () => setIsInteracting(false),
		onFocus: () => setIsInteracting(true),
		onBlur: () => setIsInteracting(false),
	};

	return {shouldAnimate, interactionHandlers};
}
