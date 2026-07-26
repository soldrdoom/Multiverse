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

import {afterEach, describe, expect, it} from 'vitest';
import {type WebSocket, WebSocketServer} from 'ws';
import type {FluxerGatewayError} from '../Errors';
import {Backoff} from './Backoff';
import {GatewayClient, type GatewayPayload} from './GatewayClient';

interface MockGateway {
	server: WebSocketServer;
	url: string;
	connections: Array<{socket: WebSocket; received: Array<GatewayPayload>}>;
	close(): Promise<void>;
}

function startMockGateway(onConnection: (socket: WebSocket, index: number) => void): Promise<MockGateway> {
	return new Promise((resolve) => {
		const server = new WebSocketServer({port: 0}, () => resolve(mock));
		const mock: MockGateway = {
			server,
			get url() {
				const address = server.address();
				const port = typeof address === 'object' && address ? address.port : 0;
				return `ws://127.0.0.1:${port}`;
			},
			connections: [],
			close: () =>
				new Promise<void>((resolveClose) => {
					for (const {socket} of mock.connections) {
						socket.terminate();
					}
					server.close(() => resolveClose());
				}),
		};
		server.on('connection', (socket) => {
			const entry = {socket, received: [] as Array<GatewayPayload>};
			mock.connections.push(entry);
			socket.on('message', (raw) => entry.received.push(JSON.parse(raw.toString())));
			onConnection(socket, mock.connections.length - 1);
		});
	});
}

function send(socket: WebSocket, payload: GatewayPayload): void {
	socket.send(JSON.stringify(payload));
}

function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const timer = setInterval(() => {
			if (predicate()) {
				clearInterval(timer);
				resolve();
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(timer);
				reject(new Error('waitFor timed out'));
			}
		}, 5);
	});
}

const fastBackoff = () => new Backoff(1, 4, () => 0.9);

