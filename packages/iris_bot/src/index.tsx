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
import {createClient, FluxerApiError} from '@fluxer/bot_sdk/src/index';
import pino from 'pino';
import {loadConfig} from './Config';
import {type ChannelTypeResolver, MessageHandler, type MessageSender} from './MessageHandler';

async function main(): Promise<void> {
	const log = pino({level: process.env.LOG_LEVEL ?? 'info'});
	const config = loadConfig();

	// tokenType comes from config: 'bot' when IRIS_BOT_TOKEN is set (the real
	// OAuth2 bot application, Phase 1.6b), else 'session' for the legacy user
	// account (raw token, no "Bot " prefix — the permanent rollback path).
	const client = createClient({
		token: config.token,
		instanceBaseUrl: config.instanceBaseUrl,
		tokenType: config.tokenType,
		logger: log,
		properties: {os: 'linux', browser: 'iris_bot', device: 'iris_bot'},
	});
	log.info({tokenType: config.tokenType}, 'I.R.I.S. starting');

	// Preserves the deleted local RestClient.sendMessage contract byte-for-byte:
	// an HTTP failure is logged and swallowed (the reply is dropped, never
	// duplicated), while network errors propagate to the handler's catch. The
	// SDK never blind-retries this POST; its rate limiter only re-executes
	// requests the server rejected with 429 (i.e. never ran).
	const messageSender: MessageSender = {
		async sendMessage(_apiBaseUrl, channelId, content) {
			try {
				await client.api.sendMessage(channelId, content);
			} catch (err) {
				if (err instanceof FluxerApiError) {
					log.error({channelId, status: err.status, body: err.raw}, 'Failed to send message');
					return;
				}
				throw err;
			}
		},
	};

	// Throws on failure so the handler's strict-DM gate fails closed.
	const channelResolver: ChannelTypeResolver = {
		async getChannelType(channelId) {
			const channel = await client.api.getChannel(channelId);
			return channel.type;
		},
	};

	let botUserId: string | null = null;
	let handler: MessageHandler | null = null;

	client.on('dispatch', ({t, d}) => {
		if (t === 'READY') {
			const ready = d as {user: {id: string}};
			botUserId = ready.user.id;
			handler = new MessageHandler(botUserId, client.rest.baseUrl, messageSender, channelResolver, log);
			log.info({botUserId}, 'I.R.I.S. ready');
			return;
		}
		// A RESUMED reconnect deliberately keeps the existing handler (and its
		// conversation state); only a fresh READY rebuilds it, as before.
		handler?.handleDispatch(t, d);
	});

	client.on('error', (err) => {
		// Fatal gateway close (e.g. revoked token): the SDK has classified the
		// close code and stopped reconnecting. Exit so the container restart
		// policy takes over instead of hot-looping a dead credential.
		log.error({err}, 'Gateway connection fatally closed; exiting');
		process.exit(1);
	});

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
		client.disconnect();
		healthServer.close();
		process.exit(0);
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);

	await client.connect();
}

main().catch((err) => {
	console.error('Fatal error starting I.R.I.S.:', err);
	process.exit(1);
});
