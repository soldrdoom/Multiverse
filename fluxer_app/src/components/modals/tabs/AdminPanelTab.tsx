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

import {
	SettingsTabContainer,
	SettingsTabHeader,
	SettingsTabSection,
} from '@app/components/modals/shared/SettingsTabLayout';
import styles from '@app/components/modals/tabs/AdminPanelTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Checkbox} from '@app/components/uikit/checkbox/Checkbox';
import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import {DiscoveryCategoryLabels} from '@fluxer/constants/src/DiscoveryConstants';
import {UserFlags, UserPremiumTypes} from '@fluxer/constants/src/UserConstants';
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
				<div className={styles.emptyState}>
					<Trans>Loading…</Trans>
				</div>
			) : applications.length === 0 ? (
				<div className={styles.emptyState}>{t`No ${statusLabels[statusFilter] ?? statusFilter} applications.`}</div>
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
								<p className={styles.reviewReason}>
									<Trans>Reason:</Trans> {app.review_reason}
								</p>
							)}

							{reviewing?.guildId !== app.guild_id && (
								<div className={styles.actions}>
									{statusFilter === 'pending' && (
										<>
											<Button
												small
												variant="primary"
												onClick={() => startReview(app.guild_id, 'approve')}
												leftIcon={<CheckCircleIcon size={14} weight="bold" />}
											>
												<Trans>Approve</Trans>
											</Button>
											<Button
												small
												variant="danger-primary"
												onClick={() => startReview(app.guild_id, 'reject')}
												leftIcon={<XCircleIcon size={14} weight="bold" />}
											>
												<Trans>Reject</Trans>
											</Button>
										</>
									)}
									{statusFilter === 'approved' && (
										<Button
											small
											variant="danger-primary"
											onClick={() => startReview(app.guild_id, 'remove')}
											leftIcon={<TrashIcon size={14} weight="bold" />}
										>
											<Trans>Remove from Discovery</Trans>
										</Button>
									)}
								</div>
							)}

							{reviewing?.guildId === app.guild_id && (
								<div className={styles.reviewForm}>
									<input
										className={styles.reasonInput}
										placeholder={
											reviewing.action === 'remove' ? t`Reason for removal (optional)` : t`Reason (optional)`
										}
										value={reason}
										onChange={(e) => setReason(e.target.value)}
									/>
									<div className={styles.actions}>
										<Button
											small
											variant={reviewing.action === 'approve' ? 'primary' : 'danger-primary'}
											onClick={() => void submitReview()}
										>
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

// ─── Badges ────────────────────────────────────────────────────────────────

interface AdminUserLookupResult {
	id: string;
	username: string;
	discriminator: number;
	flags: string;
	premium_type: number | null;
}

interface BadgeDefinition {
	name: string;
	label: string;
	flag: bigint | null;
}

const BADGE_DEFINITIONS: Array<BadgeDefinition> = [
	{name: 'STAFF', label: 'Staff', flag: UserFlags.STAFF},
	{name: 'CTP_MEMBER', label: 'Community Team (CTP)', flag: UserFlags.CTP_MEMBER},
	{name: 'PARTNER', label: 'Partner', flag: UserFlags.PARTNER},
	{name: 'BUG_HUNTER', label: 'Bug Hunter', flag: UserFlags.BUG_HUNTER},
	{name: 'VISIONARY', label: 'Visionary', flag: null},
];

function hasFlag(flags: bigint, flag: bigint): boolean {
	return (flags & flag) === flag;
}

function isFlagBadge(badge: BadgeDefinition): badge is BadgeDefinition & {flag: bigint} {
	return badge.flag !== null;
}

function computeSelectedBadges(user: AdminUserLookupResult): Set<string> {
	const flags = BigInt(user.flags);
	const selected = new Set<string>();
	for (const badge of BADGE_DEFINITIONS) {
		if (badge.flag !== null) {
			if (hasFlag(flags, badge.flag)) selected.add(badge.name);
		} else if (user.premium_type === UserPremiumTypes.LIFETIME) {
			selected.add(badge.name);
		}
	}
	return selected;
}

const BadgesPanel = () => {
	const {t} = useLingui();
	const [userIdInput, setUserIdInput] = useState('');
	const [user, setUser] = useState<AdminUserLookupResult | null>(null);
	const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const lookupUser = useCallback(async () => {
		const trimmed = userIdInput.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await http.post<{users: Array<AdminUserLookupResult>}>({
				url: Endpoints.ADMIN_USERS_LOOKUP,
				body: {user_ids: [trimmed]},
			});
			const found = res.body?.users?.[0] ?? null;
			if (!found) {
				setUser(null);
				setError(t`No user found with that ID.`);
			} else {
				setUser(found);
				setSelectedBadges(computeSelectedBadges(found));
			}
		} catch {
			setUser(null);
			setError(t`Failed to look up user.`);
		} finally {
			setLoading(false);
		}
	}, [userIdInput, t]);

	const toggleBadge = useCallback((name: string, checked: boolean) => {
		setSelectedBadges((prev) => {
			const next = new Set(prev);
			if (checked) next.add(name);
			else next.delete(name);
			return next;
		});
	}, []);

	const saveBadges = useCallback(async () => {
		if (!user) return;
		setSaving(true);
		setError(null);
		setSuccess(null);
		try {
			const currentFlags = BigInt(user.flags);
			const flagBadges = BADGE_DEFINITIONS.filter(isFlagBadge);
			const addFlags = flagBadges
				.filter((badge) => selectedBadges.has(badge.name) && !hasFlag(currentFlags, badge.flag))
				.map((badge) => badge.flag.toString());
			const removeFlags = flagBadges
				.filter((badge) => !selectedBadges.has(badge.name) && hasFlag(currentFlags, badge.flag))
				.map((badge) => badge.flag.toString());

			if (addFlags.length > 0 || removeFlags.length > 0) {
				await http.post({
					url: Endpoints.ADMIN_UPDATE_USER_FLAGS,
					body: {user_id: user.id, add_flags: addFlags, remove_flags: removeFlags},
				});
			}

			const visionaryGranted = selectedBadges.has('VISIONARY');
			const visionaryWasGranted = user.premium_type === UserPremiumTypes.LIFETIME;
			if (visionaryGranted !== visionaryWasGranted) {
				await http.post({
					url: Endpoints.ADMIN_UPDATE_USER_VISIONARY,
					body: {user_id: user.id, granted: visionaryGranted},
				});
			}

			let nextFlags = currentFlags;
			for (const badge of flagBadges) {
				if (selectedBadges.has(badge.name)) nextFlags |= badge.flag;
				else nextFlags &= ~badge.flag;
			}
			setUser((prev) =>
				prev
					? {
							...prev,
							flags: nextFlags.toString(),
							premium_type: visionaryGranted ? UserPremiumTypes.LIFETIME : UserPremiumTypes.NONE,
						}
					: prev,
			);
			setSuccess(t`Badges updated.`);
		} catch {
			setError(t`Failed to update badges. Check your permissions.`);
		} finally {
			setSaving(false);
		}
	}, [user, selectedBadges, t]);

	return (
		<>
			<div className={styles.toolbar}>
				<form
					className={styles.filterRow}
					onSubmit={(e) => {
						e.preventDefault();
						void lookupUser();
					}}
				>
					<input
						className={styles.reasonInput}
						placeholder={t`User ID`}
						value={userIdInput}
						onChange={(e) => setUserIdInput(e.target.value)}
					/>
					<Button small onClick={() => void lookupUser()} disabled={loading}>
						<Trans>Look Up</Trans>
					</Button>
				</form>
			</div>

			{error != null && <div className={styles.error}>{error}</div>}
			{success != null && <div className={styles.success}>{success}</div>}

			{loading ? (
				<div className={styles.emptyState}>
					<Trans>Loading…</Trans>
				</div>
			) : user ? (
				<div className={styles.card}>
					<div className={styles.cardHeader}>
						<div className={styles.cardMeta}>
							<span className={styles.guildName}>
								{user.username}
								{user.discriminator > 0 ? `#${String(user.discriminator).padStart(4, '0')}` : ''}
							</span>
							<span className={styles.guildId}>{user.id}</span>
						</div>
					</div>
					<div className={styles.badgeList}>
						{BADGE_DEFINITIONS.map((badge) => (
							<Checkbox
								key={badge.name}
								checked={selectedBadges.has(badge.name)}
								onChange={(checked) => toggleBadge(badge.name, checked)}
							>
								{badge.label}
							</Checkbox>
						))}
					</div>
					<div className={styles.actions}>
						<Button small variant="primary" onClick={() => void saveBadges()} disabled={saving}>
							<Trans>Save Badges</Trans>
						</Button>
					</div>
				</div>
			) : (
				<div className={styles.emptyState}>
					<Trans>Look up a user by ID to manage their badges.</Trans>
				</div>
			)}
		</>
	);
};

// ─── Admin Panel Tab ──────────────────────────────────────────────────────────

type AdminSection = 'discovery' | 'badges';

const AdminPanelTab = () => {
	const {t} = useLingui();
	const [activeSection, setActiveSection] = useState<AdminSection>('discovery');

	const menuItems: Array<{id: AdminSection; label: string}> = [
		{id: 'discovery', label: t`Discovery Applications`},
		{id: 'badges', label: t`Badges`},
	];

	const activeLabel = menuItems.find((item) => item.id === activeSection)?.label;

	const renderSection = () => {
		if (activeSection === 'discovery') return <DiscoveryApplicationsPanel />;
		return <BadgesPanel />;
	};

	return (
		<SettingsTabContainer>
			<SettingsTabHeader title={t`Admin Panel`} />

			<div className={styles.panelLayout}>
				<nav className={styles.submenu} aria-label={t`Admin Panel sections`}>
					{menuItems.map((item) => (
						<button
							key={item.id}
							type="button"
							className={styles.submenuItem + (activeSection === item.id ? ' ' + styles.submenuItemActive : '')}
							onClick={() => setActiveSection(item.id)}
						>
							{item.label}
						</button>
					))}
				</nav>

				<div className={styles.panelContent}>
					<SettingsTabSection title={activeLabel}>{renderSection()}</SettingsTabSection>
				</div>
			</div>
		</SettingsTabContainer>
	);
};

export default AdminPanelTab;
