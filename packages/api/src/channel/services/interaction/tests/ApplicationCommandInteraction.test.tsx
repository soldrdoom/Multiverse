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
import type {UserID} from '@fluxer/api/src/BrandedTypes';
import {
	createChannel,
	createGuild,
	createPermissionOverwrite,
	setupTestGuildWithMembers,
} from '@fluxer/api/src/channel/tests/ChannelTestUtils';
import type {GatewayDispatchEvent} from '@fluxer/api/src/constants/Gateway';
import {getGatewayService} from '@fluxer/api/src/middleware/ServiceRegistry';
import {createOAuth2Application, createUniqueApplicationName} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {InteractionResponse} from '@fluxer/schema/src/domains/channel/InteractionSchemas';
import {beforeEach, describe, expect, test} from 'vitest';

interface RecordedDispatch {
	userId: string;
	event: GatewayDispatchEvent;
	data: unknown;
}

/**
 * Patches dispatchPresence directly on the ApiTestHarness's already-injected
 * gateway service instance, rather than constructing a fresh
 * NoopGatewayService (or a subclass of it): NoopGatewayService's constructor
 * clears its module-scoped guildOwners/guildMembers maps as a side effect, so
 * swapping in a brand-new instance mid-test would silently un-member the bot
 * and guild owner that earlier setup calls (createGuild, the
 * /oauth2/authorize/consent bot-add) already registered there. Patching the
 * live instance in place keeps all of that state intact and only observes
 * the one call this suite cares about.
 */
function recordPresenceDispatches(): Array<RecordedDispatch> {
	const dispatches: Array<RecordedDispatch> = [];
	const gateway = getGatewayService();
	gateway.dispatchPresence = async (params: {userId: UserID; event: GatewayDispatchEvent; data: unknown}) => {
		dispatches.push({userId: params.userId.toString(), event: params.event, data: params.data});
	};
	return dispatches;
}

async function registerCommands(harness: ApiTestHarness, botToken: string, commands: Array<Record<string, unknown>>) {
	await createBuilder(harness, `Bot ${botToken}`)
		.put('/applications/@me/commands')
		.body({commands})
		.expect(HTTP_STATUS.OK)
		.execute();
}

async function addBotToGuild(harness: ApiTestHarness, ownerToken: string, applicationId: string, guildId: string) {
	await createBuilder(harness, ownerToken)
		.post('/oauth2/authorize/consent')
		.body({
			client_id: applicationId,
			scope: 'bot',
			guild_id: guildId,
			permissions: Permissions.SEND_MESSAGES.toString(),
		})
		.expect(HTTP_STATUS.OK)
		.execute();
}

