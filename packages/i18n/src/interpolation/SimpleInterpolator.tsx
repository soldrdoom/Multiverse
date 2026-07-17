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

export class SimpleInterpolator {
	interpolate(template: string, variables: Record<string, unknown> | ReadonlyArray<unknown>): string {
		return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
			if (/^\d+$/.test(key)) {
				const index = Number.parseInt(key, 10);
				if (Array.isArray(variables) && index < variables.length) {
					return String(variables[index]);
				}
				return match;
			}

			if (!Array.isArray(variables)) {
				const value = (variables as Record<string, unknown>)[key];
				if (value !== undefined) {
					return String(value);
				}
			}

			return match;
		});
	}
}
