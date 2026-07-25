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
import {BatchBuilder, fetchMany, fetchOne} from '@fluxer/api/src/database/Cassandra';
import type {
	ApplicationByTeamRow,
	ApplicationTeamByUserRow,
	ApplicationTeamMemberRow,
	ApplicationTeamRow,
} from '@fluxer/api/src/database/types/OAuth2Types';
import type {ITeamRepository} from '@fluxer/api/src/oauth/repositories/ITeamRepository';
import {
	ApplicationsByTeam,
	ApplicationTeamMembers,
	ApplicationTeams,
	ApplicationTeamsByUser,
} from '@fluxer/api/src/Tables';

const SELECT_TEAM_CQL = ApplicationTeams.selectCql({
	where: ApplicationTeams.where.eq('team_id'),
});

const SELECT_MEMBER_CQL = ApplicationTeamMembers.selectCql({
	where: [ApplicationTeamMembers.where.eq('team_id'), ApplicationTeamMembers.where.eq('user_id')],
});

const SELECT_MEMBERS_BY_TEAM_CQL = ApplicationTeamMembers.selectCql({
	where: ApplicationTeamMembers.where.eq('team_id'),
});

const SELECT_TEAM_IDS_BY_USER_CQL = ApplicationTeamsByUser.selectCql({
	where: ApplicationTeamsByUser.where.eq('user_id'),
});

const SELECT_APPLICATION_IDS_BY_TEAM_CQL = ApplicationsByTeam.selectCql({
	columns: ['application_id'],
	where: ApplicationsByTeam.where.eq('team_id'),
});

export class TeamRepository implements ITeamRepository {
	async getTeam(teamId: bigint): Promise<ApplicationTeamRow | null> {
		return fetchOne<ApplicationTeamRow>(SELECT_TEAM_CQL, {team_id: teamId});
	}

	async upsertTeam(row: ApplicationTeamRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationTeams.upsertAll(row));
		await batch.execute();
	}

	async deleteTeam(teamId: bigint): Promise<void> {
		const members = await this.listMembers(teamId);

		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationTeams.deleteByPk({team_id: teamId}));
		for (const member of members) {
			batch.addPrepared(ApplicationTeamMembers.deleteByPk({team_id: teamId, user_id: member.user_id}));
			batch.addPrepared(ApplicationTeamsByUser.deleteByPk({user_id: member.user_id, team_id: teamId}));
		}
		await batch.execute();
	}

	async listTeamIdsByUser(userId: UserID): Promise<Array<bigint>> {
		const rows = await fetchMany<ApplicationTeamByUserRow>(SELECT_TEAM_IDS_BY_USER_CQL, {user_id: userId});
		return rows.map((row) => row.team_id);
	}

	async getMember(teamId: bigint, userId: UserID): Promise<ApplicationTeamMemberRow | null> {
		return fetchOne<ApplicationTeamMemberRow>(SELECT_MEMBER_CQL, {team_id: teamId, user_id: userId});
	}

	async listMembers(teamId: bigint): Promise<Array<ApplicationTeamMemberRow>> {
		return fetchMany<ApplicationTeamMemberRow>(SELECT_MEMBERS_BY_TEAM_CQL, {team_id: teamId});
	}

	async upsertMember(row: ApplicationTeamMemberRow): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationTeamMembers.upsertAll(row));
		batch.addPrepared(
			ApplicationTeamsByUser.upsertAll({
				user_id: row.user_id,
				team_id: row.team_id,
			}),
		);
		await batch.execute();
	}

	async deleteMember(teamId: bigint, userId: UserID): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationTeamMembers.deleteByPk({team_id: teamId, user_id: userId}));
		batch.addPrepared(ApplicationTeamsByUser.deleteByPk({user_id: userId, team_id: teamId}));
		await batch.execute();
	}

	async listApplicationIdsByTeam(teamId: bigint): Promise<Array<ApplicationID>> {
		const rows = await fetchMany<ApplicationByTeamRow>(SELECT_APPLICATION_IDS_BY_TEAM_CQL, {team_id: teamId});
		return rows.map((row) => row.application_id);
	}
}