describe('Application command interactions', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('invoking an unknown command fails', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await createBuilder(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'does-not-exist', options: {}})
			.expect(HTTP_STATUS.NOT_FOUND, 'UNKNOWN_APPLICATION_COMMAND')
			.execute();
	});

	test('invoking with a missing required option fails', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await registerCommands(harness, app.botToken, [
			{
				name: 'greet',
				description: 'Say hello to someone',
				options: [{name: 'name', description: 'Who to greet', type: 'STRING', required: true}],
			},
		]);

		await createBuilder(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'greet', options: {}})
			.expect(HTTP_STATUS.BAD_REQUEST, 'INVALID_INTERACTION_OPTION')
			.execute();
	});

	test('rejects invocation when the bot is not present in the channel', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		// Deliberately not added to the guild.

		await registerCommands(harness, app.botToken, [{name: 'sol', description: 'Get the SOL price', options: []}]);

		await createBuilder(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'sol', options: {}})
			.expect(HTTP_STATUS.FORBIDDEN, 'BOT_NOT_IN_CHANNEL')
			.execute();
	});

	test('a valid invocation dispatches INTERACTION_CREATE to the bot, point-to-point', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await registerCommands(harness, app.botToken, [
			{
				name: 'mass',
				description: 'Bulk delete messages',
				options: [{name: 'count', description: 'How many messages', type: 'INTEGER', required: false}],
			},
		]);

		// Patched only now, after all setup traffic (account/session creation,
		// application creation, the guild-add consent flow) has already
		// happened — those legitimately dispatch their own presence/guild
		// events, and this test only cares about what the interaction itself
		// triggers.
		const presenceDispatches = recordPresenceDispatches();

		const response = await createBuilder<InteractionResponse>(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'mass', options: {count: 10}})
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response.command.name).toBe('mass');
		expect(response.options).toEqual({count: 10});
		expect(response.channel_id).toBe(guild.system_channel_id);
		expect(response.guild_id).toBe(guild.id);
		expect(response.application_id).toBe(app.application.id);
		expect(response.user.id).toBe(account.userId);

		expect(presenceDispatches.length).toBe(1);
		const dispatch = presenceDispatches[0]!;
		expect(dispatch.userId).toBe(app.botUserId);
		expect(dispatch.event).toBe('INTERACTION_CREATE');
		expect((dispatch.data as InteractionResponse).options).toEqual({count: 10});
		expect((dispatch.data as InteractionResponse).command.name).toBe('mass');
	});

	test('an option value outside the declared type is rejected', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await registerCommands(harness, app.botToken, [
			{
				name: 'mass',
				description: 'Bulk delete messages',
				options: [{name: 'count', description: 'How many messages', type: 'INTEGER', required: false}],
			},
		]);

		await createBuilder(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'mass', options: {count: 'not-a-number'}})
			.expect(HTTP_STATUS.BAD_REQUEST, 'INVALID_INTERACTION_OPTION')
			.execute();
	});

	test('a command with no options can be invoked with an empty options map', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await registerCommands(harness, app.botToken, [{name: 'sol', description: 'Get the SOL price', options: []}]);

		const presenceDispatches = recordPresenceDispatches();

		const response = await createBuilder<InteractionResponse>(harness, account.token)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'sol'})
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(response.options).toEqual({});
		expect(presenceDispatches.length).toBe(1);
	});

	test('DefaultUserOnly blocks bot-to-bot invocation', async () => {
		const account = await createTestAccount(harness);
		const app = await createOAuth2Application(harness, account.token, {name: createUniqueApplicationName()});
		const guild = await createGuild(harness, account.token, 'Interaction Test Guild');
		await addBotToGuild(harness, account.token, app.application.id, guild.id);

		await registerCommands(harness, app.botToken, [{name: 'sol', description: 'Get the SOL price', options: []}]);

		await createBuilder(harness, `Bot ${app.botToken}`)
			.post(`/channels/${guild.system_channel_id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'sol', options: {}})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('a CHANNEL option value pointing at a channel the invoker cannot view is rejected', async () => {
		const {owner, members, guild, systemChannel} = await setupTestGuildWithMembers(harness, 1);
		const member = members[0]!;

		const app = await createOAuth2Application(harness, owner.token, {name: createUniqueApplicationName()});
		await addBotToGuild(harness, owner.token, app.application.id, guild.id);

		// A second channel in the same guild, visible to the member by default...
		const hiddenChannel = await createChannel(harness, owner.token, guild.id, 'staff-only');
		// ...until a per-member overwrite denies them VIEW_CHANNEL on it.
		await createPermissionOverwrite(harness, owner.token, hiddenChannel.id, member.userId, {
			type: 1,
			allow: '0',
			deny: Permissions.VIEW_CHANNEL.toString(),
		});

		await registerCommands(harness, app.botToken, [
			{
				name: 'peek',
				description: 'Look at a channel',
				options: [{name: 'target', description: 'Which channel', type: 'CHANNEL', required: true}],
			},
		]);

		// Invoked from the (visible) system channel, but the option value names
		// the hidden channel the member has no VIEW_CHANNEL access to. This must
		// not be accepted and dispatched to the bot -- doing so would let any
		// guild member use CHANNEL options as an oracle for the existence of
		// channels they can't otherwise see.
		await createBuilder(harness, member.token)
			.post(`/channels/${systemChannel.id}/interactions`)
			.body({bot_user_id: app.botUserId, command_name: 'peek', options: {target: hiddenChannel.id}})
			.expect(HTTP_STATUS.BAD_REQUEST, 'INVALID_INTERACTION_OPTION')
			.execute();
	});
});
