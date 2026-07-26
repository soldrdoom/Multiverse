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

import type {MessageResponseSchema} from '../types/Api.generated';

/**
 * Typed map of gateway DISPATCH events. The event list is derived from
 * `fluxer_docs/gateway/events.mdx` (which is itself generated from the Erlang
 * dispatch code). Payloads are typed loosely (`unknown`) where the OpenAPI
 * spec has no wire shape for them, rather than inventing shapes — with two
 * exceptions the SDK relies on:
 *
 * - `READY`/`RESUMED`, whose minimal fields the connection lifecycle needs.
 * - `MESSAGE_CREATE`, documented as carrying the message object
 *   (`MessageResponseSchema`).
 */

/** Minimal READY shape the SDK depends on; the full payload is passed through. */
export interface ReadyDispatch {
	session_id: string;
	user: {
		id: string;
		username?: string;
		bot?: boolean;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export interface GatewayDispatchEvents {
	READY: ReadyDispatch;
	/** Dispatched after a successful RESUME; `d` is null on the wire. */
	RESUMED: null;
	SESSIONS_REPLACE: unknown;
	USER_UPDATE: unknown;
	USER_PINNED_DMS_UPDATE: unknown;
	USER_SETTINGS_UPDATE: unknown;
	USER_GUILD_SETTINGS_UPDATE: unknown;
	USER_NOTE_UPDATE: unknown;
	RECENT_MENTION_DELETE: unknown;
	SAVED_MESSAGE_CREATE: unknown;
	SAVED_MESSAGE_DELETE: unknown;
	FAVORITE_MEME_CREATE: unknown;
	FAVORITE_MEME_UPDATE: unknown;
	FAVORITE_MEME_DELETE: unknown;
	AUTH_SESSION_CHANGE: unknown;
	PRESENCE_UPDATE: unknown;
	GUILD_CREATE: unknown;
	GUILD_UPDATE: unknown;
	GUILD_DELETE: unknown;
	GUILD_MEMBER_ADD: unknown;
	GUILD_MEMBER_UPDATE: unknown;
	GUILD_MEMBER_REMOVE: unknown;
	GUILD_ROLE_CREATE: unknown;
	GUILD_ROLE_UPDATE: unknown;
	GUILD_ROLE_UPDATE_BULK: unknown;
	GUILD_ROLE_DELETE: unknown;
	GUILD_EMOJIS_UPDATE: unknown;
	GUILD_STICKERS_UPDATE: unknown;
	GUILD_BAN_ADD: unknown;
	GUILD_BAN_REMOVE: unknown;
	CHANNEL_CREATE: unknown;
	CHANNEL_UPDATE: unknown;
	CHANNEL_UPDATE_BULK: unknown;
	CHANNEL_DELETE: unknown;
	CHANNEL_PINS_UPDATE: unknown;
	CHANNEL_PINS_ACK: unknown;
	CHANNEL_RECIPIENT_ADD: unknown;
	CHANNEL_RECIPIENT_REMOVE: unknown;
	MESSAGE_CREATE: MessageResponseSchema;
	MESSAGE_UPDATE: unknown;
	MESSAGE_DELETE: unknown;
	MESSAGE_DELETE_BULK: unknown;
	MESSAGE_REACTION_ADD: unknown;
	MESSAGE_REACTION_REMOVE: unknown;
	MESSAGE_REACTION_REMOVE_ALL: unknown;
	MESSAGE_REACTION_REMOVE_EMOJI: unknown;
	MESSAGE_ACK: unknown;
	TYPING_START: unknown;
	WEBHOOKS_UPDATE: unknown;
	INVITE_CREATE: unknown;
	INVITE_DELETE: unknown;
	RELATIONSHIP_ADD: unknown;
	RELATIONSHIP_UPDATE: unknown;
	RELATIONSHIP_REMOVE: unknown;
	VOICE_STATE_UPDATE: unknown;
	VOICE_SERVER_UPDATE: unknown;
	CALL_CREATE: unknown;
	CALL_UPDATE: unknown;
	CALL_DELETE: unknown;
}

export type GatewayDispatchEventName = keyof GatewayDispatchEvents;

/** Client-lifecycle events emitted alongside DISPATCH events (lowercase, so they can never collide). */
export interface ClientLifecycleEvents {
	/** A fatal condition (bad auth, invalid shard/version); the client has stopped. */
	error: Error;
	/** The socket closed; `willReconnect` reflects the close-code classification. */
	disconnected: {code: number; reason: string; willReconnect: boolean};
	/** A reconnect has been scheduled after full-jitter backoff. */
	reconnecting: {attempt: number; delayMs: number; resume: boolean};
	/** Every DISPATCH, untyped, for consumers that want the firehose. */
	dispatch: {t: string; d: unknown; s: number | null};
}

export type ClientEvents = GatewayDispatchEvents & ClientLifecycleEvents;

type Handler<T> = (data: T) => void | Promise<void>;

/**
 * Minimal typed event emitter. Handler errors are routed to `onHandlerError`
 * instead of unwinding the gateway read loop.
 */
export class TypedEventEmitter<Events> {
	private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

	protected onHandlerError: (error: unknown, event: string) => void = () => {};

	on<K extends keyof Events & string>(event: K, handler: Handler<Events[K]>): this {
		let set = this.handlers.get(event);
		if (!set) {
			set = new Set();
			this.handlers.set(event, set);
		}
		set.add(handler as Handler<never>);
		return this;
	}

	off<K extends keyof Events & string>(event: K, handler: Handler<Events[K]>): this {
		this.handlers.get(event)?.delete(handler as Handler<never>);
		return this;
	}

	emit<K extends keyof Events & string>(event: K, data: Events[K]): void {
		const set = this.handlers.get(event);
		if (!set) return;
		for (const handler of set) {
			try {
				const result = (handler as Handler<Events[K]>)(data);
				if (result instanceof Promise) {
					result.catch((error) => this.onHandlerError(error, event));
				}
			} catch (error) {
				this.onHandlerError(error, event);
			}
		}
	}
}
