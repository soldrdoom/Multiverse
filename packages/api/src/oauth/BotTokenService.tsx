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

import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import type {ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';
import {applicationIdToUserId} from '@fluxer/api/src/BrandedTypes';
import type {ApplicationBotTokenRow} from '@fluxer/api/src/database/types/OAuth2Types';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {Logger} from '@fluxer/api/src/Logger';
import type {IBotTokenRepository} from '@fluxer/api/src/oauth/repositories/IBotTokenRepository';

/** Minimum interval between last_used_at writes for a single token. */
const LAST_USED_COOLDOWN_MS = 5 * 60 * 1000;

export const DEFAULT_BOT_TOKEN_NAME = 'default';

export interface ParsedBotToken {
	applicationId: ApplicationID;
	tokenId: bigint | null;
	secret: string;
}

/**
 * Parse a bot token into its parts.
 *
 * Current format is `<applicationId>.<tokenId>.<secret>`. The two-part
 * `<applicationId>.<secret>` form predates per-token records and is still
 * accepted so an in-flight token keeps working across the rollout; it resolves
 * through the application's legacy bot_token_hash instead of a token row.
 *
 * applicationId stays first in both forms because callers elsewhere read it by
 * splitting on '.' and taking element 0.
 */
export function parseBotToken(token: string): ParsedBotToken | null {
	const parts = token.split('.');
	if (parts.length !== 2 && parts.length !== 3) {
		return null;
	}

	const applicationIdStr = parts[0];
	const secret = parts[parts.length - 1];
	if (!applicationIdStr || !secret) {
		return null;
	}

	let applicationId: ApplicationID;
	try {
		applicationId = BigInt(applicationIdStr) as ApplicationID;
	} catch {
		return null;
	}

	if (parts.length === 2) {
		return {applicationId, tokenId: null, secret};
	}

	const tokenIdStr = parts[1];
	if (!tokenIdStr) {
		return null;
	}

	let tokenId: bigint;
	try {
		tokenId = BigInt(tokenIdStr);
	} catch {
		return null;
	}

	return {applicationId, tokenId, secret};
}

export function hashBotTokenSecret(secret: string): string {
	return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
	const left = Buffer.from(a, 'utf8');
	const right = Buffer.from(b, 'utf8');
	if (left.length !== right.length) {
		return false;
	}
	return timingSafeEqual(left, right);
}

export class BotTokenService {
	/**
	 * Tracks the last time each token's last_used_at was persisted, so a busy
	 * bot does not turn every authenticated request into a database write.
	 */
	private readonly lastUsedWrites = new Map<string, number>();

	constructor(
		private readonly botTokenRepository: IBotTokenRepository,
		private readonly snowflakeService: SnowflakeService,
		private readonly gatewayService: IGatewayService,
	) {}

	/**
	 * Resolve a token to the bot user it authenticates, or null.
	 *
	 * The lookup is a single point read keyed on the secret's SHA-256. Finding a
	 * row already proves the caller holds a preimage of that hash; the extra
	 * constant-time comparison guards against a partial-match backend and keeps
	 * the comparison itself timing-independent.
	 */
	async resolveToken(token: string): Promise<{botUserId: UserID; tokenId: bigint} | null> {
		const parsed = parseBotToken(token);
		if (!parsed || parsed.tokenId === null) {
			return null;
		}

		const lookupHash = hashBotTokenSecret(parsed.secret);
		const row = await this.botTokenRepository.getByLookupHash(lookupHash);
		if (!row) {
			return null;
		}

		if (!constantTimeEquals(row.lookup_hash, lookupHash)) {
			return null;
		}

		// A token names the application it belongs to. Reject a token whose
		// claimed application does not match the record it resolved to.
		if (row.application_id !== parsed.applicationId || row.token_id !== parsed.tokenId) {
			return null;
		}

		this.touchLastUsed(row);

		return {botUserId: row.bot_user_id, tokenId: row.token_id};
	}

	private touchLastUsed(row: ApplicationBotTokenRow): void {
		const now = Date.now();
		const previous = this.lastUsedWrites.get(row.lookup_hash);
		if (previous !== undefined && now - previous < LAST_USED_COOLDOWN_MS) {
			return;
		}
		this.lastUsedWrites.set(row.lookup_hash, now);
		// Deliberately not awaited: recording usage must never add latency to, or
		// fail, an otherwise valid request.
		void this.botTokenRepository.touchLastUsed(row.lookup_hash, new Date(now));
	}

	async createToken(params: {
		applicationId: ApplicationID;
		createdByUserId: UserID;
		name: string;
	}): Promise<{token: string; row: ApplicationBotTokenRow}> {
		const secret = randomBytes(32).toString('base64url');
		const tokenId = await this.snowflakeService.generate();
		const botUserId = applicationIdToUserId(params.applicationId);

		const row: ApplicationBotTokenRow = {
			lookup_hash: hashBotTokenSecret(secret),
			token_id: tokenId,
			application_id: params.applicationId,
			bot_user_id: botUserId,
			name: params.name,
			preview: secret.slice(0, 8),
			created_at: new Date(),
			created_by_user_id: params.createdByUserId,
			last_used_at: null,
			version: 1,
		};

		await this.botTokenRepository.insert(row);

		return {token: `${params.applicationId.toString()}.${tokenId.toString()}.${secret}`, row};
	}

	async listTokens(applicationId: ApplicationID): Promise<Array<ApplicationBotTokenRow>> {
		return this.botTokenRepository.listByApplication(applicationId);
	}

	async getToken(applicationId: ApplicationID, tokenId: bigint): Promise<ApplicationBotTokenRow | null> {
		const tokens = await this.botTokenRepository.listByApplication(applicationId);
		return tokens.find((token) => token.token_id === tokenId) ?? null;
	}

	async revokeToken(applicationId: ApplicationID, tokenId: bigint): Promise<boolean> {
		const row = await this.getToken(applicationId, tokenId);
		if (!row) {
			return false;
		}
		await this.botTokenRepository.delete(applicationId, tokenId, row.lookup_hash);
		this.lastUsedWrites.delete(row.lookup_hash);
		this.terminateBotGatewaySessions(applicationId);
		return true;
	}

	async revokeAllTokens(applicationId: ApplicationID): Promise<void> {
		const rows = await this.botTokenRepository.listByApplication(applicationId);
		for (const row of rows) {
			this.lastUsedWrites.delete(row.lookup_hash);
		}
		await this.botTokenRepository.deleteAllForApplication(applicationId);
		this.terminateBotGatewaySessions(applicationId);
	}

	/**
	 * Disconnect every live gateway session belonging to the application's bot
	 * user (close code 4014, SESSION_REVOKED, non-resumable).
	 *
	 * Gateway sessions do not record which token opened them, so this kills all
	 * of the bot's sessions — including ones opened with the application's other,
	 * still-valid tokens. That is the accepted M1 semantics; per-token
	 * granularity needs token_id threaded into gateway session state (Phase 2).
	 *
	 * Fire-and-forget by design: the token row deletion is the source of truth
	 * for revocation, and a briefly unavailable gateway must not fail the revoke.
	 * A session that survives a missed notification still cannot re-IDENTIFY or
	 * RESUME once its socket drops.
	 */
	private terminateBotGatewaySessions(applicationId: ApplicationID): void {
		const botUserId = applicationIdToUserId(applicationId);
		void this.gatewayService.terminateAllSessionsRevoked({userId: botUserId}).catch((error) => {
			Logger.warn(
				{error, applicationId: applicationId.toString(), botUserId: botUserId.toString()},
				'Failed to terminate gateway sessions after bot token revocation; sessions will drop on next reconnect',
			);
		});
	}
}
