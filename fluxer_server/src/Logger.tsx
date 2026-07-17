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

import {createLogger, type Logger as MultiverseLogger} from '@fluxer/logger/src/Logger';

let _logger: MultiverseLogger | null = null;

export interface LoggerInitOptions {
	environment: string;
}

export function initializeLogger(options: LoggerInitOptions): MultiverseLogger {
	if (_logger !== null) {
		return _logger;
	}
	_logger = createLogger('fluxer-server', {environment: options.environment});
	return _logger;
}

export function getLogger(): MultiverseLogger {
	if (_logger === null) {
		throw new Error('Logger has not been initialized. Call initializeLogger() first.');
	}
	return _logger;
}

export const Logger: MultiverseLogger = new Proxy({} as MultiverseLogger, {
	get(_target, prop: keyof MultiverseLogger | symbol) {
		if (_logger === null) {
			throw new Error('Logger has not been initialized. Call initializeLogger() first.');
		}
		const value = _logger[prop as keyof MultiverseLogger];
		if (typeof value === 'function') {
			return value.bind(_logger);
		}
		return value;
	},
	set() {
		throw new Error('Cannot modify Logger directly. Use initializeLogger() instead.');
	},
});

export type Logger = MultiverseLogger;

export function createComponentLogger(component: string): MultiverseLogger {
	return getLogger().child({component});
}
