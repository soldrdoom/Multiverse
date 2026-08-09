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

import {hasPermission} from '@fluxer/admin/src/AccessControlList';
import type {CreatorListing} from '@fluxer/admin/src/api/Creators';
import {Layout} from '@fluxer/admin/src/components/Layout';
import {Badge} from '@fluxer/admin/src/components/ui/Badge';
import {PageLayout} from '@fluxer/admin/src/components/ui/Layout/PageLayout';
import {VStack} from '@fluxer/admin/src/components/ui/Layout/VStack';
import {Table} from '@fluxer/admin/src/components/ui/Table';
import {TableBody} from '@fluxer/admin/src/components/ui/TableBody';
import {TableCell} from '@fluxer/admin/src/components/ui/TableCell';
import {TableContainer} from '@fluxer/admin/src/components/ui/TableContainer';
import {TableHeader} from '@fluxer/admin/src/components/ui/TableHeader';
import {TableHeaderCell} from '@fluxer/admin/src/components/ui/TableHeaderCell';
import {TableRow} from '@fluxer/admin/src/components/ui/TableRow';
import {Heading, Text} from '@fluxer/admin/src/components/ui/Typography';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import type {Flash} from '@fluxer/hono/src/Flash';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import type {CosmeticListingStatus} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Button} from '@fluxer/ui/src/components/Button';
import {Card} from '@fluxer/ui/src/components/Card';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import type {FC} from 'hono/jsx';

const LAMPORTS_PER_SOL = 1_000_000_000;

const LISTING_STATUSES: Array<CosmeticListingStatus> = ['pending_review', 'live', 'rejected', 'draft', 'delisted'];

interface StatusTabProps {
	currentStatus: CosmeticListingStatus;
	basePath: string;
}

