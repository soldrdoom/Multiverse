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

import {createTestAccount, type TestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createGuild} from '@fluxer/api/src/channel/tests/ChannelTestUtils';
import {createOAuth2Application, createUniqueApplicationName} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {beforeEach, describe, expect, test} from 'vitest';

interface TeamBody {
	id: string;
	name: string;
	owner_user_id: string;
	created_at: string;
	role?: string;
	membership_state?: string;
}

interface TeamMemberBody {
	team_id: string;
	user: {id: string; username: string};
	role: string;
	membership_state: string;
	invited_at: string;
	accepted_at: string | null;
}

interface ApplicationBody {
	id: string;
	name: string;
	team_id: string | null;
}

async function createTeam(harness: ApiTestHarness, token: string, name: string): Promise<TeamBody> {
	return createBuilder<TeamBody>(harness, token).post('/teams').body({name}).expect(HTTP_STATUS.OK).execute();
}

async function inviteMember(
	harness: ApiTestHarness,
	token: string,
	teamId: string,
	userId: string,
	role?: string,
): Promise<TeamMemberBody> {
	return createBuilder<TeamMemberBody>(harness, token)
		.post(`/teams/${teamId}/members`)
		.body({user_id: userId, ...(role !== undefined && {role})})
		.expect(HTTP_STATUS.OK)
		.execute();
}

async function acceptInvite(harness: ApiTestHarness, token: string, teamId: string): Promise<TeamMemberBody> {
	return createBuilder<TeamMemberBody>(harness, token)
		.post(`/teams/${teamId}/members/@me/accept`)
		.expect(HTTP_STATUS.OK)
		.execute();
}

async function transferApplication(
	harness: ApiTestHarness,
	token: string,
	applicationId: string,
	teamId: string | null,
): Promise<ApplicationBody> {
	return createBuilder<ApplicationBody>(harness, token)
		.patch(`/oauth2/applications/${applicationId}/team`)
		.body({team_id: teamId})
		.expect(HTTP_STATUS.OK)
		.execute();
}

/**
 * Creates an owner with a team-owned application plus a second account invited
 * at the given role. The invite is left pending unless accept is set.
 */
async function setupTeamApplication(
	harness: ApiTestHarness,
	role: string,
	options?: {accept?: boolean},
): Promise<{owner: TestAccount; member: TestAccount; teamId: string; applicationId: string}> {
	const owner = await createTestAccount(harness);
	const member = await createTestAccount(harness);
	const team = await createTeam(harness, owner.token, `team-${Date.now()}`);
	const created = await createOAuth2Application(harness, owner.token, {
		name: createUniqueApplicationName(),
	});
	await transferApplication(harness, owner.token, created.application.id, team.id);
	await inviteMember(harness, owner.token, team.id, member.userId, role);
	if (options?.accept !== false) {
		await acceptInvite(harness, member.token, team.id);
	}
	return {owner, member, teamId: team.id, applicationId: created.application.id};
}

