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

import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/CosmeticsShopModal.module.css';
import {Spinner} from '@app/components/uikit/Spinner';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import type {StoreListingNft} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {uploadListingImage} from '@app/services/cosmetics/CosmeticsService';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, ClockIcon, ImageIcon, PencilSimpleIcon, PlusIcon, SparkleIcon, StarIcon, StorefrontIcon, TrashIcon, WarningIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const LAMPORTS_PER_SOL = 1_000_000_000;

const PROFILE_SLOT_TYPES = new Set([
	'avatar_frame',
	'profile_banner',
	'profile_effect',
	'badge',
	'name_effect',
]);

const SERVER_SLOT_TYPES = new Set([
	'chat_background',
	'channel_list_background',
	'server_banner',
	'server_invite_card',
	'channel_dividers',
	'message_bubbles',
	'emoji_pack',
]);

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'] as const;

const RARITY_LABELS: Record<string, string> = {
	legendary: 'Legendary',
	epic: 'Epic',
	rare: 'Rare',
	uncommon: 'Uncommon',
	common: 'Common',
};

const RARITY_STYLE: Record<string, string> = {
	legendary: styles.rarity_legendary,
	epic: styles.rarity_epic,
	rare: styles.rarity_rare,
	uncommon: styles.rarity_uncommon,
	common: styles.rarity_common,
};

const SLOT_LABELS: Record<string, string> = {
	avatar_frame: 'Avatar Frame',
	profile_banner: 'Profile Banner',
	profile_effect: 'Profile Effect',
	badge: 'Badge',
	name_effect: 'Name Effect',
	chat_background: 'Chat Background',
	channel_list_background: 'Channel List BG',
	server_banner: 'Server Banner',
	server_invite_card: 'Invite Card',
	channel_dividers: 'Channel Dividers',
	message_bubbles: 'Message Bubbles',
	emoji_pack: 'Emoji Pack',
};

// ─── Shop item card ───────────────────────────────────────────────────────────

const ShopItemCard: React.FC<{item: StoreListingNft}> = ({item}) => {
	const priceSol = (item.price_lamports / LAMPORTS_PER_SOL).toFixed(2);

	return (
		<div className={styles.itemCard}>
			<div className={styles.itemPreview}>
				{item.image ? (
					<img src={item.image} alt={item.name} className={styles.itemImage} />
				) : (
					<div className={styles.itemImagePlaceholder}>
						<StarIcon size={32} weight="duotone" />
					</div>
				)}
				<span className={`${styles.rarityBadge} ${RARITY_STYLE[item.rarity] ?? ''}`}>
					{RARITY_LABELS[item.rarity]}
				</span>
			</div>
			<div className={styles.itemBody}>
				<div className={styles.itemName}>{item.name}</div>
				<div className={styles.itemSlot}>{SLOT_LABELS[item.cosmetic_type] ?? item.cosmetic_type}</div>
				{item.description && (
					<div className={styles.itemDescription}>{item.description}</div>
				)}
			</div>
			<div className={styles.itemFooter}>
				<div className={styles.itemPrice}>
					<span className={styles.priceAmount}>{priceSol}</span>
					<span className={styles.priceCurrency}>SOL</span>
				</div>
				<button type="button" className={styles.buyButton} disabled>
					<Trans>Buy</Trans>
				</button>
			</div>
		</div>
	);
};

// ─── Creator panel ────────────────────────────────────────────────────────────

const STATUS_LISTING_LABEL: Record<string, string> = {
	draft: 'Draft',
	pending_review: 'Pending Review',
	live: 'Live',
	rejected: 'Rejected',
	delisted: 'Delisted',
};

const ALL_COSMETIC_TYPES = [
	'avatar_frame',
	'profile_banner',
	'profile_effect',
	'badge',
	'name_effect',
	'chat_background',
	'channel_list_background',
	'server_banner',
] as const;

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

interface CreateListingFormProps {
	onCreated: () => void;
	onCancel: () => void;
}

