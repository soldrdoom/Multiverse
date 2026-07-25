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

import {randomBytes} from 'node:crypto';
import type {ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {BotTokenService} from '@fluxer/api/src/oauth/BotTokenService';
import {parseBotToken} from '@fluxer/api/src/oauth/BotTokenService';
import type {IApplicationRepository} from '@fluxer/api/src/oauth/repositories/IApplicationRepository';
import {hashPassword, verifyPassword} from '@fluxer/api/src/utils/PasswordUtils';

export class BotAuthService {
	constructor(
		private readonly applicationRepository: IApplicationRepository,
		private readonly botTokenService: BotTokenService,
	) {}

	/**
	 * Resolve a bot token to its bot user.
	 *
	 * Three-part tokens resolve through BotTokenService as a single hash lookup.
	 * Two-part tokens predate per-token records and fall back to the
	 * application's bot_token_hash, which is still argon2-verified — that path
	 * exists so a token issued before this rollout keeps working, and is removed
	 * once no such tokens remain.
	 */
	async validateBotToken(token: string): Promise<UserID | null> {
		const parsed = parseBotToken(token);
		if (!parsed) {
			return null;
		}

		if (parsed.tokenId !== null) {
			const resolved = await this.botTokenService.resolveToken(token);
			return resolved ? resolved.botUserId : null;
		}

		return this.validateLegacyBotToken(parsed.applicationId, parsed.secret);
	}

	private async validateLegacyBotToken(applicationId: ApplicationID, secret: string): Promise<UserID | null> {
		const application = await this.applicationRepository.getApplication(applicationId);

		if (!application || !application.hasBotUser() || !application.botTokenHash) {
			return null;
		}

		try {
			const isValid = await verifyPassword({password: secret, passwordHash: application.botTokenHash});
			return isValid ? application.getBotUserId() : null;
		} catch {
			return null;
		}
	}

	/**
	 * @deprecated Issues a legacy two-part token. Use BotTokenService.createToken.
	 */
	async generateBotToken(applicationId: ApplicationID): Promise<{
		token: string;
		hash: string;
		preview: string;
	}> {
		const secret = randomBytes(32).toString('base64url');
		const hash = await hashPassword(secret);
		const preview = secret.slice(0, 8);
		const token = `${applicationId.toString()}.${secret}`;

		return {token, hash, preview};
	}
}