describe('Team membership', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('a non-member gets 403 on team and application resources', async () => {
		const owner = await createTestAccount(harness);
		const stranger = await createTestAccount(harness);
		const team = await createTeam(harness, owner.token, 'private-team');
		const created = await createOAuth2Application(harness, owner.token, {
			name: createUniqueApplicationName(),
		});
		await transferApplication(harness, owner.token, created.application.id, team.id);

		await createBuilder(harness, stranger.token).get(`/teams/${team.id}`).expect(HTTP_STATUS.FORBIDDEN).execute();
		await createBuilder(harness, stranger.token)
			.get(`/teams/${team.id}/members`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
		await createBuilder(harness, stranger.token)
			.get(`/oauth2/applications/${created.application.id}`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
		await createBuilder(harness, stranger.token)
			.get(`/oauth2/applications/${created.application.id}/bot/tokens`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('read_only can GET the application but cannot PATCH it or mint tokens', async () => {
		const {member, applicationId} = await setupTeamApplication(harness, 'read_only');

		const app = await createBuilder<ApplicationBody>(harness, member.token)
			.get(`/oauth2/applications/${applicationId}`)
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(app.id).toBe(applicationId);

		// Token metadata is 'read' — allowed.
		await createBuilder(harness, member.token)
			.get(`/oauth2/applications/${applicationId}/bot/tokens`)
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, member.token)
			.patch(`/oauth2/applications/${applicationId}`)
			.body({description: 'nope'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		await createBuilder(harness, member.token)
			.post(`/oauth2/applications/${applicationId}/bot/tokens`)
			.body({name: 'sneaky'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('a developer can edit but cannot mint tokens or delete', async () => {
		const {member, applicationId} = await setupTeamApplication(harness, 'developer');

		await createBuilder(harness, member.token)
			.patch(`/oauth2/applications/${applicationId}`)
			.body({description: 'updated by developer'})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, member.token)
			.post(`/oauth2/applications/${applicationId}/bot/tokens`)
			.body({name: 'ci'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		await createBuilder(harness, member.token)
			.delete(`/oauth2/applications/${applicationId}`)
			.body({password: member.password})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('an admin can mint tokens but cannot delete the application', async () => {
		const {member, applicationId} = await setupTeamApplication(harness, 'admin');

		const minted = await createBuilder<{token?: string}>(harness, member.token)
			.post(`/oauth2/applications/${applicationId}/bot/tokens`)
			.body({name: 'admin-minted'})
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(minted.token).toBeTruthy();

		// Delete stays owner-only regardless of team role.
		await createBuilder(harness, member.token)
			.delete(`/oauth2/applications/${applicationId}`)
			.body({password: member.password})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('invited-but-not-accepted has zero capabilities', async () => {
		const {member, teamId, applicationId} = await setupTeamApplication(harness, 'admin', {accept: false});

		// The pending invite is visible in the member's team list...
		const teams = await createBuilder<Array<TeamBody>>(harness, member.token)
			.get('/teams')
			.expect(HTTP_STATUS.OK)
			.execute();
		const pending = teams.find((entry) => entry.id === teamId);
		expect(pending?.membership_state).toBe('invited');

		// ...but confers nothing at all until accepted, even at role admin.
		await createBuilder(harness, member.token).get(`/teams/${teamId}`).expect(HTTP_STATUS.FORBIDDEN).execute();
		await createBuilder(harness, member.token)
			.get(`/oauth2/applications/${applicationId}`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
		await createBuilder(harness, member.token)
			.patch(`/oauth2/applications/${applicationId}`)
			.body({description: 'nope'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
		await createBuilder(harness, member.token)
			.post(`/oauth2/applications/${applicationId}/bot/tokens`)
			.body({name: 'nope'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		const apps = await createBuilder<Array<ApplicationBody>>(harness, member.token)
			.get('/oauth2/applications/@me')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(apps.some((entry) => entry.id === applicationId)).toBe(false);
	});

	test('accepting an invite makes the application appear in the member list', async () => {
		const {member, applicationId} = await setupTeamApplication(harness, 'developer', {accept: false});

		let apps = await createBuilder<Array<ApplicationBody>>(harness, member.token)
			.get('/oauth2/applications/@me')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(apps.some((entry) => entry.id === applicationId)).toBe(false);

		const teams = await createBuilder<Array<TeamBody>>(harness, member.token)
			.get('/teams')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(teams.length).toBe(1);

		const accepted = await acceptInvite(harness, member.token, teams[0].id);
		expect(accepted.membership_state).toBe('accepted');
		expect(accepted.accepted_at).not.toBeNull();

		apps = await createBuilder<Array<ApplicationBody>>(harness, member.token)
			.get('/oauth2/applications/@me')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(apps.some((entry) => entry.id === applicationId)).toBe(true);
	});

	test('transfer rewrites the owner to the team owner and back-transfers are owner-only', async () => {
		const owner = await createTestAccount(harness);
		const admin = await createTestAccount(harness);
		const team = await createTeam(harness, owner.token, 'transfer-team');
		await inviteMember(harness, owner.token, team.id, admin.userId, 'admin');
		await acceptInvite(harness, admin.token, team.id);

		// The admin creates an application they personally own...
		const created = await createOAuth2Application(harness, admin.token, {
			name: createUniqueApplicationName(),
		});
		expect(created.application.team_id ?? null).toBeNull();

		// ...and transfers it to the team, which rewrites the owner.
		const transferred = await transferApplication(harness, admin.token, created.application.id, team.id);
		expect(transferred.team_id).toBe(team.id);

		// The former owner is no longer the owner, so a second transfer (an
		// owner-only operation) is refused...
		await createBuilder(harness, admin.token)
			.patch(`/oauth2/applications/${created.application.id}/team`)
			.body({team_id: null})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		// ...while the team owner can do it, and both still see the application.
		const ownerApps = await createBuilder<Array<ApplicationBody>>(harness, owner.token)
			.get('/oauth2/applications/@me')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(ownerApps.some((entry) => entry.id === created.application.id)).toBe(true);

		const detached = await transferApplication(harness, owner.token, created.application.id, null);
		expect(detached.team_id).toBeNull();

		// After detaching, the application belongs personally to the team owner;
		// the original creator has lost access entirely.
		await createBuilder(harness, admin.token)
			.get(`/oauth2/applications/${created.application.id}`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('transferring into a team you do not manage is refused', async () => {
		const owner = await createTestAccount(harness);
		const outsider = await createTestAccount(harness);
		const team = await createTeam(harness, owner.token, 'closed-team');

		const created = await createOAuth2Application(harness, outsider.token, {
			name: createUniqueApplicationName(),
		});

		await createBuilder(harness, outsider.token)
			.patch(`/oauth2/applications/${created.application.id}/team`)
			.body({team_id: team.id})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('team deletion is owner-only and refused while the team owns applications', async () => {
		const {owner, member, teamId, applicationId} = await setupTeamApplication(harness, 'admin');

		// Admins cannot delete the team.
		await createBuilder(harness, member.token).delete(`/teams/${teamId}`).expect(HTTP_STATUS.FORBIDDEN).execute();

		// The owner cannot either while it still owns an application.
		await createBuilder(harness, owner.token).delete(`/teams/${teamId}`).expect(HTTP_STATUS.BAD_REQUEST).execute();

		await transferApplication(harness, owner.token, applicationId, null);

		await createBuilder(harness, owner.token).delete(`/teams/${teamId}`).expect(HTTP_STATUS.NO_CONTENT).execute();

		await createBuilder(harness, owner.token).get(`/teams/${teamId}`).expect(HTTP_STATUS.NOT_FOUND).execute();
	});

	test('members can be invited by username and discriminator', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const team = await createTeam(harness, owner.token, 'tag-invites');

		const me = await createBuilder<{id: string; username: string; discriminator: string}>(harness, member.token)
			.get('/users/@me')
			.expect(HTTP_STATUS.OK)
			.execute();

		const invited = await createBuilder<TeamMemberBody>(harness, owner.token)
			.post(`/teams/${team.id}/members`)
			.body({username: me.username, discriminator: me.discriminator})
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(invited.user.id).toBe(member.userId);
		expect(invited.membership_state).toBe('invited');
		expect(invited.role).toBe('developer');
	});

	test('the team owner cannot be removed and members can leave', async () => {
		const {owner, member, teamId} = await setupTeamApplication(harness, 'developer');

		// Nobody removes the owner — not even the owner.
		await createBuilder(harness, owner.token)
			.delete(`/teams/${teamId}/members/${owner.userId}`)
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();

		// A developer cannot remove someone else... (the owner is guarded above;
		// removing the owner's row hits the owner guard first, so target another)
		// A developer removing themselves is leaving, which is allowed.
		await createBuilder(harness, member.token)
			.delete(`/teams/${teamId}/members/${member.userId}`)
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		// Gone means gone: no more team access.
		await createBuilder(harness, member.token).get(`/teams/${teamId}`).expect(HTTP_STATUS.FORBIDDEN).execute();
	});

	test('role changes are manager-only and the owner row is immutable', async () => {
		const {owner, member, teamId} = await setupTeamApplication(harness, 'read_only');

		// A read_only member cannot promote themselves.
		await createBuilder(harness, member.token)
			.patch(`/teams/${teamId}/members/${member.userId}`)
			.body({role: 'admin'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		// The owner can.
		const promoted = await createBuilder<TeamMemberBody>(harness, owner.token)
			.patch(`/teams/${teamId}/members/${member.userId}`)
			.body({role: 'admin'})
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(promoted.role).toBe('admin');

		// The owner's symbolic member row cannot be rewritten.
		await createBuilder(harness, owner.token)
			.patch(`/teams/${teamId}/members/${owner.userId}`)
			.body({role: 'read_only'})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	test('inviting an existing member again is refused', async () => {
		const {owner, member, teamId} = await setupTeamApplication(harness, 'developer');

		await createBuilder(harness, owner.token)
			.post(`/teams/${teamId}/members`)
			.body({user_id: member.userId})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	test('the private-bot invite gate respects team capabilities', async () => {
		const owner = await createTestAccount(harness);
		const readOnly = await createTestAccount(harness);
		const developer = await createTestAccount(harness);
		const team = await createTeam(harness, owner.token, 'private-bot-team');
		const created = await createOAuth2Application(harness, owner.token, {
			name: createUniqueApplicationName(),
			redirect_uris: ['https://example.com/callback'],
			bot_public: false,
		});
		await transferApplication(harness, owner.token, created.application.id, team.id);
		await inviteMember(harness, owner.token, team.id, readOnly.userId, 'read_only');
		await acceptInvite(harness, readOnly.token, team.id);
		await inviteMember(harness, owner.token, team.id, developer.userId, 'developer');
		await acceptInvite(harness, developer.token, team.id);

		// A read_only member lacks invite_bot on a private bot's consent flow.
		const readOnlyGuild = await createGuild(harness, readOnly.token, 'Read Only Guild');
		await createBuilder(harness, readOnly.token)
			.post('/oauth2/authorize/consent')
			.body({client_id: created.application.id, scope: 'bot', guild_id: readOnlyGuild.id, permissions: '0'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		// A developer holds invite_bot, so the same flow succeeds for them.
		const developerGuild = await createGuild(harness, developer.token, 'Developer Guild');
		await createBuilder(harness, developer.token)
			.post('/oauth2/authorize/consent')
			.body({client_id: created.application.id, scope: 'bot', guild_id: developerGuild.id, permissions: '0'})
			.expect(HTTP_STATUS.OK)
			.execute();
	});
});
