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

import styles from '@app/components/modals/CosmeticsShopModal.module.css';
import {CreateListingForm} from '@app/components/modals/cosmetics_shop/CreateListingForm';
import {Spinner} from '@app/components/uikit/Spinner';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import {rarityLabel, SLOT_LABELS} from '@app/utils/cosmetics/rarity';
import {Trans, useLingui} from '@lingui/react/macro';
import {
	CheckCircleIcon,
	ClockIcon,
	PencilSimpleIcon,
	PlusIcon,
	SealCheckIcon,
	TrashIcon,
	WalletIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

const STATUS_LISTING_LABEL: Record<string, string> = {
	draft: 'Draft',
	pending_review: 'Pending Review',
	live: 'Live',
	rejected: 'Rejected',
	delisted: 'Delisted',
};

export const CreatorPanel: React.FC = observer(() => {
	const {t} = useLingui();
	const status = CosmeticsStore.creatorStatus;
	const isLoading = CosmeticsStore.isLoadingCreatorStatus;
	const [applying, setApplying] = useState(false);
	const [submitting, setSubmitting] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const [applyError, setApplyError] = useState<string | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);

	useEffect(() => {
		CosmeticsStore.loadCreatorStatus();
	}, []);

	const handleApply = async () => {
		setApplying(true);
		setApplyError(null);
		try {
			await CosmeticsStore.applyAsCreator();
		} catch (err: unknown) {
			setApplyError(err instanceof Error ? err.message : t`Something went wrong. Please try again.`);
		} finally {
			setApplying(false);
		}
	};

	const handleSubmit = async (id: string) => {
		setSubmitting(id);
		try {
			await CosmeticsStore.submitListing(id);
		} finally {
			setSubmitting(null);
		}
	};

	const handleDelete = async (id: string) => {
		setDeleting(id);
		try {
			await CosmeticsStore.deleteListing(id);
		} finally {
			setDeleting(null);
		}
	};

	if (isLoading) {
		return (
			<div className={styles.loadingContainer}>
				<Spinner />
			</div>
		);
	}

	// No wallet linked — Solana wallet linking happens through Sign-In-With-Solana
	// at login/onboarding; there's no in-app "connect wallet" flow to hand off to
	// yet, so this is informational rather than a CTA (a deviation from the design
	// spec's "LINK WALLET" outline pill — see task report).
	if (!status || !status.wallet_linked) {
		return (
			<div className={styles.emptyState}>
				<WalletIcon size={44} weight="duotone" className={styles.emptyIcon} />
				<p className={styles.emptyTitle}>
					<Trans>Link a Wallet First</Trans>
				</p>
				<p className={styles.emptyDescription}>
					<Trans>
						Sign in with a Solana wallet to link it to your account, then come back here to apply as a creator.
					</Trans>
				</p>
			</div>
		);
	}

	// Not a creator, no application
	if (!status.is_creator && !status.application) {
		return (
			<div className={styles.creatorApplyContainer}>
				<span className={styles.featuredKicker}>{t`CREATOR PROGRAM`}</span>
				<h3 className={styles.creatorHeadline}>
					<Trans>
						Sell your cosmetics. Keep <span className={styles.creatorHeadlineAccent}>90%</span> of every sale.
					</Trans>
				</h3>

				<div className={styles.creatorBullets}>
					<div className={styles.creatorBulletRow}>
						<span className={styles.creatorBulletMarker} style={{background: 'var(--mv-green)', borderRadius: 2}} />
						<span>
							<Trans>List cosmetics you create — no personal information required.</Trans>
						</span>
					</div>
					<div className={styles.creatorBulletRow}>
						<span
							className={styles.creatorBulletMarker}
							style={{background: 'var(--shop-cyan)', borderRadius: '50%'}}
						/>
						<span>
							<Trans>90% of every sale is paid directly to your Solana wallet, on-chain.</Trans>
						</span>
					</div>
					<div className={styles.creatorBulletRow}>
						<span
							className={styles.creatorBulletMarker}
							style={{background: 'var(--mv-purple)', transform: 'rotate(45deg)'}}
						/>
						<span>
							<Trans>Submit a draft, and it goes live in the shop once approved.</Trans>
						</span>
					</div>
				</div>

				{applyError && (
					<p className={styles.creatorError}>
						<WarningIcon weight="bold" size={16} /> {applyError}
					</p>
				)}
				<button type="button" className={styles.applyButton} onClick={() => void handleApply()} disabled={applying}>
					{applying ? <Spinner /> : <Trans>APPLY AS CREATOR</Trans>}
				</button>
			</div>
		);
	}

	// Application pending or rejected
	if (!status.is_creator && status.application) {
		const isPending = status.application.status === 'pending';
		return (
			<div className={styles.creatorApplyContainer}>
				{isPending ? (
					<ClockIcon size={44} weight="duotone" className={styles.emptyIcon} />
				) : (
					<WarningIcon size={44} weight="duotone" className={styles.emptyIcon} />
				)}
				<p className={styles.emptyTitle}>
					{isPending ? <Trans>Application under review</Trans> : <Trans>Not approved this time</Trans>}
				</p>
				<p className={styles.emptyDescription}>
					{isPending ? (
						<Trans>We'll notify you once it's processed.</Trans>
					) : (
						<Trans>Your application wasn't approved this time. You can apply again.</Trans>
					)}
				</p>
				{isPending ? (
					<span className={styles.creatorStatusPill}>
						{t`SUBMITTED`} {new Date(status.application.applied_at).toLocaleDateString()}
					</span>
				) : (
					<button
						type="button"
						className={styles.applyButtonOutline}
						onClick={() => void handleApply()}
						disabled={applying}
					>
						{applying ? <Spinner /> : <Trans>APPLY AGAIN</Trans>}
					</button>
				)}
			</div>
		);
	}

	// Approved creator — dashboard
	const {creator, listings} = status;
	const liveCount = listings.filter((l) => l.status === 'live').length;

	return (
		<div className={styles.creatorDashboard}>
			<div className={styles.creatorInfo}>
				<SealCheckIcon weight="fill" size={20} className={styles.creatorVerified} />
				<span className={styles.creatorIdLabel}>
					<Trans>Creator #{creator?.creator_id}</Trans>
				</span>
				<span className={styles.commissionBadge}>{t`${creator?.commission_rate}% PER SALE`}</span>
				{creator?.payout_suspended && (
					<span className={styles.suspendedBadge}>
						<WarningIcon weight="bold" size={14} /> <Trans>Payouts suspended</Trans>
					</span>
				)}
			</div>

			<div className={styles.statGrid}>
				<div className={styles.statCell}>
					<span className={styles.statLabel}>{t`TOTAL EARNED`}</span>
					<span className={clsx(styles.statValue, styles.statValueAccent)}>
						◎{' '}
						{(
							listings.reduce((sum, l) => (l.status === 'live' ? sum + l.price_lamports : sum), 0) / LAMPORTS_PER_SOL
						).toFixed(2)}
					</span>
				</div>
				<div className={styles.statCell}>
					<span className={styles.statLabel}>{t`LISTINGS`}</span>
					<span className={styles.statValue}>{listings.length}</span>
				</div>
				<div className={styles.statCell}>
					<span className={styles.statLabel}>{t`LIVE LISTINGS`}</span>
					<span className={styles.statValue}>{liveCount}</span>
				</div>
			</div>

			{showCreateForm ? (
				<CreateListingForm onCreated={() => setShowCreateForm(false)} onCancel={() => setShowCreateForm(false)} />
			) : (
				<button type="button" className={styles.newListingButton} onClick={() => setShowCreateForm(true)}>
					<PlusIcon size={14} weight="bold" /> <Trans>NEW LISTING</Trans>
				</button>
			)}

			{listings.length === 0 && !showCreateForm ? (
				<div className={styles.emptyState}>
					<PencilSimpleIcon size={32} weight="duotone" className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>
						<Trans>No listings yet</Trans>
					</p>
					<p className={styles.emptyDescription}>
						<Trans>Create your first listing draft above.</Trans>
					</p>
				</div>
			) : (
				<div className={styles.creatorListings}>
					{listings.map((listing) => (
						<div key={listing.id} className={styles.creatorListingRow}>
							{listing.image_url ? (
								<img src={listing.image_url} alt={listing.name} className={styles.creatorListingArt} />
							) : (
								<div className={styles.creatorListingArt} />
							)}
							<div className={styles.creatorListingInfo}>
								<span className={styles.creatorListingName}>{listing.name}</span>
								<span className={styles.creatorListingMeta}>
									{(SLOT_LABELS[listing.cosmetic_type] ?? listing.cosmetic_type).toUpperCase()}
									{' · '}
									{rarityLabel(listing.rarity).toUpperCase()}
									{' · '}◎ {(listing.price_lamports / LAMPORTS_PER_SOL).toFixed(2)}
								</span>
							</div>
							<span
								className={clsx(
									styles.listingStatusBadge,
									listing.status === 'live' && styles.listingStatusLive,
									listing.status === 'pending_review' && styles.listingStatusPending,
									listing.status === 'rejected' && styles.listingStatusRejected,
								)}
							>
								{STATUS_LISTING_LABEL[listing.status] ?? listing.status}
							</span>
							<div className={styles.creatorListingActions}>
								{listing.status === 'draft' && (
									<>
										<button
											type="button"
											className={clsx(styles.listingActionButton, styles.listingActionSubmit)}
											onClick={() => void handleSubmit(listing.id)}
											disabled={submitting === listing.id}
											aria-label={t`Submit for review`}
										>
											{submitting === listing.id ? <Spinner /> : <CheckCircleIcon weight="bold" size={16} />}
										</button>
										<button
											type="button"
											className={clsx(styles.listingActionButton, styles.listingActionDanger)}
											onClick={() => void handleDelete(listing.id)}
											disabled={deleting === listing.id}
											aria-label={t`Delete listing`}
										>
											{deleting === listing.id ? <Spinner /> : <TrashIcon weight="bold" size={16} />}
										</button>
									</>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
});
