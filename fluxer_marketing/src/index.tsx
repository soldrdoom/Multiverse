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

import {createApp} from '@app/App';
import {Config} from '@app/Config';
import {shutdownInstrumentation} from '@app/Instrument';
import {Logger} from '@app/Logger';
import {createServer, setupGracefulShutdown} from '@fluxer/hono/src/Server';
import '@app/Instrument';

const {app, shutdown} = createApp();

const server = createServer(app, {port: Config.port});

Logger.info({port: Config.port}, `Starting Multiverse Marketing on port ${Config.port}`);

setupGracefulShutdown(
	async () => {
		shutdown();
		await shutdownInstrumentation();
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	},
	{logger: Logger},
);
