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

import {type Flash, parseFlash} from '@fluxer/hono/src/Flash';
import {getAlertClasses} from '@fluxer/ui/src/utils/ColorVariants';

export interface FlashMessageProps {
	flash: Flash;
}

export function FlashMessage({flash}: FlashMessageProps) {
	return (
		<div class={`rounded-lg border px-4 py-3 text-sm ${getAlertClasses(flash.type)}`}>
			<div>{flash.message}</div>
			{flash.detail && (
				<div class="mt-2 break-all rounded border border-current/20 bg-black/20 px-3 py-2 font-mono text-xs">
					{flash.detail}
				</div>
			)}
		</div>
	);
}

export function parseFlashFromCookie(cookieHeader: string | null): Flash | undefined {
	if (cookieHeader === null) {
		return undefined;
	}
	return parseFlash(cookieHeader) ?? undefined;
}
