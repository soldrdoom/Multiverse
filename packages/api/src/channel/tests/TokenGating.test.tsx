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

import {createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {
	acceptInvite,
	createChannelInvite,
	createGuild,
	getChannel,
} from '@fluxer/api/src/channel/tests/ChannelTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {ChannelResponse} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import type {GuildResponse} from '@fluxer/schema/src/domains/guild/GuildResponseSchemas';
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';

// A well-formed base58-encoded 32-byte Solana address (the System Program ID).
// Real-looking, but no DAS endpoint is configured in the test harness, so any
// gate check against it must fail closed as 'unavailable' rather than pass.
const FAKE_GATE_ADDRESS = '11111111111111111111111111111111';

describe('Token Gating', () => {
	let harness: ApiTestHarness;

	beforeAll(async () => {
		harness = await createApiTestHarness();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	it('rejects an invalid address when setting a gate', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');

		await createBuilder(harness, owner.token)
			.put(`/channels/${guild.system_channel_id}/token-gate`)
			.body({address: 'not-a-real-address'})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	it('rejects setting a gate from a member without Manage Channels', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');

		const invite = await createChannelInvite(harness, owner.token, guild.system_channel_id!);
		await acceptInvite(harness, member.token, invite.code);

		await createBuilder(harness, member.token)
			.put(`/channels/${guild.system_channel_id}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.FORBIDDEN, APIErrorCodes.MISSING_PERMISSIONS)
			.execute();
	});

	it('blocks channel access for a member with no linked wallet, and restores access when the gate is cleared', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');
		const channelId = guild.system_channel_id!;

		const invite = await createChannelInvite(harness, owner.token, channelId);
		await acceptInvite(harness, member.token, invite.code);

		// Sanity check: accessible before any gate is configured.
		await getChannel(harness, member.token, channelId);

		await createBuilder(harness, owner.token)
			.put(`/channels/${channelId}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		// The channel list endpoint never throws for a gated-but-unsatisfied channel -- it
		// still reports the channel's own configured address (an admin/list-level view).
		const channelsAfterGating = await createBuilder<Array<ChannelResponse>>(harness, member.token)
			.get(`/guilds/${guild.id}/channels`)
			.execute();
		const gated = channelsAfterGating.find((c) => c.id === channelId);
		expect(gated?.token_gate_address).toBe(FAKE_GATE_ADDRESS);
		expect(gated?.token_gate_satisfied).toBe(false);

		// Fails closed: this test account has no linked Solana wallet (email/password
		// signup, no SIWS), so it never satisfies any gate -- not a silent pass. Getting the
		// single channel directly (not just listing it) now throws, since VIEW_CHANNEL access
		// requires satisfying the gate. (The guild owner is exempt from this -- see the
		// dedicated owner-bypass test below.)
		await createBuilder(harness, member.token)
			.get(`/channels/${channelId}`)
			.expect(HTTP_STATUS.FORBIDDEN, APIErrorCodes.TOKEN_GATE_REQUIREMENT_NOT_MET)
			.execute();

		await createBuilder(harness, owner.token)
			.delete(`/channels/${channelId}/token-gate`)
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		const cleared = await getChannel(harness, member.token, channelId);
		expect(cleared.token_gate_address ?? null).toBeNull();
	});

	it("the guild owner always bypasses a gate they don't satisfy, both in the channel list and direct access", async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');
		const channelId = guild.system_channel_id!;

		await createBuilder(harness, owner.token)
			.put(`/channels/${channelId}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		// Same test account as the member-blocking test above -- no linked Solana wallet,
		// so it would fail-closed as 'unsatisfied' for anyone else. The owner sees it as
		// satisfied anyway, and the channel list never hides/blocks it for them.
		const channels = await createBuilder<Array<ChannelResponse>>(harness, owner.token)
			.get(`/guilds/${guild.id}/channels`)
			.execute();
		const gated = channels.find((c) => c.id === channelId);
		expect(gated?.token_gate_address).toBe(FAKE_GATE_ADDRESS);
		expect(gated?.token_gate_satisfied).toBe(true);

		await getChannel(harness, owner.token, channelId);
	});

	it('match_mode defaults to EXACT_ASSET (0) when omitted, and a channel with its own address inherits it independently of the parent category', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');
		const channelId = guild.system_channel_id!;

		await createBuilder(harness, owner.token)
			.put(`/channels/${channelId}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		const defaulted = await getChannel(harness, owner.token, channelId);
		expect(defaulted.token_gate_match_mode).toBe(0);

		await createBuilder(harness, owner.token)
			.put(`/channels/${channelId}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS, match_mode: 1})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		const explicitCollection = await getChannel(harness, owner.token, channelId);
		expect(explicitCollection.token_gate_match_mode).toBe(1);

		await createBuilder(harness, owner.token)
			.delete(`/channels/${channelId}/token-gate`)
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		const cleared = await getChannel(harness, owner.token, channelId);
		expect(cleared.token_gate_match_mode ?? null).toBeNull();
	});

	it('a category gate is inherited by a child channel with no gate of its own, and still blocks a non-owner member', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');

		const category = await createBuilder<ChannelResponse>(harness, owner.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'gated-category', type: 4})
			.execute();

		await createBuilder(harness, owner.token)
			.put(`/channels/${category.id}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		const child = await createBuilder<ChannelResponse>(harness, owner.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'child-channel', type: 0, parent_id: category.id})
			.execute();

		expect(child.token_gate_address ?? null).toBeNull();

		// Owner: inherited gate doesn't block them either.
		await getChannel(harness, owner.token, child.id);

		// Non-owner member: inheritance is genuinely enforced, not just present on paper.
		const invite = await createChannelInvite(harness, owner.token, guild.system_channel_id!);
		await acceptInvite(harness, member.token, invite.code);
		await createBuilder(harness, member.token)
			.get(`/channels/${child.id}`)
			.expect(HTTP_STATUS.FORBIDDEN, APIErrorCodes.TOKEN_GATE_REQUIREMENT_NOT_MET)
			.execute();
	});

	it('exposes the guild-wide token gate visibility setting via PATCH /guilds/:id', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');
		expect(guild.token_gate_visibility).toBe(0);

		const updated = await createBuilder<GuildResponse>(harness, owner.token)
			.patch(`/guilds/${guild.id}`)
			.body({token_gate_visibility: 1})
			.execute();

		expect(updated.token_gate_visibility).toBe(1);
	});

	it('rejects an invalid address when setting the guild-wide gate', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');

		await createBuilder(harness, owner.token)
			.patch(`/guilds/${guild.id}`)
			.body({token_gate_address: 'not-a-real-address'})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	it('a guild-wide gate is inherited by a channel with no gate of its own (and no gated parent category), and still blocks a non-owner member', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');
		const channelId = guild.system_channel_id!;

		const invite = await createChannelInvite(harness, owner.token, channelId);
		await acceptInvite(harness, member.token, invite.code);

		// Sanity check: accessible before the guild-wide gate is configured.
		await getChannel(harness, member.token, channelId);

		const gatedGuild = await createBuilder<GuildResponse>(harness, owner.token)
			.patch(`/guilds/${guild.id}`)
			.body({token_gate_address: FAKE_GATE_ADDRESS})
			.execute();
		expect(gatedGuild.token_gate_address).toBe(FAKE_GATE_ADDRESS);
		expect(gatedGuild.token_gate_match_mode).toBe(0);

		// Owner: the guild-wide gate doesn't block them either.
		await getChannel(harness, owner.token, channelId);

		// Non-owner member: the channel has no gate of its own, but inherits the guild's.
		await createBuilder(harness, member.token)
			.get(`/channels/${channelId}`)
			.expect(HTTP_STATUS.FORBIDDEN, APIErrorCodes.TOKEN_GATE_REQUIREMENT_NOT_MET)
			.execute();

		// A channel's own gate still takes priority over the guild-wide one.
		await createBuilder(harness, owner.token)
			.put(`/channels/${channelId}/token-gate`)
			.body({address: FAKE_GATE_ADDRESS, match_mode: 1})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();
		const ownGate = await getChannel(harness, owner.token, channelId);
		expect(ownGate.token_gate_match_mode).toBe(1);
		await createBuilder(harness, owner.token)
			.delete(`/channels/${channelId}/token-gate`)
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		// Clearing the guild-wide gate restores access.
		const clearedGuild = await createBuilder<GuildResponse>(harness, owner.token)
			.patch(`/guilds/${guild.id}`)
			.body({token_gate_address: null})
			.execute();
		expect(clearedGuild.token_gate_address ?? null).toBeNull();
		expect(clearedGuild.token_gate_match_mode ?? null).toBeNull();

		await getChannel(harness, member.token, channelId);
	});

	it('a channel under an ungated category still falls through to the guild-wide gate, not just top-level channels', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Token Gate Guild');

		await createBuilder(harness, owner.token)
			.patch(`/guilds/${guild.id}`)
			.body({token_gate_address: FAKE_GATE_ADDRESS})
			.expect(HTTP_STATUS.OK)
			.execute();

		const category = await createBuilder<ChannelResponse>(harness, owner.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'ungated-category', type: 4})
			.execute();
		expect(category.token_gate_address ?? null).toBeNull();

		const child = await createBuilder<ChannelResponse>(harness, owner.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'child-channel', type: 0, parent_id: category.id})
			.execute();

		const invite = await createChannelInvite(harness, owner.token, guild.system_channel_id!);
		await acceptInvite(harness, member.token, invite.code);

		// Neither the channel nor its category has a gate of its own -- the guild-wide gate
		// still has to apply here, not just to parentless top-level channels.
		await createBuilder(harness, member.token)
			.get(`/channels/${child.id}`)
			.expect(HTTP_STATUS.FORBIDDEN, APIErrorCodes.TOKEN_GATE_REQUIREMENT_NOT_MET)
			.execute();

		// Owner still bypasses, even through two inheritance tiers.
		await getChannel(harness, owner.token, child.id);
	});
});
