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

import type {AuthService} from '@fluxer/api/src/auth/AuthService';
import type {AuthMfaService} from '@fluxer/api/src/auth/services/AuthMfaService';
import type {SudoVerificationBody} from '@fluxer/api/src/auth/services/SudoVerificationService';
import {requireSudoMode} from '@fluxer/api/src/auth/services/SudoVerificationService';
import {createApplicationID, type UserID} from '@fluxer/api/src/BrandedTypes';
import {UsernameNotAvailableError} from '@fluxer/api/src/infrastructure/DiscriminatorService';
import type {Application} from '@fluxer/api/src/models/Application';
import type {User} from '@fluxer/api/src/models/User';
import type {ApplicationAccessService} from '@fluxer/api/src/oauth/ApplicationAccessService';
import type {ApplicationService} from '@fluxer/api/src/oauth/ApplicationService';
import {ApplicationNotOwnedError} from '@fluxer/api/src/oauth/ApplicationService';
import type {BotTokenService} from '@fluxer/api/src/oauth/BotTokenService';
import {
	mapApplicationToResponse,
	mapBotProfileToResponse,
	mapBotTokenToResponse,
} from '@fluxer/api/src/oauth/OAuth2Mappers';
import type {TeamService} from '@fluxer/api/src/oauth/TeamService';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {AccessDeniedError} from '@fluxer/errors/src/domains/core/AccessDeniedError';
import {BotUserNotFoundError} from '@fluxer/errors/src/domains/oauth/BotUserNotFoundError';
import {InvalidClientError} from '@fluxer/errors/src/domains/oauth/InvalidClientError';
import {UnknownApplicationError} from '@fluxer/errors/src/domains/oauth/UnknownApplicationError';
import type {
	ApplicationCreateRequest,
	ApplicationUpdateRequest,
	BotProfileResponse,
	BotProfileUpdateRequest,
	BotTokenCreateRequest,
	BotTokenCreateResponse,
	BotTokenListResponse,
} from '@fluxer/schema/src/domains/oauth/OAuthSchemas';
import type {Context} from 'hono';

export class OAuth2ApplicationsRequestService {
	constructor(
		private readonly applicationService: ApplicationService,
		private readonly userRepository: IUserRepository,
		private readonly authService: AuthService,
		private readonly authMfaService: AuthMfaService,
		private readonly botTokenService: BotTokenService,
		private readonly applicationAccessService: ApplicationAccessService,
		private readonly teamService: TeamService,
	) {}

	async listApplications(userId: UserID) {
		const applications: Array<Application> = await this.applicationService.listApplicationsAccessibleBy(userId);

		const botUserMap = new Map<string, User>();
		const botUserFetches: Array<{id: string; promise: Promise<User | null>}> = [];

		for (const app of applications) {
			if (app.hasBotUser()) {
				const botUserId = app.getBotUserId();
				if (botUserId) {
					botUserFetches.push({
						id: botUserId.toString(),
						promise: this.userRepository.findUnique(botUserId),
					});
				}
			}
		}

		const botUsers = await Promise.all(botUserFetches.map((f) => f.promise));
		for (let i = 0; i < botUsers.length; i++) {
			const user = botUsers[i];
			if (user !== null) {
				botUserMap.set(botUserFetches[i].id, user);
			}
		}

		return applications.map((app: Application) => {
			const botUserId = app.hasBotUser() ? app.getBotUserId() : null;
			const botUser = botUserId ? botUserMap.get(botUserId.toString()) : null;
			return mapApplicationToResponse(app, {botUser: botUser ?? undefined});
		});
	}

	async createApplication(userId: UserID, body: ApplicationCreateRequest) {
		const result = await this.applicationService.createApplication({
			ownerUserId: userId,
			name: body.name,
			description: body.description,
			tags: body.tags,
			privacyPolicyUrl: body.privacy_policy_url,
			termsOfServiceUrl: body.terms_of_service_url,
			redirectUris: body.redirect_uris,
			botPublic: body.bot_public,
			botRequireCodeGrant: body.bot_require_code_grant,
		});

		return mapApplicationToResponse(result.application, {
			botUser: result.botUser,
			botToken: result.botToken,
			clientSecret: result.clientSecret,
		});
	}

	async listBotTokens(userId: UserID, applicationId: bigint): Promise<BotTokenListResponse> {
		// Token metadata (name, preview, timestamps) is 'read'; only minting and
		// revoking demand the 'manage_tokens' capability.
		await this.applicationAccessService.requireAccess(userId, createApplicationID(applicationId), 'read');
		const rows = await this.botTokenService.listTokens(createApplicationID(applicationId));
		return rows.map(mapBotTokenToResponse);
	}

