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

export interface Flash {
	message: string;
	type: 'success' | 'error' | 'info' | 'warning';
	detail?: string;
}

export function serializeFlash(flash: Flash): string {
	return Buffer.from(JSON.stringify(flash)).toString('base64url');
}

export function parseFlash(cookie: string | undefined): Flash | undefined {
	if (!cookie) {
		return undefined;
	}

	try {
		const decoded = Buffer.from(cookie, 'base64url').toString('utf-8');
		const flash = JSON.parse(decoded) as Flash;

		if (
			typeof flash.message === 'string' &&
			typeof flash.type === 'string' &&
			['success', 'error', 'info', 'warning'].includes(flash.type)
		) {
			return flash;
		}

		return undefined;
	} catch {
		return undefined;
	}
}
