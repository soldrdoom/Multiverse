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

import {createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {createOAuth2Application, createUniqueApplicationName} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {
	deleteAccount,
	setPendingDeletionAt,
	triggerDeletionWorker,
	waitForDeletionCompletion,
} from '@fluxer/api/src/user/tests/UserTestUtils';
import {clearWorkerDependencies, setWorkerDependencies} from '@fluxer/api/src/worker/WorkerContext';
import {initializeWorkerDependencies} from '@fluxer/api/src/worker/WorkerDependencies';
import type {ApplicationCommandListResponse} from '@fluxer/schema/src/domains/oauth/BotCommandSchemas';
import type {WorkerTaskHandler, WorkerTaskHelpers} from '@fluxer/worker/src/contracts/WorkerTask';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

async function registerCommand(harness: ApiTestHarness, botToken: string): Promise<void> {
	await createBuilder(harness, `Bot ${botToken}`)
		.put('/applications/@me/commands')
		.body({commands: [{name: 'sol', description: 'Get the current SOL price', options: []}]})
		.expect(HTTP_STATUS.OK)
		.execute();
}

function createMockTaskHelpers(): WorkerTaskHelpers {
	const helpers: WorkerTaskHelpers = {
		logger: {
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			child: () => helpers.logger,
		},
		addJob: vi.fn(async () => {}),
	};
	return helpers;
}

/**
 * Self-account deletion only *schedules* applicationProcessDeletion for each
 * owned application via workerService.addJob (UserDeletionService.tsx) --
 * ApiTestHarness injects a NoopWorkerService, so that job is never actually
 * consumed by the test process. This runs the task handler directly, exactly
 * as the real worker process would once it pulls the job off the queue, so
 * this test exercises the same deletion code path production traffic does.
 */
async function runApplicationProcessDeletionTask(harness: ApiTestHarness, applicationId: string): Promise<void> {
	const snowflakeService = new SnowflakeService(harness.kvProvider);
	await snowflakeService.initialize();
	try {
		const workerDeps = await initializeWorkerDependencies(snowflakeService);
		setWorkerDependencies(workerDeps);

		const module = await import('@fluxer/api/src/worker/tasks/ApplicationProcessDeletion');
		const applicationProcessDeletion: WorkerTaskHandler = module.default;

		await applicationProcessDeletion({applicationId}, createMockTaskHelpers());
	} finally {
		await snowflakeService.shutdown();
		clearWorkerDependencies();
	}
}

describe('Application command cleanup on self-account deletion', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(() => {
		clearWorkerDependencies();
	});

	test('deleting your own account cleans up the commands of applications you owned', async () => {
		const owner = await createTestAccount(harness);
		// A second, unrelated account to query the (auth-required) command list
		// endpoint with after `owner`'s session has been revoked by deletion.
		const observer = await createTestAccount(harness);

		const app = await createOAuth2Application(harness, owner.token, {name: createUniqueApplicationName()});
		await registerCommand(harness, app.botToken);

		const beforeDelete = await createBuilder<ApplicationCommandListResponse>(harness, observer.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(beforeDelete.length).toBe(1);

		await deleteAccount(harness, owner.token, owner.password);

		const past = new Date();
		past.setMinutes(past.getMinutes() - 1);
		await setPendingDeletionAt(harness, owner.userId, past);

		await triggerDeletionWorker(harness);
		await waitForDeletionCompletion(harness, owner.userId);

		await runApplicationProcessDeletionTask(harness, app.application.id);

		// Without the fix, this is the ghost-command scenario: the bot's
		// commands stay live and listable forever because application_commands
		// is keyed on bot_user_id, not application_id, and doesn't cascade
		// automatically from either the user or the application row being
		// deleted.
		const afterDelete = await createBuilder<ApplicationCommandListResponse>(harness, observer.token)
			.get(`/users/${app.botUserId}/application-commands`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(afterDelete).toEqual([]);
	});
});
