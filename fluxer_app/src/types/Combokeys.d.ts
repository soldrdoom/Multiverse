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

declare module 'combokeys' {
	export interface CombokeysInstance {
		bind: (
			key: string,
			callback: (event?: KeyboardEvent | undefined) => void,
			action?: 'keydown' | 'keyup' | 'keypress',
		) => void;
		unbind: (key: string, action?: 'keydown' | 'keyup' | 'keypress') => void;
		detach: () => void;
		reset: () => void;
		stopCallback: () => boolean;
	}

	export interface CombokeysConstructor {
		new (element?: HTMLElement): CombokeysInstance;
	}

	const Combokeys: CombokeysConstructor;
	export default Combokeys;
}
