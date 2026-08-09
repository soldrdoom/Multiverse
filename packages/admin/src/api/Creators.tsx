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

import {ApiClient, type ApiResult} from '@fluxer/admin/src/api/Client';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import type {
	AdminCreatorApplicationEntry,
	AdminCreatorApplicationsResponse,
	AdminListingsResponse,
	CreatorListingEntry,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';

export type CreatorApplication = AdminCreatorApplicationEntry;
export type CreatorListing = CreatorListingEntry;

export async function listCreatorApplications(
	config: Config,
	session: Session,
): Promise<ApiResult<AdminCreatorApplicationsResponse>> {
	const client = new ApiClient(config, session);
	return client.get<AdminCreatorApplicationsResponse>('/admin/creator-applications');
}

export async function approveCreatorApplication(
	config: Config,
	session: Session,
	solanaAddress: string,
): Promise<ApiResult<{ok: boolean; creator_id: number}>> {
	const client = new ApiClient(config, session);
	return client.post<{ok: boolean; creator_id: number}>(
		`/admin/creator-applications/${encodeURIComponent(solanaAddress)}/approve`,
	);
}

export async function rejectCreatorApplication(
	config: Config,
	session: Session,
	solanaAddress: string,
): Promise<ApiResult<{ok: boolean}>> {
	const client = new ApiClient(config, session);
	return client.post<{ok: boolean}>(`/admin/creator-applications/${encodeURIComponent(solanaAddress)}/reject`);
}

export async function listCreatorListings(config: Config, session: Session): Promise<ApiResult<AdminListingsResponse>> {
	const client = new ApiClient(config, session);
	return client.get<AdminListingsResponse>('/admin/creator-listings');
}

export async function approveCreatorListing(
	config: Config,
	session: Session,
	listingId: string,
): Promise<ApiResult<{ok: boolean}>> {
	const client = new ApiClient(config, session);
	return client.post<{ok: boolean}>(`/admin/creator-listings/${encodeURIComponent(listingId)}/approve`);
}

export async function rejectCreatorListing(
	config: Config,
	session: Session,
	listingId: string,
): Promise<ApiResult<{ok: boolean}>> {
	const client = new ApiClient(config, session);
	return client.post<{ok: boolean}>(`/admin/creator-listings/${encodeURIComponent(listingId)}/reject`);
}
