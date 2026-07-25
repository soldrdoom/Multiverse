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

import {createTestAccount, setUserACLs, type TestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '@fluxer/api/src/test/TestRequestBuilder';
import type {NewsStoryAdminResponse} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';
import type {ListPublishedNewsResponse} from '@fluxer/schema/src/domains/news/NewsSchemas';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

async function createAdminWithACLs(harness: ApiTestHarness, acls: Array<string>): Promise<TestAccount> {
	const admin = await createTestAccount(harness);
	return setUserACLs(harness, admin, ['admin:authenticate', ...acls]);
}

describe('News story lifecycle', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		await harness?.shutdown();
	});

	test('a draft story is not visible on the public endpoint until published', async () => {
		const admin = await createAdminWithACLs(harness, ['news:manage', 'news:view']);

		const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/create')
			.body({title: 'Draft Story', body: 'Not yet published'})
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(created.status).toBe('draft');

		const beforePublish = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
			.get('/news')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(beforePublish.stories.map((s) => s.story_id)).not.toContain(created.story_id);

		const published = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/publish')
			.body({story_id: created.story_id})
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(published.status).toBe('published');

		const afterPublish = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
			.get('/news')
			.expect(HTTP_STATUS.OK)
			.execute();
		const publishedIds = afterPublish.stories.map((s) => s.story_id);
		expect(publishedIds).toContain(created.story_id);

		const publicStory = afterPublish.stories.find((s) => s.story_id === created.story_id);
		expect(publicStory?.title).toBe('Draft Story');
	});

	test('unpublishing removes a story from the public endpoint', async () => {
		const admin = await createAdminWithACLs(harness, ['news:manage', 'news:view']);

		const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/create')
			.body({title: 'Unpublish Me', body: 'Body'})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/publish')
			.body({story_id: created.story_id})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/unpublish')
			.body({story_id: created.story_id})
			.expect(HTTP_STATUS.OK)
			.execute();

		const stories = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
			.get('/news')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(stories.stories.map((s) => s.story_id)).not.toContain(created.story_id);
	});

	test('deleting a published story removes it from the public endpoint', async () => {
		const admin = await createAdminWithACLs(harness, ['news:manage', 'news:view']);

		const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/create')
			.body({title: 'Delete Me', body: 'Body'})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/publish')
			.body({story_id: created.story_id})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, `Bearer ${admin.token}`)
			.post('/admin/news/delete')
			.body({story_id: created.story_id})
			.expect(HTTP_STATUS.OK)
			.execute();

		const stories = await createBuilderWithoutAuth<ListPublishedNewsResponse>(harness)
			.get('/news')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(stories.stories.map((s) => s.story_id)).not.toContain(created.story_id);

		await createBuilder(harness, `Bearer ${admin.token}`)
			.get(`/admin/news/${created.story_id}`)
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});

	test('editing a story updates title and body', async () => {
		const admin = await createAdminWithACLs(harness, ['news:manage', 'news:view']);

		const created = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/create')
			.body({title: 'Original Title', body: 'Original body'})
			.expect(HTTP_STATUS.OK)
			.execute();

		const updated = await createBuilder<NewsStoryAdminResponse>(harness, `Bearer ${admin.token}`)
			.post('/admin/news/update')
			.body({story_id: created.story_id, title: 'Updated Title', body: 'Updated body'})
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(updated.title).toBe('Updated Title');
		expect(updated.body).toBe('Updated body');
	});

	describe('ACL requirements', () => {
		test('requires NEWS_MANAGE to create a story', async () => {
			const admin = await createAdminWithACLs(harness, ['news:view']);

			await createBuilder(harness, `Bearer ${admin.token}`)
				.post('/admin/news/create')
				.body({title: 'Should Fail', body: 'Body'})
				.expect(HTTP_STATUS.FORBIDDEN)
				.execute();
		});

		test('requires NEWS_VIEW to list stories', async () => {
			const admin = await createAdminWithACLs(harness, ['user:lookup']);

			await createBuilder(harness, `Bearer ${admin.token}`)
				.post('/admin/news/list')
				.expect(HTTP_STATUS.FORBIDDEN)
				.execute();
		});

		test('the public news endpoint requires no authentication', async () => {
			await createBuilderWithoutAuth(harness).get('/news').expect(HTTP_STATUS.OK).execute();
		});
	});
});
