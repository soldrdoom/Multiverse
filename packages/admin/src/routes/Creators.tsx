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

import {
	approveCreatorApplication,
	approveCreatorListing,
	listCreatorApplications,
	listCreatorListings,
	rejectCreatorApplication,
	rejectCreatorListing,
} from '@fluxer/admin/src/api/Creators';
import {redirectWithFlash} from '@fluxer/admin/src/middleware/Auth';
import {CreatorApplicationsPage} from '@fluxer/admin/src/pages/CreatorApplicationsPage';
import {CreatorListingsPage} from '@fluxer/admin/src/pages/CreatorListingsPage';
import {getRouteContext} from '@fluxer/admin/src/routes/RouteContext';
import type {RouteFactoryDeps} from '@fluxer/admin/src/routes/RouteTypes';
import type {AppVariables} from '@fluxer/admin/src/types/App';
import type {CosmeticListingStatus} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Hono} from 'hono';

const VALID_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_LISTING_STATUSES: Array<CosmeticListingStatus> = [
	'draft',
	'pending_review',
	'live',
	'rejected',
	'delisted',
];

export function createCreatorsRoutes({config, assetVersion, requireAuth}: RouteFactoryDeps) {
	const router = new Hono<{Variables: AppVariables}>();

	router.get('/creator-applications', requireAuth, async (c) => {
		const {session, currentAdmin, flash, adminAcls, csrfToken} = getRouteContext(c);
		const statusParam = c.req.query('status') ?? 'pending';
		const currentStatus = VALID_APPLICATION_STATUSES.includes(statusParam) ? statusParam : 'pending';

		const result = await listCreatorApplications(config, session);
		if (!result.ok) {
			return redirectWithFlash(c, `${config.basePath}/dashboard`, {
				message: 'Failed to load creator applications',
				type: 'error',
			});
		}

		return c.html(
			<CreatorApplicationsPage
				config={config}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				assetVersion={assetVersion}
				adminAcls={adminAcls}
				csrfToken={csrfToken}
				applications={result.data.applications}
				currentStatus={currentStatus}
			/>,
		);
	});

	router.post('/creator-applications/:address/approve', requireAuth, async (c) => {
		const {session} = getRouteContext(c);
		const address = c.req.param('address');
		const redirectUrl = `${config.basePath}/creator-applications?status=pending`;

		const result = await approveCreatorApplication(config, session, address);
		if (result.ok) {
			return redirectWithFlash(c, redirectUrl, {
				message: `Successfully approved creator application for ${address}`,
				type: 'success',
			});
		}
		return redirectWithFlash(c, redirectUrl, {message: 'Failed to approve creator application', type: 'error'});
	});

	router.post('/creator-applications/:address/reject', requireAuth, async (c) => {
		const {session} = getRouteContext(c);
		const address = c.req.param('address');
		const redirectUrl = `${config.basePath}/creator-applications?status=pending`;

		const result = await rejectCreatorApplication(config, session, address);
		if (result.ok) {
			return redirectWithFlash(c, redirectUrl, {
				message: `Successfully rejected creator application for ${address}`,
				type: 'success',
			});
		}
		return redirectWithFlash(c, redirectUrl, {message: 'Failed to reject creator application', type: 'error'});
	});

	router.get('/creator-listings', requireAuth, async (c) => {
		const {session, currentAdmin, flash, adminAcls, csrfToken} = getRouteContext(c);
		const statusParam = c.req.query('status') ?? 'pending_review';
		const currentStatus = (
			VALID_LISTING_STATUSES.includes(statusParam as CosmeticListingStatus) ? statusParam : 'pending_review'
		) as CosmeticListingStatus;

		const result = await listCreatorListings(config, session);
		if (!result.ok) {
			return redirectWithFlash(c, `${config.basePath}/dashboard`, {
				message: 'Failed to load creator listings',
				type: 'error',
			});
		}

		return c.html(
			<CreatorListingsPage
				config={config}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				assetVersion={assetVersion}
				adminAcls={adminAcls}
				csrfToken={csrfToken}
				listings={result.data.listings}
				currentStatus={currentStatus}
			/>,
		);
	});

	router.post('/creator-listings/:id/approve', requireAuth, async (c) => {
		const {session} = getRouteContext(c);
		const id = c.req.param('id');
		const redirectUrl = `${config.basePath}/creator-listings?status=pending_review`;

		const result = await approveCreatorListing(config, session, id);
		if (result.ok) {
			return redirectWithFlash(c, redirectUrl, {message: `Successfully approved listing ${id}`, type: 'success'});
		}
		return redirectWithFlash(c, redirectUrl, {message: 'Failed to approve listing', type: 'error'});
	});

	router.post('/creator-listings/:id/reject', requireAuth, async (c) => {
		const {session} = getRouteContext(c);
		const id = c.req.param('id');
		const redirectUrl = `${config.basePath}/creator-listings?status=pending_review`;

		const result = await rejectCreatorListing(config, session, id);
		if (result.ok) {
			return redirectWithFlash(c, redirectUrl, {message: `Successfully rejected listing ${id}`, type: 'success'});
		}
		return redirectWithFlash(c, redirectUrl, {message: 'Failed to reject listing', type: 'error'});
	});

	return router;
}
