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
import WebSocket from 'ws';
import {FluxerGatewayError} from '../Errors';
import {noopLogger, type SdkLogger} from '../Logger';
import {Backoff} from './Backoff';
import {classifyCloseCode} from './CloseCodes';
import type {ReadyDispatch} from './Events';

/**
 * Gateway connection lifecycle. This is the corrected replacement for
 * `packages/iris_bot/src/GatewayClient.tsx`, fixing its four production
 * failure modes:
 *
 * 1. It never sent RESUME (op 6) despite tracking `sessionId`/`lastSequence`,
 *    so every blip re-identified and dropped every event in the gap. The
 *    server has supported RESUME with missed-event replay all along
 *    (`fluxer_gateway/src/gateway/gateway_handler.erl:394,529-542,706-735`).
 *    We RESUME whenever session state exists; the server replays missed
 *    events and finishes with a RESUMED dispatch. Note the server only holds
 *    a dead session for 10 seconds (`session_monitor.erl:61`), so the first
 *    reconnect attempts are fast.
 * 2. Fixed 3s reconnect delay → full-jitter exponential backoff (`Backoff`),
 *    reset on READY/RESUMED.
 * 3. Reconnect-on-every-close-code → close-code classification
 *    (`CloseCodes`): fatal codes stop the client instead of hot-looping a
 *    revoked token.
 * 4. First heartbeat fired at the full interval for every client at once →
 *    the first beat is jittered (`interval * random()`).
 */

const HEARTBEAT_ACK_TIMEOUT_MS = 15_000;
const API_VERSION = 1;
const INVALID_SESSION_REIDENTIFY_MIN_MS = 1_000;
const INVALID_SESSION_REIDENTIFY_MAX_MS = 5_000;

export interface GatewayPayload {
	op: number;
	d?: unknown;
	s?: number;
	t?: string;
}

export interface IdentifyProperties {
	os: string;
	browser: string;
	device: string;
}

/** The subset of `ws.WebSocket` the client uses; injectable for tests. */
export interface GatewaySocket {
	readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	terminate(): void;
	on(event: 'open', listener: () => void): void;
	on(event: 'message', listener: (data: {toString(): string}) => void): void;
	on(event: 'close', listener: (code: number, reason: {toString(): string}) => void): void;
	on(event: 'error', listener: (err: Error) => void): void;
}

export interface GatewayClientOptions {
	gatewayUrl: string;
	/**
	 * The raw token. The gateway accepts it unprefixed for both session and
	 * bot tokens (`RpcService.normalizeSessionToken` strips an optional
	 * `Bot ` scheme, and `parseTokenType` detects bot tokens by shape).
	 */
	token: string;
	properties?: IdentifyProperties;
	logger?: SdkLogger;
	onDispatch: (eventType: string, data: unknown, seq: number | null) => void;
	onFatal?: (error: FluxerGatewayError) => void;
	onDisconnected?: (info: {code: number; reason: string; willReconnect: boolean}) => void;
	onReconnecting?: (info: {attempt: number; delayMs: number; resume: boolean}) => void;
	/** Test seams. */
	socketFactory?: (url: string) => GatewaySocket;
	backoff?: Backoff;
	random?: () => number;
}

const WS_OPEN = 1;

type IntentionalClose = 'none' | 'reconnect' | 'shutdown';

export class GatewayClient {
	private readonly gatewayUrl: string;
	private readonly token: string;
	private readonly properties: IdentifyProperties;
	private readonly log: SdkLogger;
	private readonly onDispatch: GatewayClientOptions['onDispatch'];
	private readonly onFatal: NonNullable<GatewayClientOptions['onFatal']>;
	private readonly onDisconnected: NonNullable<GatewayClientOptions['onDisconnected']>;
	private readonly onReconnecting: NonNullable<GatewayClientOptions['onReconnecting']>;
	private readonly socketFactory: (url: string) => GatewaySocket;
	private readonly backoff: Backoff;
	private readonly random: () => number;

	private ws: GatewaySocket | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private firstBeatTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private invalidSessionTimer: ReturnType<typeof setTimeout> | null = null;
	private intentionalClose: IntentionalClose = 'none';

