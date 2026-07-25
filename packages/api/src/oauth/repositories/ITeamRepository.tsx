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
import type {ApplicationTeamMemberRow, ApplicationTeamRow} from '@fluxer/api/src/database/types/OAuth2Types';

export interface ITeamRepository {
	getTeam(teamId: bigint): Promise<ApplicationTeamRow | null>;
	upsertTeam(row: ApplicationTeamRow): Promise<void>;
	/** Deletes the team row, every member row, and every by-user index row. */
	deleteTeam(teamId: bigint): Promise<void>;
	listTeamIdsByUser(userId: UserID): Promise<Array<bigint>>;
	getMember(teamId: bigint, userId: UserID): Promise<ApplicationTeamMemberRow | null>;
	listMembers(teamId: bigint): Promise<Array<ApplicationTeamMemberRow>>;
	/** Writes the member row and its application_teams_by_user index row. */
	upsertMember(row: ApplicationTeamMemberRow): Promise<void>;
	/** Deletes the member row and its application_teams_by_user index row. */
	deleteMember(teamId: bigint, userId: UserID): Promise<void>;
	listApplicationIdsByTeam(teamId: bigint): Promise<Array<ApplicationID>>;
}
