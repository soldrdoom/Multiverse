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

import {GatewayOpcodes} from '@fluxer/constants/src/GatewayConstants';
import type {Logger} from 'pino';
import WebSocket from 'ws';

const HEARTBEAT_ACK_TIMEOUT_MS = 15000;
const RECONNECT_DELAY_MS = 3000;
const API_VERSION = 1;

export interface GatewayPayload {
	op: number;
	d?: unknown;
	s?: number;
	t?: string;
}

export type DispatchHandler = (eventType: string, data: unknown) => void;

export class GatewayClient {
	private ws: WebSocket | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null;
	private lastSequence: number | null = null;
	private sessionId: string | null = null;
	private closedByUs = false;

	constructor(
		private readonly gatewayUrl: string,
		private readonly token: string,
		private readonly onDispatch: DispatchHandler,
		private readonly log: Logger,
	) {}

	connect(): void {
		this.closedByUs = false;
		const url = new URL(this.gatewayUrl);
		url.searchParams.set('v', API_VERSION.toString());
		url.searchParams.set('encoding', 'json');
		url.searchParams.set('compress', 'none');

		this.log.info({url: url.toString()}, 'Connecting to gateway');
		this.ws = new WebSocket(url.toString());

		this.ws.on('open', () => this.log.info('Gateway socket open'));
		this.ws.on('message', (raw) => this.handleMessage(raw.toString()));
		this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
		this.ws.on('error', (err) => this.log.error({err}, 'Gateway socket error'));
	}

	private handleMessage(raw: string): void {
		let payload: GatewayPayload;
		try {
			payload = JSON.parse(raw);
		} catch {
			this.log.warn('Received non-JSON gateway payload');
			return;
		}

		if (payload.s != null) {
			this.lastSequence = payload.s;
		}

		switch (payload.op) {
			case GatewayOpcodes.HELLO: {
				const {heartbeat_interval} = payload.d as {heartbeat_interval: number};
				this.startHeartbeat(heartbeat_interval);
				this.sendIdentify();
				break;
			}
			case GatewayOpcodes.HEARTBEAT_ACK:
				if (this.heartbeatAckTimer) {
					clearTimeout(this.heartbeatAckTimer);
					this.heartbeatAckTimer = null;
				}
				break;
			case GatewayOpcodes.HEARTBEAT:
				this.sendHeartbeat();
				break;
			case GatewayOpcodes.INVALID_SESSION:
				this.log.warn('Gateway session invalidated, re-identifying');
				this.sessionId = null;
				this.lastSequence = null;
				setTimeout(() => this.sendIdentify(), 1500);
				break;
			case GatewayOpcodes.RECONNECT:
				this.log.info('Gateway requested reconnect');
				this.ws?.close(4000, 'reconnect requested');
				break;
			case GatewayOpcodes.DISPATCH:
				if (payload.t === 'READY') {
					this.sessionId = (payload.d as {session_id: string}).session_id;
					this.log.info({sessionId: this.sessionId}, 'Gateway READY');
				}
				if (payload.t) {
					this.onDispatch(payload.t, payload.d);
				}
				break;
		}
	}

	private sendIdentify(): void {
		this.send({
			op: GatewayOpcodes.IDENTIFY,
			d: {
				token: this.token,
				properties: {
					os: 'linux',
					browser: 'iris_bot',
					device: 'iris_bot',
				},
				flags: 0,
			},
		});
	}

	private startHeartbeat(intervalMs: number): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs);
	}

	private sendHeartbeat(): void {
		this.send({op: GatewayOpcodes.HEARTBEAT, d: this.lastSequence});
		if (this.heartbeatAckTimer) clearTimeout(this.heartbeatAckTimer);
		this.heartbeatAckTimer = setTimeout(() => {
			this.log.warn('Heartbeat ack timed out, reconnecting');
			this.ws?.close(4000, 'heartbeat timeout');
		}, HEARTBEAT_ACK_TIMEOUT_MS);
	}

	private send(payload: GatewayPayload): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	private handleClose(code: number, reason: string): void {
		this.log.warn({code, reason}, 'Gateway socket closed');
		this.stopHeartbeat();
		if (this.closedByUs) return;
		setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.heartbeatAckTimer) {
			clearTimeout(this.heartbeatAckTimer);
			this.heartbeatAckTimer = null;
		}
	}

	disconnect(): void {
		this.closedByUs = true;
		this.stopHeartbeat();
		this.ws?.close(1000, 'shutdown');
	}
}
