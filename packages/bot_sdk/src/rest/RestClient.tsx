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

import {FluxerApiError} from '../Errors';
import {Backoff} from '../gateway/Backoff';
import {noopLogger, type SdkLogger} from '../Logger';
import type {APIErrorCode} from '../types/Api.generated';
import type {BotEndpoint, HttpMethod} from './Endpoints.generated';
import {RateLimiter} from './RateLimiter';

export type TokenType = 'bot' | 'session';

export interface RestClientOptions {
	/** REST base URL, e.g. `https://multiverse.forum/api`. */
	apiBaseUrl: string;
	token: string;
	/**
	 * `'bot'` sends `Authorization: Bot <token>`; `'session'` sends the raw
	 * token with no scheme prefix. The `'session'` branch is permanent — it is
	 * how I.R.I.S. runs in production and the rollback path for its SDK
	 * migration (risk H2). Do not remove it.
	 */
	tokenType: TokenType;
	logger?: SdkLogger;
	fetchImpl?: typeof fetch;
	rateLimiter?: RateLimiter;
	/** Max retries for network errors / 5xx on retry-safe requests. */
	maxRetries?: number;
	sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
	/** Path parameter values, keyed by the `{name}` placeholders in the template. */
	params?: Record<string, string>;
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	/**
	 * Opt in to retrying a non-idempotent request on network error / 5xx.
	 * GET/PUT/DELETE retry automatically. POST/PATCH never retry unless this
	 * is set — a blind retry of `POST /channels/:id/messages` can double-send
	 * a user-visible message, which is worse than dropping it. Only set this
	 * when the request carries its own idempotency guard (e.g. a `nonce`).
	 */
	retryable?: boolean;
}

const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'PUT', 'DELETE']);
const MAJOR_PARAMS = ['channel_id', 'guild_id', 'webhook_id'] as const;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RestClient {
	private apiBaseUrl: string;
	private readonly token: string;
	private readonly tokenType: TokenType;
	private readonly log: SdkLogger;
	private readonly fetchImpl: typeof fetch;
	private readonly rateLimiter: RateLimiter;
	private readonly maxRetries: number;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(options: RestClientOptions) {
		this.apiBaseUrl = options.apiBaseUrl.endsWith('/') ? options.apiBaseUrl.slice(0, -1) : options.apiBaseUrl;
		this.token = options.token;
		this.tokenType = options.tokenType;
		this.log = options.logger ?? noopLogger;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.rateLimiter = options.rateLimiter ?? new RateLimiter({logger: this.log});
		this.maxRetries = options.maxRetries ?? 3;
		this.sleep = options.sleep ?? defaultSleep;
	}

	/** Updated after `.well-known` resolution; the constructor default is the derived base. */
	setApiBaseUrl(apiBaseUrl: string): void {
		this.apiBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
	}

	get baseUrl(): string {
		return this.apiBaseUrl;
	}

	private authorizationHeader(): string {
		// 'session' intentionally sends the raw token, matching I.R.I.S.'s
		// current production behavior byte-for-byte (iris_bot RestClient.tsx).
		return this.tokenType === 'bot' ? `Bot ${this.token}` : this.token;
	}

	async callEndpoint<T>(endpoint: BotEndpoint, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(endpoint.method, endpoint.path, options);
	}

	async request<T>(method: HttpMethod, pathTemplate: string, options: RequestOptions = {}): Promise<T> {
		const path = this.buildPath(pathTemplate, options.params ?? {});
		const url = new URL(`${this.apiBaseUrl}${path}`);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}

		const bucketKey = this.bucketKey(method, pathTemplate, options.params ?? {});
		const canRetry = options.retryable === true || IDEMPOTENT_METHODS.has(method);
		const backoff = new Backoff(500, 15_000);

		let lastError: unknown = null;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			if (attempt > 0) {
				await this.sleep(backoff.next());
			}
			let response: Response;
			try {
				response = await this.rateLimiter.execute(bucketKey, () =>
					this.fetchImpl(url.toString(), {
						method,
						headers: {
							Authorization: this.authorizationHeader(),
							...(options.body !== undefined ? {'Content-Type': 'application/json'} : {}),
							Accept: 'application/json',
						},
						body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
					}),
				);
			} catch (error) {
				lastError = error;
				if (!canRetry || attempt === this.maxRetries) {
					throw error;
				}
				this.log.warn({err: error, method, path, attempt}, 'Network error; retrying');
				continue;
			}

			if (response.status >= 500 && canRetry && attempt < this.maxRetries) {
				this.log.warn({status: response.status, method, path, attempt}, 'Server error; retrying');
				continue;
			}

			return this.parseResponse<T>(response);
		}
		// Unreachable: every loop path returns or throws; keep TypeScript satisfied.
		throw lastError instanceof Error ? lastError : new Error('Request failed');
	}

	private buildPath(pathTemplate: string, params: Record<string, string>): string {
		return pathTemplate.replace(/\{([^}]+)\}/g, (_match, name: string) => {
			const value = params[name];
			if (value === undefined) {
				throw new Error(`Missing path parameter "${name}" for ${pathTemplate}`);
			}
			return encodeURIComponent(value);
		});
	}

	private bucketKey(method: string, pathTemplate: string, params: Record<string, string>): string {
		// Route-major bucketing: the server's buckets substitute route params
		// (`resolveBucket`), so keying on the template plus the major resource
		// id approximates them without knowing server bucket names.
		const major = MAJOR_PARAMS.map((name) => params[name]).find((value) => value !== undefined) ?? '';
		return `${method} ${pathTemplate} ${major}`;
	}

	private async parseResponse<T>(response: Response): Promise<T> {
		if (response.ok) {
			if (response.status === 204) {
				return undefined as T;
			}
			const text = await response.text();
			if (text.length === 0) {
				return undefined as T;
			}
			return JSON.parse(text) as T;
		}

		let raw: unknown = null;
		let code: APIErrorCode | 'UNKNOWN' = 'UNKNOWN';
		let message = `HTTP ${response.status}`;
		try {
			raw = await response.json();
			const body = raw as {code?: string; message?: string};
			if (typeof body.code === 'string') {
				code = body.code as APIErrorCode;
			}
			if (typeof body.message === 'string') {
				message = body.message;
			}
		} catch {
			// Non-JSON error body; keep defaults.
		}
		throw new FluxerApiError(response.status, code, message, raw);
	}
}
