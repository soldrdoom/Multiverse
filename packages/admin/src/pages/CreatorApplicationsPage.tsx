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
import type {CreatorApplication} from '@fluxer/admin/src/api/Creators';
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
import {Button} from '@fluxer/ui/src/components/Button';
import {Card} from '@fluxer/ui/src/components/Card';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import type {FC} from 'hono/jsx';

const APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

interface StatusTabProps {
	currentStatus: string;
	basePath: string;
}

function StatusTabs({currentStatus, basePath}: StatusTabProps) {
	return (
		<div class="flex gap-2">
			{APPLICATION_STATUSES.map((status) => {
				const isActive = currentStatus === status;
				const classes = isActive
					? 'px-4 py-2 rounded-md text-sm font-semibold bg-[image:var(--gradient-brand)] text-[var(--button-primary-text)]'
					: 'px-4 py-2 rounded-md text-sm font-medium bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-200';
				return (
					<a key={status} href={`${basePath}/creator-applications?status=${status}`} class={classes}>
						{status.charAt(0).toUpperCase() + status.slice(1)}
					</a>
				);
			})}
		</div>
	);
}

function getStatusBadgeVariant(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
	switch (status) {
		case 'pending':
			return 'warning';
		case 'approved':
			return 'success';
		case 'rejected':
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

export interface CreatorApplicationsPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	adminAcls: Array<string>;
	assetVersion: string;
	csrfToken: string;
	applications: Array<CreatorApplication>;
	currentStatus: string;
}

export const CreatorApplicationsPage: FC<CreatorApplicationsPageProps> = ({
	config,
	session,
	currentAdmin,
	flash,
	adminAcls,
	assetVersion,
	csrfToken,
	applications,
	currentStatus,
}) => {
	const hasReviewPermission = hasPermission(adminAcls, AdminACLs.CREATOR_APPLICATION_REVIEW);
	const hasViewPermission = hasReviewPermission || hasPermission(adminAcls, AdminACLs.CREATOR_APPLICATION_VIEW);
	const canTakeAction = currentStatus === 'pending' && hasReviewPermission;

	const filtered = applications.filter((app) => app.status === currentStatus);

	return (
		<Layout
			csrfToken={csrfToken}
			title="Creator Applications"
			activePage="creator-applications"
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
									Creator Applications
								</Heading>
								<Text size="sm" color="muted">
									Review applications from users requesting creator (cosmetic seller) status. Approving grants a creator
									record tied to their linked Solana wallet; rejecting lets the applicant re-apply later.
								</Text>
								<StatusTabs currentStatus={currentStatus} basePath={config.basePath} />
							</VStack>
						</Card>

						<Card padding="md">
							<VStack gap={4}>
								<Heading level={2} size="xl">
									{currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)} Applications ({filtered.length})
								</Heading>

								{filtered.length === 0 ? (
									<Text color="muted">No {currentStatus} applications found.</Text>
								) : (
									<TableContainer>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHeaderCell>Wallet Address</TableHeaderCell>
													<TableHeaderCell>Username</TableHeaderCell>
													<TableHeaderCell>Status</TableHeaderCell>
													<TableHeaderCell>Applied</TableHeaderCell>
													{currentStatus !== 'pending' && <TableHeaderCell>Reviewed</TableHeaderCell>}
													{canTakeAction && <TableHeaderCell>Actions</TableHeaderCell>}
												</TableRow>
											</TableHeader>
											<TableBody>
												{filtered.map((app) => (
													<TableRow key={app.solana_address}>
														<TableCell>
															<span class="font-mono text-sm">{app.solana_address}</span>
														</TableCell>
														<TableCell>{app.username ?? '—'}</TableCell>
														<TableCell>
															<Badge variant={getStatusBadgeVariant(app.status)} size="sm">
																{app.status.charAt(0).toUpperCase() + app.status.slice(1)}
															</Badge>
														</TableCell>
														<TableCell>{formatDate(app.applied_at)}</TableCell>
														{currentStatus !== 'pending' && (
															<TableCell>{app.reviewed_at ? formatDate(app.reviewed_at) : '—'}</TableCell>
														)}
														{canTakeAction && (
															<TableCell>
																<div class="flex gap-2">
																	<form
																		method="post"
																		action={`${config.basePath}/creator-applications/${encodeURIComponent(app.solana_address)}/approve`}
																		class="inline"
																	>
																		<CsrfInput token={csrfToken} />
																		<Button type="submit" variant="primary" size="small">
																			Approve
																		</Button>
																	</form>
																	<form
																		method="post"
																		action={`${config.basePath}/creator-applications/${encodeURIComponent(app.solana_address)}/reject`}
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
						Creator Applications
					</Heading>
					<Text color="muted" size="sm" class="mt-2">
						You do not have permission to view creator applications.
					</Text>
				</Card>
			)}
		</Layout>
	);
};
