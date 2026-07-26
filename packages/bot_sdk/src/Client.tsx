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

import type {FluxerGatewayError} from './Errors';
import type {GatewayDispatchEventName} from './gateway/Events';
import {type ClientEvents, TypedEventEmitter} from './gateway/Events';
import {GatewayClient, type IdentifyProperties} from './gateway/GatewayClient';
import {noopLogger, type SdkLogger} from './Logger';
import {RestClient, type TokenType} from './rest/RestClient';
import {Routes} from './rest/Routes';
import {deriveEndpoints, resolveEndpoints} from './WellKnown';

export interface ClientOptions {
	token: string;
	/** e.g. `https://multiverse.forum` — REST and gateway URLs are resolved from `/.well-known/fluxer`. */
	instanceBaseUrl: string;
	/**
	 * `'bot'` for real bot applications (`Authorization: Bot <token>`);
	 * `'session'` sends the raw token with no scheme. The session branch is
	 * the permanent I.R.I.S. escape hatch (risk H2): the only bot currently in
	 * production runs on a plain session token, and this is its rollback
	 * path. Do not remove it.
	 */
	tokenType: TokenType;
	logger?: SdkLogger;
	fetchImpl?: typeof fetch;
	properties?: IdentifyProperties;
}

export class FluxerClient extends TypedEventEmitter<ClientEvents> {
	readonly rest: RestClient;
	readonly api: Routes;

	private readonly options: ClientOptions;
	private readonly log: SdkLogger;
	private gateway: GatewayClient | null = null;

	constructor(options: ClientOptions) {
		super();
		this.options = options;
		this.log = options.logger ?? noopLogger;
		this.onHandlerError = (error, event) => this.log.error({err: error, event}, 'Unhandled error in event handler');
		// REST works before connect(): start from the derived base (identical
		// to what production's well-known document publishes) and re-point it
		// from the real document during connect().
		this.rest = new RestClient({
			apiBaseUrl: deriveEndpoints(options.instanceBaseUrl).api,
			token: options.token,
			tokenType: options.tokenType,
			logger: this.log,
			fetchImpl: options.fetchImpl,
		});
		this.api = new Routes(this.rest);
	}

	/**
	 * Resolve endpoints, open the gateway connection, and resolve once the
	 * first READY arrives (or reject on a fatal close, e.g. bad auth).
	 * Reconnects after that are handled internally; observe them via the
	 * `disconnected`/`reconnecting` events.
	 */
	async connect(): Promise<void> {
		if (this.gateway) {
			throw new Error('connect() called twice; call disconnect() first');
		}
		const endpoints = await resolveEndpoints(this.options.instanceBaseUrl, this.options.fetchImpl);
		this.rest.setApiBaseUrl(endpoints.api);
		this.log.info({endpoints}, 'Resolved instance endpoints');

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const gateway = new GatewayClient({
				gatewayUrl: endpoints.gateway,
				token: this.options.token,
				properties: this.options.properties,
				logger: this.log,
				onDispatch: (eventType, data, seq) => {
					this.emit('dispatch', {t: eventType, d: data, s: seq});
					this.emit(eventType as GatewayDispatchEventName, data as never);
					if (eventType === 'READY' && !settled) {
						settled = true;
						resolve();
					}
				},
				onFatal: (error: FluxerGatewayError) => {
					this.emit('error', error);
					if (!settled) {
						settled = true;
						this.gateway = null;
						reject(error);
					}
				},
				onDisconnected: (info) => this.emit('disconnected', info),
				onReconnecting: (info) => this.emit('reconnecting', info),
			});
			this.gateway = gateway;
			gateway.connect();
		});
	}

	disconnect(): void {
		this.gateway?.disconnect();
		this.gateway = null;
	}
}

export function createClient(options: ClientOptions): FluxerClient {
	return new FluxerClient(options);
}
