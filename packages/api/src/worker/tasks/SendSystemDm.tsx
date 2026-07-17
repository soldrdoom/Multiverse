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

import {SystemDmExecutor} from '@fluxer/api/src/worker/executors/SystemDmExecutor';
import {getWorkerDependencies} from '@fluxer/api/src/worker/WorkerContext';
import type {WorkerTaskHelpers} from '@fluxer/worker/src/contracts/WorkerTask';
import {z} from 'zod';

const PayloadSchema = z.object({
	job_id: z.string(),
});

export async function sendSystemDm(payload: unknown, helpers: WorkerTaskHelpers): Promise<void> {
	const validated = PayloadSchema.parse(payload);
	const deps = getWorkerDependencies();
	const executor = new SystemDmExecutor(deps, helpers.logger);
	await executor.execute(validated);
}
