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

import {createServer} from 'node:http';
import pino from 'pino';
import {loadConfig} from './Config';
import {GatewayClient} from './GatewayClient';
import {IRIS_SYSTEM_PROMPT} from './LlmClient';
import {MessageHandler} from './MessageHandler';
import {OllamaLlmClient} from './OllamaLlmClient';
import {RestClient} from './RestClient';

async function main(): Promise<void> {
	const log = pino({level: process.env.LOG_LEVEL ?? 'info'});
	const config = loadConfig();

	const restClient = new RestClient(config.instanceBaseUrl, config.authToken, log);
	const wellKnown = await restClient.fetchWellKnown();
	log.info({endpoints: wellKnown.endpoints}, 'Resolved instance endpoints');

	const llmClient = new OllamaLlmClient(config.ollamaBaseUrl, config.ollamaModel, IRIS_SYSTEM_PROMPT);

	let botUserId: string | null = null;
	let handler: MessageHandler | null = null;

	const gateway = new GatewayClient(
		wellKnown.endpoints.gateway,
		config.authToken,
		(eventType, data) => {
			if (eventType === 'READY') {
				const ready = data as {user: {id: string}};
				botUserId = ready.user.id;
				handler = new MessageHandler(
					botUserId,
					wellKnown.endpoints.api,
					restClient,
					llmClient,
					log,
				);
				log.info({botUserId}, 'I.R.I.S. ready');
				return;
			}
			handler?.handleDispatch(eventType, data);
		},
		log,
	);

	gateway.connect();

	const healthServer = createServer((req, res) => {
		if (req.url === '/_health') {
			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify({status: 'ok', ready: botUserId != null}));
			return;
		}
		res.writeHead(404);
		res.end();
	});
	healthServer.listen(config.healthPort, () => {
		log.info({port: config.healthPort}, 'Health check server listening');
	});

	const shutdown = () => {
		log.info('Shutting down');
		gateway.disconnect();
		healthServer.close();
		process.exit(0);
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

main().catch((err) => {
	console.error('Fatal error starting I.R.I.S.:', err);
	process.exit(1);
});
