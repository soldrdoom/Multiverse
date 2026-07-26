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
import {hashBotTokenSecret, parseBotToken} from '@fluxer/api/src/oauth/BotTokenService';
import {createOAuth2Application, createUniqueApplicationName} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '@fluxer/api/src/test/TestRequestBuilder';
import {beforeEach, describe, expect, test} from 'vitest';

interface BotTokenBody {
	id: string;
	name: string;
	preview: string;
	last_used_at: string | null;
	token?: string;
}

async function mintToken(harness: ApiTestHarness, token: string, applicationId: string, name: string, password: string) {
	return createBuilder<BotTokenBody>(harness, token)
		.post(`/oauth2/applications/${applicationId}/bot/tokens`)
		.body({name, password})
		.expect(HTTP_STATUS.OK)
		.execute();
}

/**
 * Checks whether a bot token authenticates.
 *
 * Uses GET /applications/@me, not /oauth2/applications/@me — the latter applies
 * DefaultUserOnly and rejects bot tokens by design.
 */
async function botTokenAuthenticates(harness: ApiTestHarness, botToken: string): Promise<boolean> {
	const {response} = await createBuilderWithoutAuth(harness)
		.get('/applications/@me')
		.header('Authorization', `Bot ${botToken}`)
		.executeRaw();
	return response.status === HTTP_STATUS.OK;
}

describe('Bot token lifecycle', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('the token issued at application creation authenticates', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});

		expect(created.application.bot?.token).toBeTruthy();
		expect(await botTokenAuthenticates(harness, created.application.bot!.token!)).toBe(true);
	});

	test('issues three-part tokens naming their application and token id', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});

		const parsed = parseBotToken(created.application.bot!.token!);
		expect(parsed).not.toBeNull();
		expect(parsed!.applicationId.toString()).toBe(created.application.id);
		expect(parsed!.tokenId).not.toBeNull();
	});

	test('a second token works alongside the first', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});
		const first = created.application.bot!.token!;

		const second = await mintToken(harness, account.token, created.application.id, 'ci', account.password);

		expect(await botTokenAuthenticates(harness, first)).toBe(true);
		expect(await botTokenAuthenticates(harness, second.token!)).toBe(true);
	});

	test('revoking one token leaves the others working', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});
		const keep = created.application.bot!.token!;

		const disposable = await mintToken(harness, account.token, created.application.id, 'staging', account.password);
		expect(await botTokenAuthenticates(harness, disposable.token!)).toBe(true);

		await createBuilder(harness, account.token)
			.delete(`/oauth2/applications/${created.application.id}/bot/tokens/${disposable.id}`)
			.body({password: account.password})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();

		// This is the whole point of multi-token: revoking one must not be a
		// platform-wide outage for the bot.
		expect(await botTokenAuthenticates(harness, disposable.token!)).toBe(false);
		expect(await botTokenAuthenticates(harness, keep)).toBe(true);
	});

	test('lists token metadata without ever returning the secret', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});
		await mintToken(harness, account.token, created.application.id, 'prod-eu', account.password);

		const tokens = await createBuilder<Array<BotTokenBody>>(harness, account.token)
			.get(`/oauth2/applications/${created.application.id}/bot/tokens`)
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(tokens.length).toBe(2);
		for (const entry of tokens) {
			expect(entry.token).toBeUndefined();
			expect(entry.preview).toBeTruthy();
		}
		expect(tokens.some((entry) => entry.name === 'prod-eu')).toBe(true);
	});

	test('another user cannot list or mint tokens for an application they do not own', async () => {
		const owner = await createTestAccount(harness);
		const stranger = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, owner.token, {
			name: createUniqueApplicationName(),
		});

		await createBuilder(harness, stranger.token)
			.get(`/oauth2/applications/${created.application.id}/bot/tokens`)
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();

		await createBuilder(harness, stranger.token)
			.post(`/oauth2/applications/${created.application.id}/bot/tokens`)
			.body({name: 'stolen', password: stranger.password})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('minting requires sudo verification', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});

		await createBuilder(harness, account.token)
			.post(`/oauth2/applications/${created.application.id}/bot/tokens`)
			.body({name: 'no-sudo'})
			.expect(HTTP_STATUS.FORBIDDEN, 'SUDO_MODE_REQUIRED')
			.execute();

		// With the password supplied, the same request succeeds.
		const minted = await mintToken(harness, account.token, created.application.id, 'with-sudo', account.password);
		expect(minted.token).toBeTruthy();
	});

	test('revoking requires sudo verification', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});
		const disposable = await mintToken(harness, account.token, created.application.id, 'doomed', account.password);

		// No body at all — the shape a client's first attempt takes before its
		// sudo-retry flow kicks in.
		await createBuilder(harness, account.token)
			.delete(`/oauth2/applications/${created.application.id}/bot/tokens/${disposable.id}`)
			.expect(HTTP_STATUS.FORBIDDEN, 'SUDO_MODE_REQUIRED')
			.execute();
		expect(await botTokenAuthenticates(harness, disposable.token!)).toBe(true);

		await createBuilder(harness, account.token)
			.delete(`/oauth2/applications/${created.application.id}/bot/tokens/${disposable.id}`)
			.body({password: account.password})
			.expect(HTTP_STATUS.NO_CONTENT)
			.execute();
		expect(await botTokenAuthenticates(harness, disposable.token!)).toBe(false);
	});

	test('a garbage token does not authenticate', async () => {
		expect(await botTokenAuthenticates(harness, 'not-a-token')).toBe(false);
		expect(await botTokenAuthenticates(harness, '123.456.nope')).toBe(false);
	});

	test('secrets are stored only as their SHA-256, never in the clear', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});

		const parsed = parseBotToken(created.application.bot!.token!)!;
		const expected = hashBotTokenSecret(parsed.secret);

		// Same input must always produce the same lookup key, and it must not be
		// the secret itself.
		expect(hashBotTokenSecret(parsed.secret)).toBe(expected);
		expect(expected).not.toContain(parsed.secret);
		expect(expected).toMatch(/^[0-9a-f]{64}$/);
	});
});
