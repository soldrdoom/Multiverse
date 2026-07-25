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
import type {
	ApplicationTeamMemberRow,
	ApplicationTeamRow,
	TeamMemberRole,
} from '@fluxer/api/src/database/types/OAuth2Types';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {Logger} from '@fluxer/api/src/Logger';
import type {Application} from '@fluxer/api/src/models/Application';
import type {User} from '@fluxer/api/src/models/User';
import type {ApplicationAccessService} from '@fluxer/api/src/oauth/ApplicationAccessService';
import type {IApplicationRepository} from '@fluxer/api/src/oauth/repositories/IApplicationRepository';
import type {ITeamRepository} from '@fluxer/api/src/oauth/repositories/ITeamRepository';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {UserFlags} from '@fluxer/constants/src/UserConstants';
import {AccessDeniedError} from '@fluxer/errors/src/domains/core/AccessDeniedError';
import {TeamMemberAlreadyExistsError} from '@fluxer/errors/src/domains/oauth/TeamMemberAlreadyExistsError';
import {TeamOwnerCannotBeRemovedError} from '@fluxer/errors/src/domains/oauth/TeamOwnerCannotBeRemovedError';
import {TeamStillOwnsApplicationsError} from '@fluxer/errors/src/domains/oauth/TeamStillOwnsApplicationsError';
import {UnclaimedAccountCannotCreateApplicationsError} from '@fluxer/errors/src/domains/oauth/UnclaimedAccountCannotCreateApplicationsError';
import {UnknownTeamError} from '@fluxer/errors/src/domains/oauth/UnknownTeamError';
import {UnknownTeamMemberError} from '@fluxer/errors/src/domains/oauth/UnknownTeamMemberError';
import {UserCannotJoinTeamError} from '@fluxer/errors/src/domains/oauth/UserCannotJoinTeamError';
import {UnknownUserError} from '@fluxer/errors/src/domains/user/UnknownUserError';

export interface TeamServiceDeps {
	teamRepository: ITeamRepository;
	applicationRepository: IApplicationRepository;
	applicationAccessService: ApplicationAccessService;
	userRepository: IUserRepository;
	snowflakeService: SnowflakeService;
}

export interface TeamWithMembership {
	team: ApplicationTeamRow;
	membership: ApplicationTeamMemberRow;
}

export class TeamService {
	constructor(private readonly deps: TeamServiceDeps) {}

	private async requireTeam(teamId: bigint): Promise<ApplicationTeamRow> {
		const team = await this.deps.teamRepository.getTeam(teamId);
		if (!team) {
			throw new UnknownTeamError();
		}
		return team;
	}

	/** Owner or accepted admin; everyone else is denied. */
	private async requireTeamManager(userId: UserID, team: ApplicationTeamRow): Promise<void> {
		const role = await this.deps.applicationAccessService.resolveTeamRole(userId, team);
		if (role !== 'owner' && role !== 'admin') {
			throw new AccessDeniedError();
		}
	}

	/** Any accepted member (or the owner); invited-but-not-accepted is denied. */
	private async requireTeamMember(userId: UserID, team: ApplicationTeamRow): Promise<void> {
		const role = await this.deps.applicationAccessService.resolveTeamRole(userId, team);
		if (role === null) {
			throw new AccessDeniedError();
		}
	}

	async createTeam(ownerUserId: UserID, name: string): Promise<TeamWithMembership> {
		const owner = await this.deps.userRepository.findUniqueAssert(ownerUserId);
		if (owner.isUnclaimedAccount()) {
			// Same rule as application creation: the developer surface requires a
			// claimed account.
			throw new UnclaimedAccountCannotCreateApplicationsError();
		}

		const teamId = await this.deps.snowflakeService.generate();
		const now = new Date();

		const team: ApplicationTeamRow = {
			team_id: teamId,
			name,
			owner_user_id: ownerUserId,
			created_at: now,
			version: 1,
		};

		// The owner holds a member row so application_teams_by_user covers them;
		// their authority comes from application_teams.owner_user_id, not the role.
		const ownerMember: ApplicationTeamMemberRow = {
			team_id: teamId,
			user_id: ownerUserId,
			role: 'admin',
			membership_state: 'accepted',
			invited_by_user_id: ownerUserId,
			invited_at: now,
			accepted_at: now,
			version: 1,
		};

		await this.deps.teamRepository.upsertTeam(team);
		await this.deps.teamRepository.upsertMember(ownerMember);

		Logger.info({teamId: teamId.toString(), ownerUserId: ownerUserId.toString()}, 'Created developer team');

		return {team, membership: ownerMember};
	}

