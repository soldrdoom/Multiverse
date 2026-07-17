/*
(global as any).services = { s3: { app: { route: () => {} } } };
(global as any).services = { s3: { app: { route: () => {} } } };
(global as any).config = { storage: { s3: {} } };
(global as any).services = { s3: { app: { route: () => {} }, getS3Service: () => ({}) } };
(global as any).config = { storage: { s3: {} } };
(global as any).services = { s3: { app: { route: () => {} }, getS3Service: () => ({}) } };
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

import {Config} from '@app/Config';
import {createMultiverseServer, type MultiverseServerResult} from '@app/index';
import {initializeLogger, Logger} from '@app/Logger';
import {setupGracefulShutdown} from '@fluxer/hono/src/Server';

initializeLogger({environment: Config.env});

let fluxerServer: MultiverseServerResult | null = null;
let isExiting = false;

async function shutdownServer(reason: string): Promise<void> {
	if (isExiting) {
		Logger.warn({reason}, 'Already shutting down, ignoring signal');
		return;
	}
	isExiting = true;

	Logger.info({reason}, 'Initiating shutdown');

	if (fluxerServer !== null) {
		try {
			await fluxerServer.shutdown();
			Logger.info('Shutdown completed successfully');
		} catch (error) {
			Logger.error({error: error instanceof Error ? error.message : 'Unknown error'}, 'Error during shutdown');
			throw error;
		}
	} else {
		Logger.warn('No server instance to shut down');
		throw new Error('No server instance to shut down');
	}
}

async function main(): Promise<void> {
	try {
		Logger.info('Creating Multiverse Server');
		fluxerServer = await createMultiverseServer({
			staticDir: Config.services.server?.static_dir,
		});

		Logger.info('Running service initialization');
		await fluxerServer.initialize();

		setupGracefulShutdown(async () => shutdownServer('signal'), {logger: Logger, timeoutMs: 30000});

		process.on('uncaughtException', (error) => {
			Logger.fatal({error: error.message, stack: error.stack}, 'Uncaught exception - forcing shutdown');
			void shutdownServer('uncaughtException').then(
				() => process.exit(1),
				() => process.exit(1),
			);
		});

		process.on('unhandledRejection', (reason) => {
			Logger.fatal(
				{
					reason: reason instanceof Error ? reason.message : String(reason),
					stack: reason instanceof Error ? reason.stack : undefined,
				},
				'Unhandled promise rejection - forcing shutdown',
			);
			void shutdownServer('unhandledRejection').then(
				() => process.exit(1),
				() => process.exit(1),
			);
		});

		Logger.info('Starting Multiverse Server');
		await fluxerServer.start();
	} catch (error) {
		Logger.fatal({error: error instanceof Error ? error.message : 'Unknown error'}, 'Failed to start server');
		process.exit(1);
	}
}

main().catch((err) => {
	Logger.fatal({error: err}, 'Failed to start server');
	process.exit(1);
});
