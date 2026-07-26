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

export type TeamMemberRole = 'admin' | 'developer' | 'read_only';
export type TeamMembershipState = 'invited' | 'accepted';

export interface DeveloperTeam {
	id: string;
	name: string;
	owner_user_id: string;
	created_at: string;
	/** The current user's role; present on /teams list responses. */
	role?: TeamMemberRole;
	/** The current user's membership state; present on /teams list responses. */
	membership_state?: TeamMembershipState;
}

export interface TeamMemberUser {
	id: string;
	username: string;
	discriminator: string;
	global_name: string | null;
	avatar: string | null;
}

export interface DeveloperTeamMember {
	team_id: string;
	user: TeamMemberUser;
	role: TeamMemberRole;
	membership_state: TeamMembershipState;
	invited_at: string;
	accepted_at: string | null;
}

export class DeveloperTeamRecord implements DeveloperTeam {
	readonly id: string;
	readonly name: string;
	readonly owner_user_id: string;
	readonly created_at: string;
	readonly role?: TeamMemberRole;
	readonly membership_state?: TeamMembershipState;

	constructor(team: DeveloperTeam) {
		this.id = team.id;
		this.name = team.name;
		this.owner_user_id = team.owner_user_id;
		this.created_at = team.created_at;
		if ('role' in team) {
			this.role = team.role;
		}
		if ('membership_state' in team) {
			this.membership_state = team.membership_state;
		}
	}

	static from(team: DeveloperTeam): DeveloperTeamRecord {
		return new DeveloperTeamRecord(team);
	}

	isPendingInvite(): boolean {
		return this.membership_state === 'invited';
	}

	isOwnedBy(userId: string | undefined): boolean {
		return userId !== undefined && this.owner_user_id === userId;
	}

	withUpdates(updates: Partial<DeveloperTeam>): DeveloperTeamRecord {
		return new DeveloperTeamRecord({...this.toObject(), ...updates});
	}

	toObject(): DeveloperTeam {
		return {
			id: this.id,
			name: this.name,
			owner_user_id: this.owner_user_id,
			created_at: this.created_at,
			role: this.role,
			membership_state: this.membership_state,
		};
	}
}
