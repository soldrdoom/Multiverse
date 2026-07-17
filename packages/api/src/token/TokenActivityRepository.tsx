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

import * as fs from 'node:fs';
import * as path from 'node:path';
import {DatabaseSync, type StatementSync} from 'node:sqlite';
import type {UserID} from '@fluxer/api/src/BrandedTypes';
import {Config} from '@fluxer/api/src/Config';
import {Logger} from '@fluxer/api/src/Logger';

export type TokenActivityEventType = 'message_sent' | 'daily_active';

// Minimum time between recording the same event for the same user
const COOLDOWNS_MS: Record<TokenActivityEventType, number> = {
	message_sent: 5 * 60 * 1000,        // 5 minutes
	daily_active: 24 * 60 * 60 * 1000,  // 24 hours
};

function resolveDbPath(): string {
	const basePath = Config.database?.sqlitePath ?? ':memory:';
	if (basePath === ':memory:') return basePath;
	const dir = path.dirname(basePath);
	fs.mkdirSync(dir, {recursive: true});
	return path.join(dir, 'token_activity.db');
}

export class TokenActivityRepository {
	private readonly db: DatabaseSync;
	private readonly insertStmt: StatementSync;
	private readonly lastEventStmt: StatementSync;
	// In-memory cooldown cache to avoid a DB read on every hot path
	// key: `${userId}:${eventType}`, value: timestamp of last recorded event
	private readonly cooldownCache = new Map<string, number>();

	constructor() {
		const dbPath = resolveDbPath();
		this.db = new DatabaseSync(dbPath);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS token_activity (
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id    TEXT    NOT NULL,
				event_type TEXT    NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_token_activity_lookup
				ON token_activity (user_id, event_type, created_at DESC);
		`);
		this.insertStmt = this.db.prepare(
			'INSERT INTO token_activity (user_id, event_type, created_at) VALUES (?, ?, ?)',
		);
		this.lastEventStmt = this.db.prepare(
			'SELECT created_at FROM token_activity WHERE user_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1',
		);
	}

	/**
	 * Record a token-earning activity event for a user.
	 * Silently no-ops if the user is still within the cooldown window for this event type.
	 * Never throws — failures are logged as warnings.
	 */
	recordEvent(userId: UserID, eventType: TokenActivityEventType): void {
		try {
			const now = Date.now();
			const cooldownKey = `${userId}:${eventType}`;
			const cooldownMs = COOLDOWNS_MS[eventType];

			// Fast path: check in-memory cache
			const cached = this.cooldownCache.get(cooldownKey);
			if (cached !== undefined && now - cached < cooldownMs) {
				return;
			}

			// Slow path (only on cache miss, e.g. after server restart): check DB
			if (cached === undefined) {
				const row = this.lastEventStmt.get(userId.toString(), eventType) as
					| {created_at: number}
					| undefined;
				if (row !== undefined && now - row.created_at < cooldownMs) {
					this.cooldownCache.set(cooldownKey, row.created_at);
					return;
				}
			}

			this.insertStmt.run(userId.toString(), eventType, now);
			this.cooldownCache.set(cooldownKey, now);
		} catch (error) {
			Logger.warn({error, userId, eventType}, 'Failed to record token activity event');
		}
	}

	shutdown(): void {
		try {
			this.db.close();
		} catch {}
	}
}