function formatStatusLabel(status: string): string {
	return status
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function StatusTabs({currentStatus, basePath}: StatusTabProps) {
	return (
		<div class="flex flex-wrap gap-2">
			{LISTING_STATUSES.map((status) => {
				const isActive = currentStatus === status;
				const classes = isActive
					? 'px-4 py-2 rounded-md text-sm font-semibold bg-[image:var(--gradient-brand)] text-[var(--button-primary-text)]'
					: 'px-4 py-2 rounded-md text-sm font-medium bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-200';
				return (
					<a key={status} href={`${basePath}/creator-listings?status=${status}`} class={classes}>
						{formatStatusLabel(status)}
					</a>
				);
			})}
		</div>
	);
}

function getStatusBadgeVariant(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
	switch (status) {
		case 'pending_review':
			return 'warning';
		case 'live':
			return 'success';
		case 'rejected':
		case 'delisted':
			return 'danger';
		default:
			return 'neutral';
	}
}

function formatDate(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatSol(lamports: number): string {
	return `◎ ${(lamports / LAMPORTS_PER_SOL).toFixed(2)}`;
}

export interface CreatorListingsPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	adminAcls: Array<string>;
	assetVersion: string;
	csrfToken: string;
	listings: Array<CreatorListing>;
	currentStatus: CosmeticListingStatus;
}

export const CreatorListingsPage: FC<CreatorListingsPageProps> = ({
	config,
	session,
	currentAdmin,
	flash,
	adminAcls,
	assetVersion,
	csrfToken,
	listings,
	currentStatus,
}) => {
	const hasReviewPermission = hasPermission(adminAcls, AdminACLs.CREATOR_LISTING_REVIEW);
	const hasViewPermission = hasReviewPermission || hasPermission(adminAcls, AdminACLs.CREATOR_LISTING_VIEW);
	const canTakeAction = currentStatus === 'pending_review' && hasReviewPermission;

	const filtered = listings.filter((listing) => listing.status === currentStatus);

	return (
		<Layout
			csrfToken={csrfToken}
			title="Creator Listings"
			activePage="creator-listings"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			{hasViewPermission ? (
				<PageLayout maxWidth="7xl">
					<VStack gap={6}>
						<Card padding="md">
							<VStack gap={4}>
								<Heading level={1} size="2xl">
									Creator Listings
								</Heading>
								<Text size="sm" color="muted">
									Review cosmetic listings submitted by approved creators. Approving makes a listing live in the shop;
									rejecting keeps it out of the shop and notifies the creator.
								</Text>
								<StatusTabs currentStatus={currentStatus} basePath={config.basePath} />
							</VStack>
						</Card>

						<Card padding="md">
							<VStack gap={4}>
								<Heading level={2} size="xl">
									{formatStatusLabel(currentStatus)} Listings ({filtered.length})
								</Heading>

								{filtered.length === 0 ? (
									<Text color="muted">No {formatStatusLabel(currentStatus).toLowerCase()} listings found.</Text>
								) : (
									<TableContainer>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHeaderCell>Listing</TableHeaderCell>
													<TableHeaderCell>Creator</TableHeaderCell>
													<TableHeaderCell>Type</TableHeaderCell>
													<TableHeaderCell>Rarity</TableHeaderCell>
													<TableHeaderCell>Price</TableHeaderCell>
													<TableHeaderCell>Status</TableHeaderCell>
													<TableHeaderCell>Created</TableHeaderCell>
													{canTakeAction && <TableHeaderCell>Actions</TableHeaderCell>}
												</TableRow>
											</TableHeader>
											<TableBody>
												{filtered.map((listing) => (
													<TableRow key={listing.id}>
														<TableCell>
															<div class="flex items-center gap-3">
																{listing.image_url != null ? (
																	<img src={listing.image_url} alt="" class="h-8 w-8 rounded-md object-cover" />
																) : (
																	<div class="h-8 w-8 rounded-md bg-neutral-200" />
																)}
																<div class="flex flex-col">
																	<span class="font-medium text-neutral-900 text-sm">{listing.name}</span>
																	{listing.description != null && (
																		<span
																			class="block max-w-xs truncate text-neutral-500 text-xs"
																			title={listing.description}
																		>
																			{listing.description}
																		</span>
																	)}
																</div>
															</div>
														</TableCell>
														<TableCell>
															<span class="text-sm">Creator #{listing.creator_id}</span>
														</TableCell>
														<TableCell>{listing.cosmetic_type}</TableCell>
														<TableCell>{listing.rarity}</TableCell>
														<TableCell>{formatSol(listing.price_lamports)}</TableCell>
														<TableCell>
															<Badge variant={getStatusBadgeVariant(listing.status)} size="sm">
																{formatStatusLabel(listing.status)}
															</Badge>
														</TableCell>
														<TableCell>{formatDate(listing.created_at)}</TableCell>
														{canTakeAction && (
															<TableCell>
																<div class="flex gap-2">
																	<form
																		method="post"
																		action={`${config.basePath}/creator-listings/${encodeURIComponent(listing.id)}/approve`}
																		class="inline"
																	>
																		<CsrfInput token={csrfToken} />
																		<Button type="submit" variant="primary" size="small">
																			Approve
																		</Button>
																	</form>
																	<form
																		method="post"
																		action={`${config.basePath}/creator-listings/${encodeURIComponent(listing.id)}/reject`}
																		class="inline"
																	>
																		<CsrfInput token={csrfToken} />
																		<Button type="submit" variant="danger" size="small">
																			Reject
																		</Button>
																	</form>
																</div>
															</TableCell>
														)}
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
								)}
							</VStack>
						</Card>
					</VStack>
				</PageLayout>
			) : (
				<Card padding="md">
					<Heading level={1} size="2xl">
						Creator Listings
					</Heading>
					<Text color="muted" size="sm" class="mt-2">
						You do not have permission to view creator listings.
					</Text>
				</Card>
			)}
		</Layout>
	);
};