	/**
	 * Every team the user has a member row in — including pending invites, so
	 * the caller can see and act on them. Capabilities still require acceptance.
	 */
	async listTeamsForUser(userId: UserID): Promise<Array<TeamWithMembership>> {
		const teamIds = await this.deps.teamRepository.listTeamIdsByUser(userId);
		const result: Array<TeamWithMembership> = [];

		for (const teamId of teamIds) {
			const [team, membership] = await Promise.all([
				this.deps.teamRepository.getTeam(teamId),
				this.deps.teamRepository.getMember(teamId, userId),
			]);
			if (team && membership) {
				result.push({team, membership});
			}
		}

		return result;
	}

	async getTeam(userId: UserID, teamId: bigint): Promise<ApplicationTeamRow> {
		const team = await this.requireTeam(teamId);
		await this.requireTeamMember(userId, team);
		return team;
	}

	async updateTeam(userId: UserID, teamId: bigint, args: {name: string}): Promise<ApplicationTeamRow> {
		const team = await this.requireTeam(teamId);
		await this.requireTeamManager(userId, team);

		const updated: ApplicationTeamRow = {...team, name: args.name};
		await this.deps.teamRepository.upsertTeam(updated);
		return updated;
	}

	/**
	 * Owner-only, and only when the team owns zero applications. Requiring the
	 * caller to transfer applications away first means deleting a team can never
	 * silently strand or re-home an application.
	 */
	async deleteTeam(userId: UserID, teamId: bigint): Promise<void> {
		const team = await this.requireTeam(teamId);
		if (team.owner_user_id !== userId) {
			throw new AccessDeniedError();
		}

		const applicationIds = await this.deps.teamRepository.listApplicationIdsByTeam(teamId);
		if (applicationIds.length > 0) {
			throw new TeamStillOwnsApplicationsError();
		}

		await this.deps.teamRepository.deleteTeam(teamId);
		Logger.info({teamId: teamId.toString()}, 'Deleted developer team');
	}

	async listMembers(userId: UserID, teamId: bigint): Promise<Array<ApplicationTeamMemberRow>> {
		const team = await this.requireTeam(teamId);
		await this.requireTeamMember(userId, team);
		return this.deps.teamRepository.listMembers(teamId);
	}

	async inviteMember(
		userId: UserID,
		teamId: bigint,
		args: {
			targetUserId?: UserID;
			username?: string;
			discriminator?: number;
			role?: TeamMemberRole;
		},
	): Promise<{member: ApplicationTeamMemberRow; user: User}> {
		const team = await this.requireTeam(teamId);
		await this.requireTeamManager(userId, team);

		let target: User | null = null;
		if (args.targetUserId !== undefined) {
			target = await this.deps.userRepository.findUnique(args.targetUserId);
		} else if (args.username !== undefined && args.discriminator !== undefined) {
			target = await this.deps.userRepository.findByUsernameDiscriminator(args.username, args.discriminator);
		}
		if (!target) {
			throw new UnknownUserError();
		}

		if (target.isBot || (target.flags & UserFlags.DELETED) === UserFlags.DELETED) {
			throw new UserCannotJoinTeamError();
		}

		const existing = await this.deps.teamRepository.getMember(teamId, target.id);
		if (existing) {
			throw new TeamMemberAlreadyExistsError();
		}

		const member: ApplicationTeamMemberRow = {
			team_id: teamId,
			user_id: target.id,
			role: args.role ?? 'developer',
			membership_state: 'invited',
			invited_by_user_id: userId,
			invited_at: new Date(),
			accepted_at: null,
			version: 1,
		};

		await this.deps.teamRepository.upsertMember(member);

		Logger.info(
			{teamId: teamId.toString(), targetUserId: target.id.toString(), role: member.role},
			'Invited user to developer team',
		);

		return {member, user: target};
	}

