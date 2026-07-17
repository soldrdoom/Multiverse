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

import type {TracingInterface} from '@fluxer/worker/src/contracts/WorkerTypes';
import {HttpWorkerQueue} from '@fluxer/worker/src/providers/HttpWorkerQueue';
import type {IQueueProvider} from '@fluxer/worker/src/providers/IQueueProvider';

export interface QueueProviderFactoryOptions {
	queueProvider?: IQueueProvider | undefined;
	queueBaseUrl?: string | undefined;
	timeoutMs?: number | undefined;
	tracing?: TracingInterface | undefined;
}

export function createQueueProvider(options: QueueProviderFactoryOptions): IQueueProvider {
	if (options.queueProvider) {
		return options.queueProvider;
	}

	if (!options.queueBaseUrl) {
		throw new Error('Queue provider requires either queueProvider or queueBaseUrl');
	}

	return new HttpWorkerQueue({
		baseUrl: options.queueBaseUrl,
		timeoutMs: options.timeoutMs,
		tracing: options.tracing,
	});
}