const CreateListingForm: React.FC<CreateListingFormProps> = ({onCreated, onCancel}) => {
	const {t} = useLingui();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [cosmeticType, setCosmeticType] = useState<string>(ALL_COSMETIC_TYPES[0]);
	const [rarity, setRarity] = useState<string>('common');
	const [priceSol, setPriceSol] = useState('');
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImageFile(file);
		setImagePreview(URL.createObjectURL(file));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const priceLamports = Math.round(parseFloat(priceSol) * 1_000_000_000);
		if (!name.trim()) return setError(t`Name is required.`);
		if (!priceSol || isNaN(priceLamports) || priceLamports <= 0) return setError(t`Enter a valid price greater than 0.`);

		setError(null);
		setSaving(true);
		try {
			let imageUrl: string | null = null;
			if (imageFile) {
				setUploading(true);
				imageUrl = await uploadListingImage(imageFile);
				setUploading(false);
			}
			await CosmeticsStore.createListing({
				name: name.trim(),
				description: description.trim() || undefined,
				image_url: imageUrl ?? undefined,
				cosmetic_type: cosmeticType as typeof ALL_COSMETIC_TYPES[number],
				rarity: rarity as typeof RARITIES[number],
				price_lamports: priceLamports,
			});
			onCreated();
		} catch (err: unknown) {
			setUploading(false);
			setError(err instanceof Error ? err.message : t`Failed to create listing.`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form className={styles.createListingForm} onSubmit={(e) => void handleSubmit(e)}>
			<div className={styles.createListingHeader}>
				<span className={styles.createListingTitle}><Trans>New Listing</Trans></span>
				<button type="button" className={styles.createListingClose} onClick={onCancel} aria-label={t`Cancel`}>
					<XIcon size={16} weight="bold" />
				</button>
			</div>

			<div className={styles.imageUploadRow}>
				<button
					type="button"
					className={styles.imageUploadBox}
					onClick={() => fileInputRef.current?.click()}
					style={imagePreview ? {backgroundImage: `url(${imagePreview})`} : undefined}
				>
					{!imagePreview && <ImageIcon size={28} weight="duotone" className={styles.imageUploadIcon} />}
					{!imagePreview && <span className={styles.imageUploadLabel}><Trans>Upload image</Trans></span>}
				</button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className={styles.hiddenFileInput}
					onChange={handleImageChange}
				/>
			</div>

			<div className={styles.formField}>
				<label className={styles.formLabel}><Trans>Name</Trans></label>
				<input
					className={styles.formInput}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={t`e.g. Neon Flame Avatar Frame`}
					maxLength={80}
					required
				/>
			</div>

			<div className={styles.formField}>
				<label className={styles.formLabel}><Trans>Description</Trans> <span className={styles.formLabelOptional}><Trans>(optional)</Trans></span></label>
				<textarea
					className={styles.formTextarea}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder={t`Describe your cosmetic…`}
					maxLength={300}
					rows={2}
				/>
			</div>

			<div className={styles.formRow}>
				<div className={styles.formField}>
					<label className={styles.formLabel}><Trans>Type</Trans></label>
					<select className={styles.formSelect} value={cosmeticType} onChange={(e) => setCosmeticType(e.target.value)}>
						{ALL_COSMETIC_TYPES.map((t) => (
							<option key={t} value={t}>{SLOT_LABELS[t] ?? t}</option>
						))}
					</select>
				</div>
				<div className={styles.formField}>
					<label className={styles.formLabel}><Trans>Rarity</Trans></label>
					<select className={styles.formSelect} value={rarity} onChange={(e) => setRarity(e.target.value)}>
						{RARITIES.map((r) => (
							<option key={r} value={r}>{RARITY_LABELS[r]}</option>
						))}
					</select>
				</div>
				<div className={styles.formField}>
					<label className={styles.formLabel}><Trans>Price (SOL)</Trans></label>
					<input
						className={styles.formInput}
						type="number"
						min="0.001"
						step="0.001"
						value={priceSol}
						onChange={(e) => setPriceSol(e.target.value)}
						placeholder="0.50"
						required
					/>
				</div>
			</div>

			{error != null && <p className={styles.formError}>{error}</p>}

			<div className={styles.formActions}>
				<button type="button" className={styles.formCancelBtn} onClick={onCancel} disabled={saving}>
					<Trans>Cancel</Trans>
				</button>
				<button type="submit" className={styles.formSubmitBtn} disabled={saving}>
					{saving ? (uploading ? <Trans>Uploading…</Trans> : <Trans>Saving…</Trans>) : <Trans>Create Draft</Trans>}
				</button>
			</div>
		</form>
	);
};

const CreatorPanel: React.FC = observer(() => {
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

	// No wallet linked
	if (!status || !status.wallet_linked) {
		return (
			<div className={styles.emptyState}>
				<StorefrontIcon size={48} weight="duotone" className={styles.emptyIcon} />
				<p className={styles.emptyTitle}><Trans>Link a Wallet First</Trans></p>
				<p className={styles.emptyDescription}>
					<Trans>Connect your Solana wallet to your account to apply as a creator.</Trans>
				</p>
			</div>
		);
	}

	// Not a creator, no application
	if (!status.is_creator && !status.application) {
		return (
			<div className={styles.creatorApplyContainer}>
				<StorefrontIcon size={48} weight="duotone" className={styles.emptyIcon} />
				<p className={styles.emptyTitle}><Trans>Become a Creator</Trans></p>
				<p className={styles.emptyDescription}>
					<Trans>
						List your cosmetic items in the Multiverse shop and earn 90% of every sale,
						paid directly to your Solana wallet on-chain. No personal information required.
					</Trans>
				</p>
				{applyError && (
					<p className={styles.creatorError}>
						<WarningIcon weight="bold" size={16} /> {applyError}
					</p>
				)}
				<button
					type="button"
					className={styles.applyButton}
					onClick={handleApply}
					disabled={applying}
				>
					{applying ? <Spinner /> : <Trans>Apply as Creator</Trans>}
				</button>
			</div>
		);
	}

	// Application pending or rejected
	if (!status.is_creator && status.application) {
		const isPending = status.application.status === 'pending';
		return (
			<div className={styles.creatorApplyContainer}>
				{isPending
					? <ClockIcon size={48} weight="duotone" className={styles.emptyIcon} />
					: <WarningIcon size={48} weight="duotone" className={styles.emptyIcon} />}
				<p className={styles.emptyTitle}>
					{isPending ? <Trans>Application Pending</Trans> : <Trans>Application Not Approved</Trans>}
				</p>
				<p className={styles.emptyDescription}>
					{isPending
						? <Trans>Your application is under review. We'll notify you when it's processed.</Trans>
						: <Trans>Your application was not approved this time. You can apply again.</Trans>}
				</p>
				{!isPending && (
					<button
						type="button"
						className={styles.applyButton}
						onClick={handleApply}
						disabled={applying}
					>
						{applying ? <Spinner /> : <Trans>Apply Again</Trans>}
					</button>
				)}
			</div>
		);
	}

	// Approved creator — show dashboard
	const {creator, listings} = status;
	return (
		<div className={styles.creatorDashboard}>
			<div className={styles.creatorInfo}>
				<CheckCircleIcon weight="fill" size={18} className={styles.creatorVerified} />
				<span className={styles.creatorIdLabel}>
					<Trans>Creator #{creator?.creator_id}</Trans>
				</span>
				<span className={styles.commissionBadge}>
					<Trans>{creator?.commission_rate}% earnings per sale</Trans>
				</span>
				{creator?.payout_suspended && (
					<span className={styles.suspendedBadge}>
						<WarningIcon weight="bold" size={14} /> <Trans>Payouts suspended</Trans>
					</span>
				)}
			</div>

			<p className={styles.creatorDashboardHint}>
				<Trans>
					Create a draft listing, then submit it for review. Once approved it appears in the shop
					and your 90% commission is paid on-chain to your wallet with every sale.
				</Trans>
			</p>

			{showCreateForm ? (
				<CreateListingForm
					onCreated={() => setShowCreateForm(false)}
					onCancel={() => setShowCreateForm(false)}
				/>
			) : (
				<button
					type="button"
					className={styles.newListingButton}
					onClick={() => setShowCreateForm(true)}
				>
					<PlusIcon size={14} weight="bold" /> <Trans>New listing</Trans>
				</button>
			)}

			{listings.length === 0 && !showCreateForm ? (
				<div className={styles.emptyState}>
					<PencilSimpleIcon size={32} weight="duotone" className={styles.emptyIcon} />
					<p className={styles.emptyTitle}><Trans>No listings yet</Trans></p>
					<p className={styles.emptyDescription}>
						<Trans>Create your first listing draft above.</Trans>
					</p>
				</div>
			) : (
				<div className={styles.creatorListings}>
					{listings.map((listing) => (
						<div key={listing.id} className={styles.creatorListingRow}>
							<div className={styles.creatorListingInfo}>
								<span className={styles.creatorListingName}>{listing.name}</span>
								<span className={styles.creatorListingMeta}>
									{SLOT_LABELS[listing.cosmetic_type] ?? listing.cosmetic_type}
									{' · '}
									{RARITY_LABELS[listing.rarity]}
									{' · '}
									{(listing.price_lamports / LAMPORTS_PER_SOL).toFixed(2)} SOL
								</span>
							</div>
							<span className={clsx(
								styles.listingStatusBadge,
								listing.status === 'live' && styles.listingStatusLive,
								listing.status === 'pending_review' && styles.listingStatusPending,
								listing.status === 'rejected' && styles.listingStatusRejected,
							)}>
								{STATUS_LISTING_LABEL[listing.status] ?? listing.status}
							</span>
							<div className={styles.creatorListingActions}>
								{listing.status === 'draft' && (
									<>
										<button
											type="button"
											className={styles.listingActionButton}
											onClick={() => handleSubmit(listing.id)}
											disabled={submitting === listing.id}
											aria-label={t`Submit for review`}
										>
											{submitting === listing.id ? <Spinner /> : <CheckCircleIcon weight="bold" size={16} />}
										</button>
										<button
											type="button"
											className={clsx(styles.listingActionButton, styles.listingActionDanger)}
											onClick={() => handleDelete(listing.id)}
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

// ─── Modal ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'profile' | 'server';
type RarityFilter = 'legendary' | 'epic' | 'rare' | 'uncommon' | 'common' | null;
type ModalTab = 'shop' | 'creator';

export const CosmeticsShopModal: React.FC = observer(() => {
	const {t} = useLingui();
	const [tab, setTab] = useState<ModalTab>('shop');
	const [filter, setFilter] = useState<FilterType>('all');
	const [rarityFilter, setRarityFilter] = useState<RarityFilter>(null);

	useEffect(() => {
		CosmeticsStore.loadStoreItems();
	}, []);

	const isLoading = CosmeticsStore.isLoadingStore;

	const filteredItems = CosmeticsStore.storeItems.filter((item) => {
		if (filter === 'profile' && !PROFILE_SLOT_TYPES.has(item.cosmetic_type)) return false;
		if (filter === 'server' && !SERVER_SLOT_TYPES.has(item.cosmetic_type)) return false;
		if (rarityFilter && item.rarity !== rarityFilter) return false;
		return true;
	});

	const sortedItems = [...filteredItems].sort((a, b) => {
		const aIdx = RARITY_ORDER.indexOf(a.rarity as typeof RARITY_ORDER[number]);
		const bIdx = RARITY_ORDER.indexOf(b.rarity as typeof RARITY_ORDER[number]);
		return aIdx - bIdx;
	});

	return (
		<Modal.Root size="large">
			<Modal.Header title={t`Cosmetics Shop`} />
			<Modal.Content>
				{/* ── Tab bar ───────────────────────────────────────── */}
				<div className={styles.filterRow}>
					<button
						type="button"
						className={clsx(styles.filterTab, tab === 'shop' && styles.filterTabActive)}
						onClick={() => setTab('shop')}
					>
						<Trans>Shop</Trans>
					</button>
					<button
						type="button"
						className={clsx(styles.filterTab, tab === 'creator' && styles.filterTabActive)}
						onClick={() => setTab('creator')}
					>
						<Trans>Creator</Trans>
					</button>
				</div>

				{tab === 'creator' ? (
					<CreatorPanel />
				) : (
					<>
				{/* ── Category filter ──────────────────────────────── */}
				<div className={styles.filterRow}>
					<button
						type="button"
						className={clsx(styles.filterTab, filter === 'all' && styles.filterTabActive)}
						onClick={() => setFilter('all')}
					>
						<Trans>All</Trans>
					</button>
					<button
						type="button"
						className={clsx(styles.filterTab, filter === 'profile' && styles.filterTabActive)}
						onClick={() => setFilter('profile')}
					>
						<Trans>Profile</Trans>
					</button>
					<button
						type="button"
						className={clsx(styles.filterTab, filter === 'server' && styles.filterTabActive)}
						onClick={() => setFilter('server')}
					>
						<Trans>Server</Trans>
					</button>
				</div>

				{/* ── Rarity filter ─────────────────────────────────── */}
				<div className={styles.rarityRow}>
					{RARITY_ORDER.map((rarity) => (
						<button
							key={rarity}
							type="button"
							className={clsx(
								styles.rarityChip,
								RARITY_STYLE[rarity],
								rarityFilter === rarity && styles.rarityChipActive,
							)}
							onClick={() => setRarityFilter((r) => (r === rarity ? null : rarity))}
						>
							{RARITY_LABELS[rarity]}
						</button>
					))}
				</div>

				{/* ── Content ───────────────────────────────────────── */}
				{isLoading ? (
					<div className={styles.loadingContainer}>
						<Spinner />
					</div>
				) : sortedItems.length > 0 ? (
					<div className={styles.itemGrid}>
						{sortedItems.map((item) => (
							<ShopItemCard key={item.id} item={item} />
						))}
					</div>
				) : (
					<div className={styles.emptyState}>
						<SparkleIcon size={48} weight="duotone" className={styles.emptyIcon} />
						<p className={styles.emptyTitle}>
							<Trans>Shop Opening Soon</Trans>
						</p>
						<p className={styles.emptyDescription}>
							<Trans>
								Cosmetic NFTs will be available to purchase here when the Multiverse
								collection launches. Check back soon!
							</Trans>
						</p>
					</div>
				)}
					</>
				)}
			</Modal.Content>
		</Modal.Root>
	);
});
