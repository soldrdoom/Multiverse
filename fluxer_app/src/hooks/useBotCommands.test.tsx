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

import {useBotCommands} from '@app/hooks/useBotCommands';
import http from '@app/lib/HttpClient';
import {ChannelRecord} from '@app/records/ChannelRecord';
import GuildMemberStore from '@app/stores/GuildMemberStore';
import {observer} from 'mobx-react-lite';
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const GUILD_ID = '900000000000000001';
const CHANNEL_ID = '900000000000000002';
const BOT_USER_ID = '900000000000000003';

const guildChannel = new ChannelRecord({
	id: CHANNEL_ID,
	guild_id: GUILD_ID,
	type: 0, // GUILD_TEXT
	name: 'general',
});

const botMemberData = {
	user: {
		id: BOT_USER_ID,
		username: 'TestBot',
		discriminator: '0001',
		bot: true,
	},
	roles: [],
	joined_at: new Date().toISOString(),
};

let container: HTMLDivElement;
let root: Root;
let latestCommandNames: Array<string> = [];

function TestHarness({channel}: {channel: ChannelRecord | null}) {
	const commands = useBotCommands(channel);
	latestCommandNames = commands.map((c) => c.name);
	return null;
}
const ObservedTestHarness = observer(TestHarness);

async function flush(): Promise<void> {
	// Let pending microtasks (the store's async ensureFetched) settle.
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

describe('useBotCommands', () => {
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		latestCommandNames = [];
		vi.mocked(http.get).mockResolvedValue({
			ok: true,
			status: 200,
			headers: {},
			body: [
				{id: '1', name: 'sol', description: 'Get the current SOL price', options: [], application_id: BOT_USER_ID},
			],
		} as never);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		GuildMemberStore.handleMemberRemove(GUILD_ID, BOT_USER_ID);
	});

	test('picks up a guild bot member that finishes loading after the initial render, without an unrelated re-render', async () => {
		// Regression test for the 2026-08-07 "IRIS's commands don't work" incident:
		// getCandidateBotUserIds used to be wrapped in useMemo(..., [channel]),
		// which only re-evaluated GuildMemberStore when the `channel` object
		// itself changed identity. Guild member data loads asynchronously
		// *after* the channel is already mounted, so on a freshly opened
		// channel the memo would freeze at `botUserIds = []` forever — bot
		// commands never appeared in the picker and never fired, because
		// nothing forced a fresh evaluation. This test mounts the hook before
		// the bot is a known guild member (matching real load order), adds the
		// member afterward via the same store method the gateway member-add
		// handler uses, and asserts the hook picks it up on its own — with NO
		// unrelated state change (no re-typing, no channel replacement) in
		// between, which is exactly the condition that was broken.
		await act(async () => {
			root.render(React.createElement(ObservedTestHarness, {channel: guildChannel}));
		});
		await flush();

		expect(latestCommandNames).toEqual([]);

		act(() => {
			GuildMemberStore.handleMemberAdd(GUILD_ID, botMemberData as never);
		});
		await flush();

		expect(latestCommandNames).toEqual(['/sol']);
		expect(http.get).toHaveBeenCalledWith(expect.stringContaining(BOT_USER_ID));
	});
});
