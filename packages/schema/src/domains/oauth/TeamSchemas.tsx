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

import {UserPartialResponse} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {
	createNamedStringLiteralUnion,
	createStringType,
	SnowflakeStringType,
	SnowflakeType,
	withOpenApiType,
} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {DiscriminatorType, UsernameType} from '@fluxer/schema/src/primitives/UserValidators';
import {z} from 'zod';

export const TeamMemberRoleType = withOpenApiType(
	createNamedStringLiteralUnion(
		[
			['admin', 'ADMIN', 'Full management: edit applications, manage tokens and secrets, manage members'],
			['developer', 'DEVELOPER', 'Edit applications and invite private bots; cannot touch credentials or members'],
			['read_only', 'READ_ONLY', 'Read applications and token metadata only'],
		] as const,
		"A team member's role",
	),
	'TeamMemberRole',
);

export const TeamMembershipStateType = withOpenApiType(
	createNamedStringLiteralUnion(
		[
			['invited', 'INVITED', 'Invited but not yet accepted; confers no access'],
			['accepted', 'ACCEPTED', 'Accepted membership'],
		] as const,
		"The state of a team member's invitation",
	),
	'TeamMembershipState',
);

const TeamNameType = createStringType(1, 100).describe('The name of the team');

export const TeamResponse = z.object({
	id: SnowflakeStringType.describe('The unique identifier of the team'),
	name: z.string().describe('The name of the team'),
	owner_user_id: SnowflakeStringType.describe('The user who owns the team'),
	created_at: z.string().describe('When the team was created'),
});

export type TeamResponse = z.infer<typeof TeamResponse>;

export const TeamWithMembershipResponse = TeamResponse.extend({
	role: TeamMemberRoleType.describe("The current user's role in the team"),
	membership_state: TeamMembershipStateType.describe("The current user's membership state"),
});

export type TeamWithMembershipResponse = z.infer<typeof TeamWithMembershipResponse>;

export const TeamListResponse = z.array(TeamWithMembershipResponse);

export type TeamListResponse = z.infer<typeof TeamListResponse>;

export const TeamMemberResponse = z.object({
	team_id: SnowflakeStringType.describe('The team this membership belongs to'),
	user: UserPartialResponse.describe('The member'),
	role: TeamMemberRoleType,
	membership_state: TeamMembershipStateType,
	invited_at: z.string().describe('When the member was invited'),
	accepted_at: z.string().nullable().describe('When the member accepted the invite, if they have'),
});

export type TeamMemberResponse = z.infer<typeof TeamMemberResponse>;

export const TeamMemberListResponse = z.array(TeamMemberResponse);

export type TeamMemberListResponse = z.infer<typeof TeamMemberListResponse>;

export const TeamCreateRequest = z.object({
	name: TeamNameType,
});

export type TeamCreateRequest = z.infer<typeof TeamCreateRequest>;

export const TeamUpdateRequest = z.object({
	name: TeamNameType,
});

export type TeamUpdateRequest = z.infer<typeof TeamUpdateRequest>;

export const TeamMemberInviteRequest = z
	.object({
		user_id: SnowflakeType.optional().describe('The ID of the user to invite'),
		username: UsernameType.optional().describe('The username of the user to invite, with discriminator'),
		discriminator: DiscriminatorType.optional().describe('The discriminator of the user to invite'),
		role: TeamMemberRoleType.optional().describe("The invitee's role; defaults to developer"),
	})
	.refine(
		(value) => value.user_id !== undefined || (value.username !== undefined && value.discriminator !== undefined),
		{
			message: 'Provide either user_id or username and discriminator',
			path: ['user_id'],
		},
	);

export type TeamMemberInviteRequest = z.infer<typeof TeamMemberInviteRequest>;

export const TeamMemberUpdateRequest = z.object({
	role: TeamMemberRoleType.describe("The member's new role"),
});

export type TeamMemberUpdateRequest = z.infer<typeof TeamMemberUpdateRequest>;

export const ApplicationTeamTransferRequest = z.object({
	team_id: SnowflakeType.nullable().describe('The team to transfer the application to, or null to detach it'),
});

export type ApplicationTeamTransferRequest = z.infer<typeof ApplicationTeamTransferRequest>;
