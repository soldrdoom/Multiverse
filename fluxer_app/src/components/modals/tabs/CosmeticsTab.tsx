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
import styles from '@app/components/modals/tabs/CosmeticsTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {applyProfileCosmetic, clearProfileCosmetic} from '@app/services/cosmetics/CosmeticsService';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import type {OwnedCosmeticNft, ProfileCosmeticSlot} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans} from '@lingui/react/macro';
import {SparkleIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useState} from 'react';
import type React from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_SLOTS: Array<{slot: ProfileCosmeticSlot; label: string; description: string}> = [
	{slot: 'avatar_frame', label: 'Avatar Frame', description: 'An animated decoration around your avatar'},
	{slot: 'profile_banner', label: 'Profile Banner', description: 'A background image on your profile card'},
	{slot: 'profile_effect', label: 'Profile Effect', description: 'An animated overlay on your profile card'},
	{slot: 'badge', label: 'Badge', description: 'An icon displayed on your profile'},
	{slot: 'name_effect', label: 'Name Effect', description: 'An animated decoration on your username'},
];

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

// ─── Slot row component ───────────────────────────────────────────────────────

interface SlotRowProps {
	slot: ProfileCosmeticSlot;
	label: string;
	description: string;
	currentMint: string | null;
	ownedForSlot: OwnedCosmeticNft[];
	onApply: (slot: ProfileCosmeticSlot, mint: string) => void;
	onClear: (slot: ProfileCosmeticSlot) => void;
	isSaving: boolean;
}

const SlotRow: React.FC<SlotRowProps> = ({slot, label, description, currentMint, ownedForSlot, onApply, onClear, isSaving}) => {
	const [pickerOpen, setPickerOpen] = useState(false);
	const currentNft = ownedForSlot.find((n) => n.mint === currentMint) ?? null;

	return (
		<div className={styles.slotRow}>
			<div className={styles.slotInfo}>
				<div className={styles.slotPreview}>
					{currentNft?.image ? (
						<img src={currentNft.image} alt={currentNft.name} className={styles.slotPreviewImage} />
					) : (
						<div className={styles.slotPreviewEmpty}>
							<SparkleIcon size={20} weight="duotone" />
						</div>
					)}
				</div>
				<div className={styles.slotText}>
					<div className={styles.slotLabel}>{label}</div>
					<div className={styles.slotDescription}>
						{currentNft ? (
							<span className={styles.appliedName}>
								{currentNft.name}
								<span className={`${styles.rarityBadge} ${RARITY_STYLE[currentNft.rarity] ?? ''}`}>
									{RARITY_LABELS[currentNft.rarity]}
								</span>
							</span>
						) : (
							description
						)}
					</div>
				</div>
			</div>

			<div className={styles.slotActions}>
				{currentMint && (
					<Button
						variant="secondary"
						small
						onClick={() => onClear(slot)}
						disabled={isSaving}
					>
						<Trans>Remove</Trans>
					</Button>
				)}
				{ownedForSlot.length > 0 && (
					<Button
						variant="primary"
						small
						onClick={() => setPickerOpen((o) => !o)}
						disabled={isSaving}
					>
						{currentMint ? <Trans>Change</Trans> : <Trans>Apply</Trans>}
					</Button>
				)}
				{ownedForSlot.length === 0 && !currentMint && (
					<span className={styles.noneOwned}><Trans>None owned</Trans></span>
				)}
			</div>

			{pickerOpen && (
				<div className={styles.picker}>
					{RARITY_ORDER.flatMap((rarity) =>
						ownedForSlot
							.filter((n) => n.rarity === rarity)
							.map((nft) => (
								<button
									key={nft.mint}
									type="button"
									className={`${styles.pickerItem} ${nft.mint === currentMint ? styles.pickerItemActive : ''}`}
									onClick={() => {
										onApply(slot, nft.mint);
										setPickerOpen(false);
									}}
								>
									{nft.image ? (
										<img src={nft.image} alt={nft.name} className={styles.pickerItemImage} />
									) : (
										<div className={styles.pickerItemPlaceholder}>
											<StarIcon size={16} weight="duotone" />
										</div>
									)}
									<div className={styles.pickerItemName}>{nft.name}</div>
									<div className={`${styles.rarityBadge} ${RARITY_STYLE[nft.rarity] ?? ''}`}>
										{RARITY_LABELS[nft.rarity]}
									</div>
								</button>
							)),
					)}
				</div>
			)}
		</div>
	);
};

// ─── Tab ─────────────────────────────────────────────────────────────────────

const CosmeticsTab: React.FC<Record<string, unknown>> = observer(() => {
	const [savingSlot, setSavingSlot] = useState<ProfileCosmeticSlot | null>(null);

	useEffect(() => {
		CosmeticsStore.loadOwnedNfts();
		CosmeticsStore.loadProfileCosmetics();
	}, []);

	const handleApply = useCallback(async (slot: ProfileCosmeticSlot, mint: string) => {
		setSavingSlot(slot);
		try {
			const updated = await applyProfileCosmetic(slot, mint);
			CosmeticsStore.setAppliedProfile(updated);
		} finally {
			setSavingSlot(null);
		}
	}, []);

	const handleClear = useCallback(async (slot: ProfileCosmeticSlot) => {
		setSavingSlot(slot);
		try {
			const updated = await clearProfileCosmetic(slot);
			CosmeticsStore.setAppliedProfile(updated);
		} finally {
			setSavingSlot(null);
		}
	}, []);

	const isLoading = CosmeticsStore.isLoadingNfts || CosmeticsStore.isLoadingProfile;

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={<Trans>Profile Cosmetics</Trans>}
				description={
					<Trans>
						Equip cosmetic NFTs from your Solana wallet to customize your profile.
						Visit the Multiverse Shop to collect new cosmetics.
					</Trans>
				}
			/>

			{isLoading ? (
				<div className={styles.loadingContainer}>
					<Spinner />
				</div>
			) : (
				<SettingsTabSection>
					<div className={styles.slotList}>
						{PROFILE_SLOTS.map(({slot, label, description}) => (
							<SlotRow
								key={slot}
								slot={slot}
								label={label}
								description={description}
								currentMint={CosmeticsStore.profileSlotMint(slot)}
								ownedForSlot={CosmeticsStore.nftsForSlot(slot)}
								onApply={handleApply}
								onClear={handleClear}
								isSaving={savingSlot === slot}
							/>
						))}
					</div>

					{CosmeticsStore.ownedNfts.length === 0 && (
						<div className={styles.emptyState}>
							<SparkleIcon size={40} weight="duotone" className={styles.emptyIcon} />
							<p className={styles.emptyTitle}><Trans>No cosmetics yet</Trans></p>
							<p className={styles.emptyDescription}>
								<Trans>
									You don't own any cosmetic NFTs yet. Head to the Multiverse Shop to
									grab your first cosmetic and make your profile unique.
								</Trans>
							</p>
						</div>
					)}
				</SettingsTabSection>
			)}
		</SettingsTabContainer>
	);
});

export default CosmeticsTab;