	async acceptInvite(userId: UserID, teamId: bigint): Promise<ApplicationTeamMemberRow> {
		await this.requireTeam(teamId);

		const member = await this.deps.teamRepository.getMember(teamId, userId);
		if (!member) {
			throw new UnknownTeamMemberError();
		}

		if (member.membership_state === 'accepted') {
			return member;
		}

		const accepted: ApplicationTeamMemberRow = {
			...member,
			membership_state: 'accepted',
			accepted_at: new Date(),
		};
		await this.deps.teamRepository.upsertMember(accepted);

		Logger.info({teamId: teamId.toString(), userId: userId.toString()}, 'User accepted developer team invite');

		return accepted;
	}

	async updateMemberRole(
		userId: UserID,
		teamId: bigint,
		targetUserId: UserID,
		role: TeamMemberRole,
	): Promise<ApplicationTeamMemberRow> {
		const team = await this.requireTeam(teamId);
		await this.requireTeamManager(userId, team);

		if (targetUserId === team.owner_user_id) {
			// The owner's authority comes from the team row; their symbolic member
			// row stays 'admin' so it can never misrepresent their access.
			throw new TeamOwnerCannotBeRemovedError();
		}

		const member = await this.deps.teamRepository.getMember(teamId, targetUserId);
		if (!member) {
			throw new UnknownTeamMemberError();
		}

		const updated: ApplicationTeamMemberRow = {...member, role};
		await this.deps.teamRepository.upsertMember(updated);
		return updated;
	}

	/**
	 * Removes a member. Managers may remove anyone but the owner; any member may
	 * remove themselves, which doubles as both "leave team" and "decline invite".
	 */
	async removeMember(userId: UserID, teamId: bigint, targetUserId: UserID): Promise<void> {
		const team = await this.requireTeam(teamId);

		if (targetUserId === team.owner_user_id) {
			throw new TeamOwnerCannotBeRemovedError();
		}

		if (userId !== targetUserId) {
			await this.requireTeamManager(userId, team);
		}

		const member = await this.deps.teamRepository.getMember(teamId, targetUserId);
		if (!member) {
			throw new UnknownTeamMemberError();
		}

		await this.deps.teamRepository.deleteMember(teamId, targetUserId);

		Logger.info(
			{teamId: teamId.toString(), targetUserId: targetUserId.toString(), removedBy: userId.toString()},
			'Removed member from developer team',
		);
	}

	/**
	 * Moves an application onto a team (or off it, with teamId null).
	 *
	 * Transfer requires the application's 'delete' capability — owner only — and
	 * manager rights on the destination team, so nobody can dump applications
	 * into a team they do not run. owner_user_id is rewritten to the team's
	 * owner and is never null: a team-owned application still has a person
	 * accountable for it.
	 */
	async transferApplication(userId: UserID, applicationId: ApplicationID, teamId: bigint | null): Promise<Application> {
		const application = await this.deps.applicationAccessService.requireAccess(userId, applicationId, 'delete');

		if (teamId === null) {
			if (application.teamId === null) {
				return application;
			}
			const oldRow = application.toRow();
			// Detaching keeps the current owner (the former team's owner); it only
			// severs the team linkage.
			return this.deps.applicationRepository.upsertApplication({...oldRow, team_id: null}, oldRow);
		}

		const team = await this.requireTeam(teamId);
		await this.requireTeamManager(userId, team);

		if (application.teamId === teamId && application.ownerUserId === team.owner_user_id) {
			return application;
		}

		const oldRow = application.toRow();
		const updated = await this.deps.applicationRepository.upsertApplication(
			{...oldRow, team_id: teamId, owner_user_id: team.owner_user_id},
			oldRow,
		);

		Logger.info(
			{
				applicationId: applicationId.toString(),
				teamId: teamId.toString(),
				previousOwner: oldRow.owner_user_id.toString(),
				newOwner: team.owner_user_id.toString(),
			},
			'Transferred application to developer team',
		);

		return updated;
	}
}
