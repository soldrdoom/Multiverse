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

import type {ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {ApplicationTeamRow, TeamMemberRole} from '@fluxer/api/src/database/types/OAuth2Types';
import type {Application} from '@fluxer/api/src/models/Application';
import type {IApplicationRepository} from '@fluxer/api/src/oauth/repositories/IApplicationRepository';
import type {ITeamRepository} from '@fluxer/api/src/oauth/repositories/ITeamRepository';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';
import {UnknownApplicationError} from '@fluxer/errors/src/domains/oauth/UnknownApplicationError';

/**
 * Everything a principal can do to an application, as discrete capabilities.
 *
 * - 'read'            read the application, list bot-token metadata
 * - 'edit'            edit metadata, bot profile, redirect URIs
 * - 'manage_tokens'   mint/revoke bot tokens, rotate the client secret
 * - 'invite_bot'      invite a private bot to a guild
 * - 'manage_members'  add/remove team members (team-scoped, mirrored here so
 *                     the whole matrix lives in one place)
 * - 'delete'          delete the application, transfer it to/off a team
 */
export type ApplicationCapability = 'read' | 'edit' | 'manage_tokens' | 'invite_bot' | 'manage_members' | 'delete';

export class ApplicationNotOwnedError extends ForbiddenError {
	constructor() {
		super({code: APIErrorCodes.APPLICATION_NOT_OWNED});
		this.name = 'ApplicationNotOwnedError';
	}
}

const NO_CAPABILITIES: ReadonlySet<ApplicationCapability> = new Set();

const OWNER_CAPABILITIES: ReadonlySet<ApplicationCapability> = new Set([
	'read',
	'edit',
	'manage_tokens',
	'invite_bot',
	'manage_members',
	'delete',
]);

const ROLE_CAPABILITIES: Record<TeamMemberRole, ReadonlySet<ApplicationCapability>> = {
	admin: new Set(['read', 'edit', 'manage_tokens', 'invite_bot', 'manage_members']),
	developer: new Set(['read', 'edit', 'invite_bot']),
	read_only: new Set(['read']),
};

/**
 * The single authority on who may do what to an application.
 *
 * Ownership stays a person forever: transferring an application to a team
 * rewrites owner_user_id to the team's owner, so the owner check below covers
 * both personal and team-owned applications. Team members gain capabilities by
 * role, and only once they have accepted their invite — an invited-but-not-
 * accepted member has exactly nothing.
 */
export class ApplicationAccessService {
	constructor(
		private readonly applicationRepository: IApplicationRepository,
		private readonly teamRepository: ITeamRepository,
	) {}

	async resolveAccess(userId: UserID, application: Application): Promise<ReadonlySet<ApplicationCapability>> {
		if (application.ownerUserId === userId) {
			return OWNER_CAPABILITIES;
		}

		if (application.teamId === null) {
			return NO_CAPABILITIES;
		}

		const member = await this.teamRepository.getMember(application.teamId, userId);
		if (!member || member.membership_state !== 'accepted') {
			return NO_CAPABILITIES;
		}

		return ROLE_CAPABILITIES[member.role] ?? NO_CAPABILITIES;
	}

	/**
	 * Loads the application and asserts the caller holds the capability.
	 *
	 * Throws UnknownApplicationError (404) when the application does not exist
	 * and ApplicationNotOwnedError (403) when it exists but the caller may not
	 * perform the requested operation on it.
	 */
	async requireAccess(
		userId: UserID,
		applicationId: ApplicationID,
		capability: ApplicationCapability,
	): Promise<Application> {
		const application = await this.applicationRepository.getApplication(applicationId);
		if (!application) {
			throw new UnknownApplicationError();
		}

		const capabilities = await this.resolveAccess(userId, application);
		if (!capabilities.has(capability)) {
			throw new ApplicationNotOwnedError();
		}

		return application;
	}

	/**
	 * The caller's effective role on a team: 'owner', an accepted member's role,
	 * or null for everyone else (including invited-but-not-accepted members).
	 */
	async resolveTeamRole(userId: UserID, team: ApplicationTeamRow): Promise<'owner' | TeamMemberRole | null> {
		if (team.owner_user_id === userId) {
			return 'owner';
		}

		const member = await this.teamRepository.getMember(team.team_id, userId);
		if (!member || member.membership_state !== 'accepted') {
			return null;
		}

		return member.role;
	}
}