	private sessionId: string | null = null;
	private lastSequence: number | null = null;

	constructor(options: GatewayClientOptions) {
		this.gatewayUrl = options.gatewayUrl;
		this.token = options.token;
		this.properties = options.properties ?? {os: 'linux', browser: 'fluxer_bot_sdk', device: 'fluxer_bot_sdk'};
		this.log = options.logger ?? noopLogger;
		this.onDispatch = options.onDispatch;
		this.onFatal = options.onFatal ?? (() => {});
		this.onDisconnected = options.onDisconnected ?? (() => {});
		this.onReconnecting = options.onReconnecting ?? (() => {});
		this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as GatewaySocket);
		this.backoff = options.backoff ?? new Backoff();
		this.random = options.random ?? Math.random;
	}

	get currentSessionId(): string | null {
		return this.sessionId;
	}

	get currentSequence(): number | null {
		return this.lastSequence;
	}

	connect(): void {
		if (this.ws) {
			this.log.warn({}, 'connect() called while a socket already exists; ignoring');
			return;
		}
		this.clearReconnectTimer();
		this.intentionalClose = 'none';

		const url = new URL(this.gatewayUrl);
		url.searchParams.set('v', API_VERSION.toString());
		url.searchParams.set('encoding', 'json');
		url.searchParams.set('compress', 'none');

		this.log.info({url: url.toString(), willResume: this.canResume()}, 'Connecting to gateway');
		const ws = this.socketFactory(url.toString());
		this.ws = ws;

		ws.on('open', () => this.log.info({}, 'Gateway socket open'));
		ws.on('message', (raw) => this.handleMessage(raw.toString()));
		ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
		ws.on('error', (err) => this.log.error({err}, 'Gateway socket error'));
	}

	disconnect(): void {
		this.intentionalClose = 'shutdown';
		this.stopTimers();
		this.clearReconnectTimer();
		this.ws?.close(1000, 'shutdown');
		this.ws = null;
	}

	private canResume(): boolean {
		return this.sessionId !== null && this.lastSequence !== null;
	}

	private handleMessage(raw: string): void {
		let payload: GatewayPayload;
		try {
			payload = JSON.parse(raw);
		} catch {
			this.log.warn({}, 'Received non-JSON gateway payload');
			return;
		}

		if (payload.s != null) {
			this.lastSequence = payload.s;
		}

		switch (payload.op) {
			case GatewayOpcodes.HELLO: {
				const {heartbeat_interval} = payload.d as {heartbeat_interval: number};
				this.startHeartbeat(heartbeat_interval);
				if (this.canResume()) {
					this.sendResume();
				} else {
					this.sendIdentify();
				}
				break;
			}
			case GatewayOpcodes.HEARTBEAT_ACK:
				this.clearAckTimer();
				break;
			case GatewayOpcodes.HEARTBEAT:
				this.sendHeartbeat();
				break;
			case GatewayOpcodes.INVALID_SESSION:
				this.handleInvalidSession();
				break;
			case GatewayOpcodes.RECONNECT:
				this.log.info({}, 'Gateway requested reconnect; will resume');
				this.intentionalClose = 'reconnect';
				this.ws?.close(4000, 'reconnect requested');
				break;
			case GatewayOpcodes.DISPATCH:
				this.handleDispatch(payload);
				break;
			default:
				break;
		}
	}

	private handleDispatch(payload: GatewayPayload): void {
		if (payload.t === 'READY') {
			const ready = payload.d as ReadyDispatch;
			this.sessionId = ready.session_id;
			this.backoff.reset();
			this.log.info({sessionId: this.sessionId}, 'Gateway READY');
		} else if (payload.t === 'RESUMED') {
			// The server has already replayed missed events (each with its own
			// seq) before this dispatch; there is no READY-style state rebuild
			// to do, which is exactly the point of resuming.
			this.backoff.reset();
			this.log.info({sessionId: this.sessionId, seq: this.lastSequence}, 'Gateway RESUMED');
		}
		if (payload.t) {
			this.onDispatch(payload.t, payload.d, payload.s ?? null);
		}
	}

	private handleInvalidSession(): void {
		// Sent (without closing the socket) when the session cannot be started
		// or resumed (`gateway_handler.erl` send_invalid_session, `d: false`).
		// Drop session state and re-IDENTIFY after a short jittered delay so a
		// fleet of bots does not re-identify in lockstep.
		this.log.warn({}, 'Gateway session invalidated; re-identifying');
		this.sessionId = null;
		this.lastSequence = null;
		const delay =
			INVALID_SESSION_REIDENTIFY_MIN_MS +
			this.random() * (INVALID_SESSION_REIDENTIFY_MAX_MS - INVALID_SESSION_REIDENTIFY_MIN_MS);
		if (this.invalidSessionTimer) clearTimeout(this.invalidSessionTimer);
		this.invalidSessionTimer = setTimeout(() => this.sendIdentify(), delay);
	}

	private sendIdentify(): void {
		this.send({
			op: GatewayOpcodes.IDENTIFY,
			d: {
				token: this.token,
				properties: this.properties,
				flags: 0,
			},
		});
	}

	private sendResume(): void {
		this.log.info({sessionId: this.sessionId, seq: this.lastSequence}, 'Attempting RESUME');
		this.send({
			op: GatewayOpcodes.RESUME,
			d: {
				token: this.token,
				session_id: this.sessionId,
				seq: this.lastSequence,
			},
		});
	}

	private startHeartbeat(intervalMs: number): void {
		this.stopHeartbeat();
		// Jitter the first beat across the whole interval; firing it at the
		// full interval on every client synchronizes the herd.
		this.firstBeatTimer = setTimeout(() => {
			this.sendHeartbeat();
			this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs);
		}, intervalMs * this.random());
	}

	private sendHeartbeat(): void {
		this.send({op: GatewayOpcodes.HEARTBEAT, d: this.lastSequence});
		if (this.heartbeatAckTimer) clearTimeout(this.heartbeatAckTimer);
		this.heartbeatAckTimer = setTimeout(() => {
			this.log.warn({}, 'Heartbeat ack timed out; reconnecting to resume');
			this.intentionalClose = 'reconnect';
			// The connection is presumed dead; a graceful close may never
			// complete, so terminate outright and let the close handler run.
			this.ws?.terminate();
		}, HEARTBEAT_ACK_TIMEOUT_MS);
	}

	private send(payload: GatewayPayload): void {
		if (this.ws && this.ws.readyState === WS_OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	private handleClose(code: number, reason: string): void {
		this.stopTimers();
		this.ws = null;

		if (this.intentionalClose === 'shutdown') {
			this.onDisconnected({code, reason, willReconnect: false});
			return;
		}

		const disposition = this.intentionalClose === 'reconnect' ? 'resume' : classifyCloseCode(code);
		this.intentionalClose = 'none';
		this.log.warn({code, reason, disposition}, 'Gateway socket closed');

		if (disposition === 'fatal') {
			this.onDisconnected({code, reason, willReconnect: false});
			this.onFatal(
				new FluxerGatewayError(
					code,
					`Gateway closed with fatal code ${code} (${reason || 'no reason'}); not reconnecting`,
				),
			);
			return;
		}

		if (disposition === 'fresh-identify') {
			this.sessionId = null;
			this.lastSequence = null;
		}

		this.onDisconnected({code, reason, willReconnect: true});
		this.scheduleReconnect();
	}

	private scheduleReconnect(): void {
		const delayMs = this.backoff.next();
		this.onReconnecting({attempt: this.backoff.attempt, delayMs, resume: this.canResume()});
		this.log.info({attempt: this.backoff.attempt, delayMs, resume: this.canResume()}, 'Scheduling reconnect');
		this.clearReconnectTimer();
		this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private clearAckTimer(): void {
		if (this.heartbeatAckTimer) {
			clearTimeout(this.heartbeatAckTimer);
			this.heartbeatAckTimer = null;
		}
	}

	private stopHeartbeat(): void {
		if (this.firstBeatTimer) {
			clearTimeout(this.firstBeatTimer);
			this.firstBeatTimer = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.clearAckTimer();
	}

	private stopTimers(): void {
		this.stopHeartbeat();
		if (this.invalidSessionTimer) {
			clearTimeout(this.invalidSessionTimer);
			this.invalidSessionTimer = null;
		}
	}
}
