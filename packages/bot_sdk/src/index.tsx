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

export {type ClientOptions, createClient, FluxerClient} from './Client';
export {FluxerApiError, FluxerGatewayError} from './Errors';
export {Backoff} from './gateway/Backoff';
export {
	ACK_BACKPRESSURE_CLOSE_CODE,
	type CloseDisposition,
	classifyCloseCode,
	SESSION_REVOKED_CLOSE_CODE,
} from './gateway/CloseCodes';
export type {
	ClientEvents,
	ClientLifecycleEvents,
	GatewayDispatchEventName,
	GatewayDispatchEvents,
	ReadyDispatch,
} from './gateway/Events';
export {
	GatewayClient,
	type GatewayClientOptions,
	type GatewayPayload,
	type GatewaySocket,
	type IdentifyProperties,
} from './gateway/GatewayClient';
export {noopLogger, type SdkLogger} from './Logger';
export {type BotEndpoint, BotEndpoints, type BotOperationId, type HttpMethod} from './rest/Endpoints.generated';
export {RateLimiter, type RateLimiterOptions} from './rest/RateLimiter';
export {
	type RequestOptions,
	RestClient,
	type RestClientOptions,
	type TokenType,
} from './rest/RestClient';
export {Routes, type SendMessagePayload} from './rest/Routes';
export {deriveEndpoints, type ResolvedEndpoints, resolveEndpoints} from './WellKnown';
