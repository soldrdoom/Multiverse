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
import {createUserID, type UserID} from '@fluxer/api/src/BrandedTypes';
import type {ApplicationTeamMemberRow} from '@fluxer/api/src/database/types/OAuth2Types';
import {
	mapTeamMemberToResponse,
	mapTeamToResponse,
	mapTeamWithMembershipToResponse,
} from '@fluxer/api/src/oauth/OAuth2Mappers';
import type {TeamService} from '@fluxer/api/src/oauth/TeamService';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import type {
	TeamCreateRequest,
	TeamListResponse,
	TeamMemberInviteRequest,
	TeamMemberListResponse,
	TeamMemberResponse,
	TeamMemberUpdateRequest,
	TeamResponse,
	TeamUpdateRequest,
} from '@fluxer/schema/src/domains/oauth/TeamSchemas';
import type {Context} from 'hono';

export class OAuth2TeamsRequestService {
	constructor(
		private readonly teamService: TeamService,
		private readonly userRepository: IUserRepository,
		private readonly authService: AuthService,
		private readonly authMfaService: AuthMfaService,
	) {}

	async listTeams(userId: UserID): Promise<TeamListResponse> {
		const teams = await this.teamService.listTeamsForUser(userId);
		return teams.map(({team, membership}) => mapTeamWithMembershipToResponse(team, membership));
	}

	async createTeam(userId: UserID, body: TeamCreateRequest): Promise<TeamResponse> {
		const {team} = await this.teamService.createTeam(userId, body.name);
		return mapTeamToResponse(team);
	}

	async getTeam(userId: UserID, teamId: bigint): Promise<TeamResponse> {
		const team = await this.teamService.getTeam(userId, teamId);
		return mapTeamToResponse(team);
	}

	async updateTeam(userId: UserID, teamId: bigint, body: TeamUpdateRequest): Promise<TeamResponse> {
		const team = await this.teamService.updateTeam(userId, teamId, {name: body.name});
		return mapTeamToResponse(team);
	}

	async deleteTeam(params: {ctx: Context; userId: UserID; body: SudoVerificationBody; teamId: bigint}): Promise<void> {
		await requireSudoMode(params.ctx, params.ctx.get('user'), params.body, this.authService, this.authMfaService);

		await this.teamService.deleteTeam(params.userId, params.teamId);
	}

	async listMembers(userId: UserID, teamId: bigint): Promise<TeamMemberListResponse> {
		const members = await this.teamService.listMembers(userId, teamId);
		const responses: TeamMemberListResponse = [];
		for (const member of members) {
			const response = await this.buildMemberResponse(member);
			if (response) {
				responses.push(response);
			}
		}
		return responses;
	}

	async inviteMember(userId: UserID, teamId: bigint, body: TeamMemberInviteRequest): Promise<TeamMemberResponse> {
		const {member, user} = await this.teamService.inviteMember(userId, teamId, {
			targetUserId: body.user_id !== undefined ? createUserID(body.user_id) : undefined,
			username: body.username,
			discriminator: body.discriminator,
			role: body.role,
		});
		return mapTeamMemberToResponse(member, user);
	}

	async acceptInvite(userId: UserID, teamId: bigint): Promise<TeamMemberResponse> {
		const member = await this.teamService.acceptInvite(userId, teamId);
		const response = await this.buildMemberResponse(member);
		// The accepting user necessarily exists; this is for the type system.
		if (!response) {
			throw new Error('Accepted team member has no user row');
		}
		return response;
	}

	async updateMemberRole(
		userId: UserID,
		teamId: bigint,
		targetUserId: bigint,
		body: TeamMemberUpdateRequest,
	): Promise<TeamMemberResponse> {
		const member = await this.teamService.updateMemberRole(userId, teamId, createUserID(targetUserId), body.role);
		const response = await this.buildMemberResponse(member);
		if (!response) {
			throw new Error('Updated team member has no user row');
		}
		return response;
	}

	async removeMember(userId: UserID, teamId: bigint, targetUserId: bigint): Promise<void> {
		await this.teamService.removeMember(userId, teamId, createUserID(targetUserId));
	}

	private async buildMemberResponse(member: ApplicationTeamMemberRow): Promise<TeamMemberResponse | null> {
		const user = await this.userRepository.findUnique(member.user_id);
		if (!user) {
			return null;
		}
		return mapTeamMemberToResponse(member, user);
	}
}
