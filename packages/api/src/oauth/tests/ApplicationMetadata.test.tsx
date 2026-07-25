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
	createOAuth2Application,
	createUniqueApplicationName,
	updateOAuth2Application,
} from '@fluxer/api/src/oauth/tests/OAuth2TestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {beforeEach, describe, expect, test} from 'vitest';

describe('Application metadata', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	test('defaults to empty metadata when none is supplied', async () => {
		const account = await createTestAccount(harness);
		const result = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
		});

		expect(result.application.description).toBeNull();
		expect(result.application.icon).toBeNull();
		expect(result.application.tags).toEqual([]);
		expect(result.application.privacy_policy_url).toBeNull();
		expect(result.application.terms_of_service_url).toBeNull();
	});

	test('accepts metadata at creation and returns it', async () => {
		const account = await createTestAccount(harness);
		const result = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
			description: 'A bot that does a thing.',
			tags: ['utility', 'moderation'],
			privacy_policy_url: 'https://example.com/privacy',
			terms_of_service_url: 'https://example.com/terms',
		});

		expect(result.application.description).toBe('A bot that does a thing.');
		expect(result.application.tags.sort()).toEqual(['moderation', 'utility']);
		expect(result.application.privacy_policy_url).toBe('https://example.com/privacy');
		expect(result.application.terms_of_service_url).toBe('https://example.com/terms');
	});

	test('updates metadata and leaves omitted fields untouched', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
			description: 'Original description.',
			tags: ['games'],
		});

		const updated = await updateOAuth2Application(harness, account.token, created.application.id, {
			description: 'Replaced description.',
		});

		expect(updated.description).toBe('Replaced description.');
		// tags were not part of the update body, so they must survive it.
		expect(updated.tags).toEqual(['games']);
	});

	test('an explicit null clears a metadata field', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
			description: 'Will be cleared.',
			privacy_policy_url: 'https://example.com/privacy',
		});

		const updated = await updateOAuth2Application(harness, account.token, created.application.id, {
			description: null,
			privacy_policy_url: null,
		});

		expect(updated.description).toBeNull();
		expect(updated.privacy_policy_url).toBeNull();
	});

	test('rejects a tag outside the controlled vocabulary', async () => {
		const account = await createTestAccount(harness);

		await createBuilder(harness, account.token)
			.post('/oauth2/applications')
			.body({name: createUniqueApplicationName(), tags: ['definitely-not-a-real-tag']})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	test('rejects more tags than the maximum', async () => {
		const account = await createTestAccount(harness);

		await createBuilder(harness, account.token)
			.post('/oauth2/applications')
			.body({
				name: createUniqueApplicationName(),
				tags: ['ai', 'economy', 'fun', 'games', 'moderation', 'music'],
			})
			.expect(HTTP_STATUS.BAD_REQUEST)
			.execute();
	});

	test('exposes description on the unauthenticated public endpoint', async () => {
		const account = await createTestAccount(harness);
		const created = await createOAuth2Application(harness, account.token, {
			name: createUniqueApplicationName(),
			description: 'Publicly visible description.',
		});

		const publicApplication = await createBuilder<{description: string | null; icon: string | null}>(
			harness,
			account.token,
		)
			.get(`/oauth2/applications/${created.application.id}/public`)
			.expect(HTTP_STATUS.OK)
			.execute();

		// This field was declared in ApplicationPublicResponse but hardcoded to
		// null before application metadata existed.
		expect(publicApplication.description).toBe('Publicly visible description.');
	});
});
