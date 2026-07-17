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

import type {ValueOf} from '@fluxer/constants/src/ValueOf';

export const ServiceName = {
	API: 'fluxer-api',
	KV: 'fluxer-kv',
	S3: 'fluxer-s3',
	QUEUE: 'fluxer-queue',
	MEDIA_PROXY: 'fluxer-media-proxy',
	APP_PROXY: 'fluxer-app-proxy',
	ADMIN: 'fluxer-admin',
	GATEWAY: 'fluxer-gateway',
} as const;

export type ServiceNameValue = ValueOf<typeof ServiceName>;

export const DefaultPort = {
	API: 3000,
	KV: 3001,
	S3: 3002,
	QUEUE: 3003,
	MEDIA_PROXY: 3004,
	APP_PROXY: 3005,
	ADMIN: 3006,
	GATEWAY: 4000,
} as const;

export type DefaultPortValue = ValueOf<typeof DefaultPort>;
