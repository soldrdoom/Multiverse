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

import {Endpoints} from '@app/Endpoints';
import {SettingsTabContainer, SettingsTabHeader, SettingsTabSection} from '@app/components/modals/shared/SettingsTabLayout';
import styles from '@app/components/modals/tabs/AdminPanelTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import http from '@app/lib/HttpClient';
import {DiscoveryCategoryLabels} from '@fluxer/constants/src/DiscoveryConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, TrashIcon, XCircleIcon} from '@phosphor-icons/react';
import {useCallback, useEffect, useState} from 'react';

// ─── Discovery Applications ───────────────────────────────────────────────────

interface DiscoveryApplication {
	guild_id: string;
	guild_name: string | null;
	status: string;
	description: string;
	category_type: number;
	applied_at: string;
	reviewed_at: string | null;
	review_reason: string | null;
}

type DiscoveryReviewAction = 'approve' | 'reject' | 'remove';
type DiscoveryReviewState = {guildId: string; action: DiscoveryReviewAction} | null;

const DiscoveryApplicationsPanel = () => {
	const {t} = useLingui();
	const [applications, setApplications] = useState<Array<DiscoveryApplication>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reviewing, setReviewing] = useState<DiscoveryReviewState>(null);
	const [reason, setReason] = useState('');
	const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'removed'>('pending');

	const loadApplications = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await http.get<Array<DiscoveryApplication>>({
				url: Endpoints.ADMIN_DISCOVERY_APPLICATIONS,
				query: {status: statusFilter},
			});
			setApplications(res.body ?? []);
		} catch {
			setError(t`Failed to load applications.`);
		} finally {
			setLoading(false);
		}
	}, [statusFilter, t]);

	useEffect(() => {
		void loadApplications();
	}, [loadApplications]);

	const submitReview = useCallback(async () => {
		if (!reviewing) return;
		const {guildId, action} = reviewing;
		let endpoint: string;
		if (action === 'approve') endpoint = Endpoints.ADMIN_DISCOVERY_APPROVE(guildId);
		else if (action === 'reject') endpoint = Endpoints.ADMIN_DISCOVERY_REJECT(guildId);
		else endpoint = Endpoints.ADMIN_DISCOVERY_REMOVE(guildId);

		try {
			await http.post({url: endpoint, body: {reason}});
			setReviewing(null);
			setReason('');
			void loadApplications();
		} catch {
			setError(t`Action failed. Check your permissions.`);
		}
	}, [reviewing, reason, loadApplications, t]);

	const startReview = useCallback((guildId: string, action: DiscoveryReviewAction) => {
		setReviewing({guildId, action});
		setReason('');
	}, []);

	const cancelReview = useCallback(() => {
		setReviewing(null);
		setReason('');
	}, []);

	const statusLabels: Record<string, string> = {
		pending: t`pending`,
		approved: t`approved`,
		rejected: t`rejected`,
		removed: t`removed`,
	};

	return (
		<>
			<div className={styles.toolbar}>
				<div className={styles.filterRow}>
					{(['pending', 'approved', 'rejected', 'removed'] as const).map((s) => (
						<button
							key={s}
							type="button"
							className={styles.filterBtn + (statusFilter === s ? ' ' + styles.filterBtnActive : '')}
							onClick={() => setStatusFilter(s)}
						>
							{s.charAt(0).toUpperCase() + s.slice(1)}
						</button>
					))}
				</div>
				<Button small onClick={() => void loadApplications()}>
					<Trans>Refresh</Trans>
				</Button>
			</div>

			{error != null && <div className={styles.error}>{error}</div>}

			{loading ? (
				<div className={styles.emptyState}><Trans>Loading…</Trans></div>
			) : applications.length === 0 ? (
				<div className={styles.emptyState}>
					{t`No ${statusLabels[statusFilter] ?? statusFilter} applications.`}
				</div>
			) : (
				<div className={styles.list}>
					{applications.map((app) => (
						<div key={app.guild_id} className={styles.card}>
							<div className={styles.cardHeader}>
								<div className={styles.cardMeta}>
									<span className={styles.guildName}>{app.guild_name ?? app.guild_id}</span>
									<div className={styles.cardMetaRow}>
										<span className={styles.guildId}>{app.guild_id}</span>
										<span className={styles.badge}>
											{DiscoveryCategoryLabels[app.category_type as keyof typeof DiscoveryCategoryLabels] ?? 'Unknown'}
										</span>
									</div>
								</div>
								<span className={styles.date}>{new Date(app.applied_at).toLocaleDateString()}</span>
							</div>
							<p className={styles.description}>{app.description}</p>
							{app.review_reason != null && (
								<p className={styles.reviewReason}><Trans>Reason:</Trans> {app.review_reason}</p>
							)}

							{reviewing?.guildId !== app.guild_id && (
								<div className={styles.actions}>
									{statusFilter === 'pending' && (
										<>
											<Button small variant="primary" onClick={() => startReview(app.guild_id, 'approve')} leftIcon={<CheckCircleIcon size={14} weight="bold" />}>
												<Trans>Approve</Trans>
											</Button>
											<Button small variant="danger-primary" onClick={() => startReview(app.guild_id, 'reject')} leftIcon={<XCircleIcon size={14} weight="bold" />}>
												<Trans>Reject</Trans>
											</Button>
										</>
									)}
									{statusFilter === 'approved' && (
										<Button small variant="danger-primary" onClick={() => startReview(app.guild_id, 'remove')} leftIcon={<TrashIcon size={14} weight="bold" />}>
											<Trans>Remove from Discovery</Trans>
										</Button>
									)}
								</div>
							)}

							{reviewing?.guildId === app.guild_id && (
								<div className={styles.reviewForm}>
									<input
										className={styles.reasonInput}
										placeholder={reviewing.action === 'remove' ? t`Reason for removal (optional)` : t`Reason (optional)`}
										value={reason}
										onChange={(e) => setReason(e.target.value)}
									/>
									<div className={styles.actions}>
										<Button small variant={reviewing.action === 'approve' ? 'primary' : 'danger-primary'} onClick={() => void submitReview()}>
											{reviewing.action === 'approve' && <Trans>Confirm Approve</Trans>}
											{reviewing.action === 'reject' && <Trans>Confirm Reject</Trans>}
											{reviewing.action === 'remove' && <Trans>Confirm Remove</Trans>}
										</Button>
										<Button small variant="secondary" onClick={cancelReview}>
											<Trans>Cancel</Trans>
										</Button>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</>
	);
};

// ─── Creator Applications ─────────────────────────────────────────────────────

interface CreatorApplication {
	solana_address: string;
	username: string | null;
	status: string;
	applied_at: string;
	reviewed_at: string | null;
}

type CreatorReviewState = {address: string; action: 'approve' | 'reject'} | null;

const CreatorApplicationsPanel = () => {
	const {t} = useLingui();
	const [applications, setApplications] = useState<Array<CreatorApplication>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reviewing, setReviewing] = useState<CreatorReviewState>(null);
	const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

	const loadApplications = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await http.get<{applications: Array<CreatorApplication>}>({
				url: Endpoints.ADMIN_CREATOR_APPLICATIONS,
			});
			const all = res.body?.applications ?? [];
			setApplications(all.filter((a) => a.status === statusFilter));
		} catch {
			setError(t`Failed to load creator applications.`);
		} finally {
			setLoading(false);
		}
	}, [statusFilter, t]);

	useEffect(() => {
		void loadApplications();
	}, [loadApplications]);

	const submitReview = useCallback(async () => {
		if (!reviewing) return;
		const {address, action} = reviewing;
		const endpoint = action === 'approve'
			? Endpoints.ADMIN_CREATOR_APPLICATION_APPROVE(address)
			: Endpoints.ADMIN_CREATOR_APPLICATION_REJECT(address);
		try {
			await http.post({url: endpoint});
			setReviewing(null);
			void loadApplications();
		} catch {
			setError(t`Action failed. Check your permissions.`);
		}
	}, [reviewing, loadApplications, t]);

	const statusLabels: Record<string, string> = {
		pending: t`pending`,
		approved: t`approved`,
		rejected: t`rejected`,
	};

	return (
		<>
			<div className={styles.toolbar}>
				<div className={styles.filterRow}>
					{(['pending', 'approved', 'rejected'] as const).map((s) => (
						<button
							key={s}
							type="button"
							className={styles.filterBtn + (statusFilter === s ? ' ' + styles.filterBtnActive : '')}
							onClick={() => setStatusFilter(s)}
						>
							{s.charAt(0).toUpperCase() + s.slice(1)}
						</button>
					))}
				</div>
				<Button small onClick={() => void loadApplications()}>
					<Trans>Refresh</Trans>
				</Button>
			</div>

			{error != null && <div className={styles.error}>{error}</div>}

			{loading ? (
				<div className={styles.emptyState}><Trans>Loading…</Trans></div>
			) : applications.length === 0 ? (
				<div className={styles.emptyState}>
					{t`No ${statusLabels[statusFilter] ?? statusFilter} creator applications.`}
				</div>
			) : (
				<div className={styles.list}>
					{applications.map((app) => (
						<div key={app.solana_address} className={styles.card}>
							<div className={styles.cardHeader}>
								<div className={styles.cardMeta}>
									{app.username != null && (
										<span className={styles.applicantUsername}>{app.username}</span>
									)}
									<span className={styles.walletAddress}>{app.solana_address}</span>
									<span className={styles.date}>
										<Trans>Applied</Trans> {new Date(app.applied_at).toLocaleDateString()}
									</span>
								</div>
								{app.reviewed_at != null && (
									<span className={styles.date}>
										<Trans>Reviewed</Trans> {new Date(app.reviewed_at).toLocaleDateString()}
									</span>
								)}
							</div>

							{reviewing?.address !== app.solana_address && statusFilter === 'pending' && (
								<div className={styles.actions}>
									<Button
										small
										variant="primary"
										onClick={() => setReviewing({address: app.solana_address, action: 'approve'})}
										leftIcon={<CheckCircleIcon size={14} weight="bold" />}
									>
										<Trans>Approve</Trans>
									</Button>
									<Button
										small
										variant="danger-primary"
										onClick={() => setReviewing({address: app.solana_address, action: 'reject'})}
										leftIcon={<XCircleIcon size={14} weight="bold" />}
									>
										<Trans>Reject</Trans>
									</Button>
								</div>
							)}

							{reviewing?.address === app.solana_address && (
								<div className={styles.reviewForm}>
									<div className={styles.actions}>
										<Button
											small
											variant={reviewing.action === 'approve' ? 'primary' : 'danger-primary'}
											onClick={() => void submitReview()}
										>
											{reviewing.action === 'approve'
												? <Trans>Confirm Approve</Trans>
												: <Trans>Confirm Reject</Trans>}
										</Button>
										<Button small variant="secondary" onClick={() => setReviewing(null)}>
											<Trans>Cancel</Trans>
										</Button>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</>
	);
};

// ─── Admin Panel Tab ──────────────────────────────────────────────────────────

type AppSection = 'discovery' | 'creator';

const AdminPanelTab = () => {
	const {t} = useLingui();
	const [appSection, setAppSection] = useState<AppSection>('discovery');

	return (
		<SettingsTabContainer>
			<SettingsTabHeader title={t`Admin Panel`} />

			<SettingsTabSection title={t`Applications`}>
				<div className={styles.sectionTabs}>
					<button
						type="button"
						className={styles.sectionTab + (appSection === 'discovery' ? ' ' + styles.sectionTabActive : '')}
						onClick={() => setAppSection('discovery')}
					>
						<Trans>Discovery</Trans>
					</button>
					<button
						type="button"
						className={styles.sectionTab + (appSection === 'creator' ? ' ' + styles.sectionTabActive : '')}
						onClick={() => setAppSection('creator')}
					>
						<Trans>Creator</Trans>
					</button>
				</div>

				{appSection === 'discovery' ? <DiscoveryApplicationsPanel /> : <CreatorApplicationsPanel />}
			</SettingsTabSection>
		</SettingsTabContainer>
	);
};

export default AdminPanelTab;
