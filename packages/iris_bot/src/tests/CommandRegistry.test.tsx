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

import type {InteractionResponse} from '@fluxer/bot_sdk/src/types/Api.generated';
import type {Logger} from 'pino';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CommandRegistry} from '../CommandRegistry';
import type {MessageSender} from '../MessageHandler';
import {MASS_DELETE_MAX, type ModerationProvider} from '../ModerationService';
import type {PriceProvider} from '../SolPriceService';

const API_BASE_URL = 'https://multiverse.forum/api';

function makeInteraction(overrides: Partial<InteractionResponse> = {}): InteractionResponse {
	return {
		id: '100',
		application_id: 'app-1',
		channel_id: 'channel-1',
		guild_id: 'guild-1',
		command: {name: 'sol'},
		options: {},
		user: {
			id: 'user-1',
			username: 'tester',
			discriminator: '0001',
			global_name: null,
			avatar: null,
			avatar_color: null,
			flags: 0,
		},
		...overrides,
	};
}

function makeLogger(): Logger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	} as unknown as Logger;
}

describe('CommandRegistry.handleInteraction', () => {
	let sendMessage: ReturnType<typeof vi.fn<MessageSender['sendMessage']>>;
	let restClient: MessageSender;
	let getSolPrice: ReturnType<typeof vi.fn<PriceProvider['getSolPrice']>>;
	let priceProvider: PriceProvider;
	let isGuildAdministrator: ReturnType<typeof vi.fn<ModerationProvider['isGuildAdministrator']>>;
	let massDeleteMessages: ReturnType<typeof vi.fn<ModerationProvider['massDeleteMessages']>>;
	let moderationProvider: ModerationProvider;
	let log: Logger;
	let registry: CommandRegistry;

	beforeEach(() => {
		sendMessage = vi.fn().mockResolvedValue(undefined);
		restClient = {sendMessage};

		getSolPrice = vi.fn();
		priceProvider = {getSolPrice};

		isGuildAdministrator = vi.fn();
		massDeleteMessages = vi.fn();
		moderationProvider = {isGuildAdministrator, massDeleteMessages};

		log = makeLogger();
		registry = new CommandRegistry(API_BASE_URL, restClient, log, priceProvider, moderationProvider);
	});

	async function invoke(data: InteractionResponse): Promise<void> {
		registry.handleInteraction(data);
		await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
	}

	it('/sol replies with the price on success', async () => {
		getSolPrice.mockResolvedValue({usd: 150.5, change24h: 2.34});

		await invoke(makeInteraction({command: {name: 'sol'}}));

		expect(sendMessage).toHaveBeenCalledWith(API_BASE_URL, 'channel-1', expect.stringContaining('$150.50'));
		expect(sendMessage).toHaveBeenCalledWith(API_BASE_URL, 'channel-1', expect.stringContaining('▲ 2.34%'));
	});

	it('/sol replies with an error message when the price fetch fails', async () => {
		getSolPrice.mockRejectedValue(new Error('upstream down'));

		await invoke(makeInteraction({command: {name: 'sol'}}));

		expect(sendMessage).toHaveBeenCalledWith(
			API_BASE_URL,
			'channel-1',
			expect.stringContaining("Couldn't fetch the SOL price"),
		);
	});

	it('/mass with no count option replies with the usage message', async () => {
		await invoke(makeInteraction({command: {name: 'mass'}, options: {}}));

		expect(sendMessage).toHaveBeenCalledWith(API_BASE_URL, 'channel-1', expect.stringContaining('Usage: /mass'));
		expect(isGuildAdministrator).not.toHaveBeenCalled();
	});

	it('/mass with an out-of-bounds count replies with the usage message', async () => {
		await invoke(makeInteraction({command: {name: 'mass'}, options: {count: MASS_DELETE_MAX + 1}}));

		expect(sendMessage).toHaveBeenCalledWith(API_BASE_URL, 'channel-1', expect.stringContaining('Usage: /mass'));
		expect(isGuildAdministrator).not.toHaveBeenCalled();
	});

	it('/mass invoked by a non-admin replies with the forbidden message', async () => {
		isGuildAdministrator.mockResolvedValue(false);

		await invoke(makeInteraction({command: {name: 'mass'}, options: {count: 10}}));

		expect(isGuildAdministrator).toHaveBeenCalledWith('guild-1', 'user-1');
		expect(sendMessage).toHaveBeenCalledWith(
			API_BASE_URL,
			'channel-1',
			expect.stringContaining('Only server administrators'),
		);
		expect(massDeleteMessages).not.toHaveBeenCalled();
	});

	it('/mass invoked by an admin with a valid count deletes messages and confirms', async () => {
		isGuildAdministrator.mockResolvedValue(true);
		massDeleteMessages.mockResolvedValue(11);

		await invoke(makeInteraction({command: {name: 'mass'}, options: {count: 10}}));

		expect(massDeleteMessages).toHaveBeenCalledWith({channelId: 'channel-1', commandMessageId: '100', count: 10});
		expect(sendMessage).toHaveBeenCalledWith(
			API_BASE_URL,
			'channel-1',
			expect.stringContaining('Deleted up to 11 message(s)'),
		);
	});

	it('/mass replies with a permission-check error when the admin check throws', async () => {
		isGuildAdministrator.mockRejectedValue(new Error('guild lookup failed'));

		await invoke(makeInteraction({command: {name: 'mass'}, options: {count: 10}}));

		expect(sendMessage).toHaveBeenCalledWith(
			API_BASE_URL,
			'channel-1',
			expect.stringContaining("Couldn't verify your permissions"),
		);
		expect(massDeleteMessages).not.toHaveBeenCalled();
	});
});