describe('GatewayClient', () => {
	let mock: MockGateway | null = null;
	let client: GatewayClient | null = null;

	afterEach(async () => {
		client?.disconnect();
		client = null;
		await mock?.close();
		mock = null;
	});

	it('identifies after HELLO with the raw token and properties, then resumes after a dropped socket with the right session_id and seq', async () => {
		const dispatches: Array<{t: string; d: unknown; s: number | null}> = [];
		mock = await startMockGateway((socket, index) => {
			send(socket, {op: 10, d: {heartbeat_interval: 60_000}});
			socket.on('message', (raw) => {
				const payload = JSON.parse(raw.toString()) as GatewayPayload;
				if (index === 0 && payload.op === 2) {
					// First connection: IDENTIFY → READY (s:1), one dispatch (s:2),
					// then kill the socket without a close frame.
					send(socket, {op: 0, t: 'READY', s: 1, d: {session_id: 'sess-1', user: {id: '42'}}});
					send(socket, {op: 0, t: 'MESSAGE_CREATE', s: 2, d: {id: 'm2'}});
					setTimeout(() => socket.terminate(), 20);
				}
				if (index === 1 && payload.op === 6) {
					// Second connection: expect RESUME; replay the missed event
					// then dispatch RESUMED, exactly like handle_resume_success.
					send(socket, {op: 0, t: 'MESSAGE_CREATE', s: 3, d: {id: 'm3'}});
					send(socket, {op: 0, t: 'RESUMED', s: 3, d: null});
				}
			});
		});

		client = new GatewayClient({
			gatewayUrl: mock.url,
			token: 'the-token',
			onDispatch: (t, d, s) => dispatches.push({t, d, s}),
			backoff: fastBackoff(),
			random: () => 0.99,
		});
		client.connect();

		await waitFor(() => dispatches.some((d) => d.t === 'RESUMED'));

		// IDENTIFY shape on the first connection.
		const identify = mock.connections[0]?.received.find((p) => p.op === 2);
		expect(identify).toBeDefined();
		expect(identify?.d).toMatchObject({
			token: 'the-token',
			properties: {os: 'linux', browser: 'fluxer_bot_sdk', device: 'fluxer_bot_sdk'},
			flags: 0,
		});

		// The reconnect sent RESUME (not IDENTIFY) carrying session_id + last seq.
		const second = mock.connections[1];
		expect(second).toBeDefined();
		const resume = second?.received.find((p) => p.op === 6);
		expect(resume).toBeDefined();
		expect(resume?.d).toEqual({token: 'the-token', session_id: 'sess-1', seq: 2});
		expect(second?.received.some((p) => p.op === 2)).toBe(false);

		// Exactly one READY (no duplicate rebuild), replayed event arrived once.
		expect(dispatches.filter((d) => d.t === 'READY').length).toBe(1);
		expect(dispatches.filter((d) => d.t === 'MESSAGE_CREATE').map((d) => (d.d as {id: string}).id)).toEqual([
			'm2',
			'm3',
		]);
		expect(client.currentSequence).toBe(3);
	});

	it('jitters the first heartbeat and then beats on the interval with the latest seq', async () => {
		mock = await startMockGateway((socket) => {
			send(socket, {op: 10, d: {heartbeat_interval: 40}});
			socket.on('message', (raw) => {
				const payload = JSON.parse(raw.toString()) as GatewayPayload;
				if (payload.op === 2) {
					send(socket, {op: 0, t: 'READY', s: 1, d: {session_id: 'sess-hb', user: {id: '42'}}});
				}
				if (payload.op === 1) {
					send(socket, {op: 11});
				}
			});
		});

		client = new GatewayClient({
			gatewayUrl: mock.url,
			token: 'the-token',
			onDispatch: () => {},
			backoff: fastBackoff(),
			// First beat at 40 * 0.5 = 20ms, then every 40ms.
			random: () => 0.5,
		});
		client.connect();

		await waitFor(() => (mock?.connections[0]?.received.filter((p) => p.op === 1).length ?? 0) >= 3, 5_000);
		const heartbeats = mock.connections[0]?.received.filter((p) => p.op === 1) ?? [];
		// Heartbeat `d` carries the last seen sequence (READY was s:1).
		expect(heartbeats.at(-1)?.d).toBe(1);
		// Still connected on one socket: acks arrived, no reconnect happened.
		expect(mock.connections.length).toBe(1);
	});

	it('stops (does not reconnect) on a fatal close code and reports it', async () => {
		const fatals: Array<FluxerGatewayError> = [];
		const disconnects: Array<{code: number; willReconnect: boolean}> = [];
		mock = await startMockGateway((socket) => {
			send(socket, {op: 10, d: {heartbeat_interval: 60_000}});
			socket.on('message', (raw) => {
				const payload = JSON.parse(raw.toString()) as GatewayPayload;
				if (payload.op === 2) {
					socket.close(4004, 'Invalid token');
				}
			});
		});

		client = new GatewayClient({
			gatewayUrl: mock.url,
			token: 'revoked-token',
			onDispatch: () => {},
			onFatal: (error) => fatals.push(error),
			onDisconnected: (info) => disconnects.push({code: info.code, willReconnect: info.willReconnect}),
			backoff: fastBackoff(),
		});
		client.connect();

		await waitFor(() => fatals.length === 1);
		// Give any (buggy) reconnect a chance to fire before asserting.
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(mock.connections.length).toBe(1);
		expect(fatals[0]?.closeCode).toBe(4004);
		expect(disconnects).toEqual([{code: 4004, willReconnect: false}]);
	});

	it('drops session state and re-identifies after a fresh-identify close code', async () => {
		const dispatches: Array<string> = [];
		mock = await startMockGateway((socket, index) => {
			send(socket, {op: 10, d: {heartbeat_interval: 60_000}});
			socket.on('message', (raw) => {
				const payload = JSON.parse(raw.toString()) as GatewayPayload;
				if (payload.op === 2 && index === 0) {
					send(socket, {op: 0, t: 'READY', s: 1, d: {session_id: 'sess-old', user: {id: '42'}}});
					// 4009 SESSION_TIMEOUT → session is dead server-side.
					setTimeout(() => socket.close(4009, 'Session timeout'), 10);
				}
				if (payload.op === 2 && index === 1) {
					send(socket, {op: 0, t: 'READY', s: 1, d: {session_id: 'sess-new', user: {id: '42'}}});
				}
			});
		});

		client = new GatewayClient({
			gatewayUrl: mock.url,
			token: 'the-token',
			onDispatch: (t) => dispatches.push(t),
			backoff: fastBackoff(),
		});
		client.connect();

		await waitFor(() => dispatches.filter((t) => t === 'READY').length === 2);
		// The second connection must IDENTIFY (op 2), never RESUME (op 6).
		expect(mock.connections[1]?.received.some((p) => p.op === 6)).toBe(false);
		expect(client.currentSessionId).toBe('sess-new');
	});
});