	async createBotToken(
		userId: UserID,
		applicationId: bigint,
		body: BotTokenCreateRequest,
	): Promise<BotTokenCreateResponse> {
		const application = await this.applicationAccessService.requireAccess(
			userId,
			createApplicationID(applicationId),
			'manage_tokens',
		);
		if (!application.hasBotUser()) {
			throw new BotUserNotFoundError();
		}

		const {token, row} = await this.botTokenService.createToken({
			applicationId: createApplicationID(applicationId),
			createdByUserId: userId,
			name: body.name,
		});

		// The secret is returned exactly once, here. Nothing stores it in a form
		// it can be read back from.
		return {...mapBotTokenToResponse(row), token};
	}

	async revokeBotToken(userId: UserID, applicationId: bigint, tokenId: bigint): Promise<void> {
		await this.applicationAccessService.requireAccess(userId, createApplicationID(applicationId), 'manage_tokens');
		const revoked = await this.botTokenService.revokeToken(createApplicationID(applicationId), tokenId);
		if (!revoked) {
			throw new UnknownApplicationError();
		}
	}

	async transferApplicationToTeam(userId: UserID, applicationId: bigint, teamId: bigint | null) {
		const updated = await this.teamService.transferApplication(userId, createApplicationID(applicationId), teamId);

		let botUser = null;
		if (updated.hasBotUser()) {
			const botUserId = updated.getBotUserId();
			if (botUserId) {
				botUser = await this.userRepository.findUnique(botUserId);
			}
		}

		return mapApplicationToResponse(updated, {botUser: botUser ?? undefined});
	}

	async getApplication(userId: UserID, applicationId: bigint) {
		const appId = createApplicationID(applicationId);
		let application: Application;
		try {
			application = await this.applicationAccessService.requireAccess(userId, appId, 'read');
		} catch (err) {
			if (err instanceof ApplicationNotOwnedError) {
				throw new AccessDeniedError();
			}
			throw err;
		}

		let botUser = null;
		if (application.hasBotUser()) {
			const botUserId = application.getBotUserId();
			if (botUserId) {
				botUser = await this.userRepository.findUnique(botUserId);
			}
		}

		return mapApplicationToResponse(application, {botUser});
	}

	async updateApplication(userId: UserID, applicationId: bigint, body: ApplicationUpdateRequest) {
		try {
			const updated = await this.applicationService.updateApplication({
				userId,
				applicationId: createApplicationID(applicationId),
				name: body.name,
				description: body.description,
				icon: body.icon,
				tags: body.tags,
				privacyPolicyUrl: body.privacy_policy_url,
				termsOfServiceUrl: body.terms_of_service_url,
				redirectUris: body.redirect_uris,
				botPublic: body.bot_public,
				botRequireCodeGrant: body.bot_require_code_grant,
			});

			let botUser = null;
			if (updated.hasBotUser()) {
				const botUserId = updated.getBotUserId();
				if (botUserId) {
					botUser = await this.userRepository.findUnique(botUserId);
				}
			}

			return mapApplicationToResponse(updated, {botUser: botUser ?? undefined});
		} catch (err) {
			if (err instanceof ApplicationNotOwnedError) {
				throw new AccessDeniedError();
			}
			if (err instanceof UnknownApplicationError) {
				throw err;
			}
			throw err;
		}
	}

	async deleteApplication(params: {
		ctx: Context;
		userId: UserID;
		body: SudoVerificationBody;
		applicationId: bigint;
	}): Promise<void> {
		await requireSudoMode(params.ctx, params.ctx.get('user'), params.body, this.authService, this.authMfaService);

		try {
			await this.applicationService.deleteApplication(params.userId, createApplicationID(params.applicationId));
		} catch (err) {
			if (err instanceof ApplicationNotOwnedError) {
				throw new AccessDeniedError();
			}
			if (err instanceof UnknownApplicationError) {
				throw err;
			}
			throw err;
		}
	}

	async updateBotProfile(
		userId: UserID,
		applicationId: bigint,
		body: BotProfileUpdateRequest,
	): Promise<BotProfileResponse> {
		try {
			const result = await this.applicationService.updateBotProfile(userId, createApplicationID(applicationId), {
				username: body.username,
				globalName: body.global_name,
				discriminator: body.discriminator,
				avatar: body.avatar,
				banner: body.banner,
				bio: body.bio,
				botFlags: body.bot_flags,
			});

			return mapBotProfileToResponse(result.user);
		} catch (err) {
			if (err instanceof ApplicationNotOwnedError) {
				throw new AccessDeniedError();
			}
			if (err instanceof BotUserNotFoundError) {
				throw err;
			}
			if (err instanceof InvalidClientError || err instanceof UnknownApplicationError) {
				throw new UnknownApplicationError();
			}
			if (err instanceof UsernameNotAvailableError) {
				throw err;
			}
			throw err;
		}
	}
}
