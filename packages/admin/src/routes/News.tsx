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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {getErrorMessage} from '@fluxer/admin/src/api/Errors';
import {
	createNewsStory,
	deleteNewsStory,
	getNewsStory,
	publishNewsStory,
	unpublishNewsStory,
	updateNewsStory,
} from '@fluxer/admin/src/api/News';
import {redirectWithFlash} from '@fluxer/admin/src/middleware/Auth';
import {NewsDetailPage} from '@fluxer/admin/src/pages/NewsDetailPage';
import {NewsPage} from '@fluxer/admin/src/pages/NewsPage';
import {getRouteContext} from '@fluxer/admin/src/routes/RouteContext';
import type {RouteFactoryDeps} from '@fluxer/admin/src/routes/RouteTypes';
import type {AppVariables} from '@fluxer/admin/src/types/App';
import {getOptionalString, getRequiredString, type ParsedBody} from '@fluxer/admin/src/utils/Forms';
import {Hono} from 'hono';

export function createNewsRoutes({config, assetVersion, requireAuth}: RouteFactoryDeps) {
	const router = new Hono<{Variables: AppVariables}>();

	router.get('/news', requireAuth, async (c) => {
		const {session, currentAdmin, flash, csrfToken} = getRouteContext(c);

		const page = await NewsPage({config, session, currentAdmin, flash, assetVersion, csrfToken});
		return c.html(page ?? '');
	});

	router.post('/news', requireAuth, async (c) => {
		const session = c.get('session')!;
		const redirectUrl = `${config.basePath}/news`;

		try {
			const formData = (await c.req.parseBody()) as ParsedBody;
			const action = c.req.query('action');

			if (action === 'create') {
				const title = getRequiredString(formData, 'title');
				const body = getRequiredString(formData, 'body');
				if (!title || !body) {
					return redirectWithFlash(c, redirectUrl, {message: 'Title and body are required', type: 'error'});
				}
				const imageUrl = getOptionalString(formData, 'image_url')?.trim() || null;
				const imageData = getOptionalString(formData, 'image_data')?.trim() || null;

				const result = await createNewsStory(config, session, title, body, imageUrl, imageData);
				if (!result.ok) {
					return redirectWithFlash(c, redirectUrl, {message: getErrorMessage(result.error), type: 'error'});
				}
				return redirectWithFlash(c, `${redirectUrl}/${result.data.story_id}`, {
					message: 'News story created as a draft',
					type: 'success',
				});
			}

			return redirectWithFlash(c, redirectUrl, {message: 'Unknown action', type: 'error'});
		} catch {
			return redirectWithFlash(c, redirectUrl, {message: 'Invalid form data', type: 'error'});
		}
	});

	router.get('/news/:storyId', requireAuth, async (c) => {
		const {session, currentAdmin, flash, csrfToken} = getRouteContext(c);
		const storyId = c.req.param('storyId');

		const storyResult = await getNewsStory(config, session, storyId);
		if (!storyResult.ok) {
			return redirectWithFlash(c, `${config.basePath}/news`, {
				message: getErrorMessage(storyResult.error),
				type: 'error',
			});
		}

		return c.html(
			<NewsDetailPage
				config={config}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				story={storyResult.data}
				assetVersion={assetVersion}
				csrfToken={csrfToken}
			/>,
		);
	});

	router.post('/news/:storyId', requireAuth, async (c) => {
		const session = c.get('session')!;
		const storyId = c.req.param('storyId');
		const redirectUrl = `${config.basePath}/news/${storyId}`;

		try {
			const formData = (await c.req.parseBody()) as ParsedBody;
			const action = c.req.query('action');

			if (action === 'update') {
				const title = getRequiredString(formData, 'title');
				const body = getRequiredString(formData, 'body');
				if (!title || !body) {
					return redirectWithFlash(c, redirectUrl, {message: 'Title and body are required', type: 'error'});
				}
				const imageUrl = getOptionalString(formData, 'image_url')?.trim() || null;
				const imageData = getOptionalString(formData, 'image_data')?.trim() || null;
				const result = await updateNewsStory(config, session, storyId, title, body, imageUrl, imageData);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Story updated' : getErrorMessage(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'publish') {
				const result = await publishNewsStory(config, session, storyId);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Story published' : getErrorMessage(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'unpublish') {
				const result = await unpublishNewsStory(config, session, storyId);
				return redirectWithFlash(c, redirectUrl, {
					message: result.ok ? 'Story unpublished' : getErrorMessage(result.error),
					type: result.ok ? 'success' : 'error',
				});
			}

			if (action === 'delete') {
				const result = await deleteNewsStory(config, session, storyId);
				if (!result.ok) {
					return redirectWithFlash(c, redirectUrl, {message: getErrorMessage(result.error), type: 'error'});
				}
				return redirectWithFlash(c, `${config.basePath}/news`, {message: 'Story deleted', type: 'success'});
			}

			return redirectWithFlash(c, redirectUrl, {message: 'Unknown action', type: 'error'});
		} catch {
			return redirectWithFlash(c, redirectUrl, {message: 'Invalid form data', type: 'error'});
		}
	});

	return router;
}
