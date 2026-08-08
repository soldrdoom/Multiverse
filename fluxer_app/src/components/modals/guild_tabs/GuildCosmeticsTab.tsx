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

import styles from '@app/components/modals/guild_tabs/GuildCosmeticsTab.module.css';
import {
	SettingsTabContainer,
	SettingsTabHeader,
	SettingsTabSection,
} from '@app/components/modals/shared/SettingsTabLayout';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {useCosmeticSlotEquip} from '@app/hooks/cosmetics/useCosmeticSlotEquip';
import {RARITY_ORDER, rarityLabel, rarityStyle} from '@app/utils/cosmetics/rarity';
import type {OwnedCosmeticNft, ServerCosmeticSlot} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans} from '@lingui/react/macro';
import {PaintBucketIcon, SparkleIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_SLOTS: Array<{slot: ServerCosmeticSlot; label: string; description: string}> = [
	{slot: 'chat_background', label: 'Chat Background', description: 'A wallpaper behind messages in the chat area'},
	{
		slot: 'channel_list_background',
		label: 'Channel List Background',
		description: 'An image behind the channel/category sidebar',
	},
];

// ─── Slot row ────────────────────────────────────────────────────────────────

interface SlotRowProps {
	slot: ServerCosmeticSlot;
	label: string;
	description: string;
	currentMint: string | null;
	ownedForSlot: Array<OwnedCosmeticNft>;
	onApply: (slot: ServerCosmeticSlot, mint: string) => void;
	onClear: (slot: ServerCosmeticSlot) => void;
	isSaving: boolean;
}

const SlotRow: React.FC<SlotRowProps> = ({
	slot,
	label,
	description,
	currentMint,
	ownedForSlot,
	onApply,
	onClear,
	isSaving,
}) => {
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
							<PaintBucketIcon size={20} weight="duotone" />
						</div>
					)}
				</div>
				<div className={styles.slotText}>
					<div className={styles.slotLabel}>{label}</div>
					<div className={styles.slotDescription}>
						{currentNft ? (
							<span className={styles.appliedName}>
								{currentNft.name}
								<span className={`${styles.rarityBadge} ${rarityStyle(styles, currentNft.rarity)}`}>
									{rarityLabel(currentNft.rarity)}
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
					<Button variant="secondary" small onClick={() => onClear(slot)} disabled={isSaving}>
						<Trans>Remove</Trans>
					</Button>
				)}
				{ownedForSlot.length > 0 && (
					<Button variant="primary" small onClick={() => setPickerOpen((o) => !o)} disabled={isSaving}>
						{currentMint ? <Trans>Change</Trans> : <Trans>Apply</Trans>}
					</Button>
				)}
				{ownedForSlot.length === 0 && !currentMint && (
					<span className={styles.noneOwned}>
						<Trans>None owned</Trans>
					</span>
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
									<div className={`${styles.rarityBadge} ${rarityStyle(styles, nft.rarity)}`}>
										{rarityLabel(nft.rarity)}
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

const GuildCosmeticsTab: React.FC<{guildId: string}> = observer(({guildId}) => {
	const {savingSlot, isLoading, ownedNfts, currentMint, nftsForSlot, applySlot, clearSlot} =
		useCosmeticSlotEquip(guildId);

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={<Trans>Server Cosmetics</Trans>}
				description={
					<Trans>
						Apply cosmetic NFTs from your wallet to customize how this server looks for all members. Only cosmetics you
						own can be applied.
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
						{SERVER_SLOTS.map(({slot, label, description}) => (
							<SlotRow
								key={slot}
								slot={slot}
								label={label}
								description={description}
								currentMint={currentMint(slot)}
								ownedForSlot={nftsForSlot(slot)}
								onApply={(s, mint) => void applySlot(s, mint)}
								onClear={(s) => void clearSlot(s)}
								isSaving={savingSlot === slot}
							/>
						))}
					</div>

					{ownedNfts.length === 0 && (
						<div className={styles.emptyState}>
							<SparkleIcon size={40} weight="duotone" className={styles.emptyIcon} />
							<p className={styles.emptyTitle}>
								<Trans>No server cosmetics yet</Trans>
							</p>
							<p className={styles.emptyDescription}>
								<Trans>
									You don't own any server cosmetic NFTs. Visit the Multiverse Shop to get cosmetics that can be applied
									to your server.
								</Trans>
							</p>
						</div>
					)}
				</SettingsTabSection>
			)}
		</SettingsTabContainer>
	);
});

export default GuildCosmeticsTab;
