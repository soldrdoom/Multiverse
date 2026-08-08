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
import {Spinner} from '@app/components/uikit/Spinner';
import {useCosmeticSlotEquip} from '@app/hooks/cosmetics/useCosmeticSlotEquip';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import {compareRarity, rarityLabel, rarityStyle, SLOT_LABELS} from '@app/utils/cosmetics/rarity';
import {Trans, useLingui} from '@lingui/react/macro';
import {SparkleIcon, StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

function shortenAddress(address: string): string {
	if (address.length <= 10) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export const YourItemsView: React.FC = observer(() => {
	const {t} = useLingui();
	const {savingSlot, isLoading, ownedNfts, currentMint, applySlot, clearSlot} = useCosmeticSlotEquip();
	const address = SolanaWalletStore.walletAddress;

	const equippable = ownedNfts
		.filter((nft) => nft.cosmetic_type != null)
		.sort((a, b) => compareRarity(a.rarity, b.rarity));

	return (
		<div className={styles.mainInner}>
			<div className={styles.kickerRow}>
				<span className={styles.kickerLabel}>
					{t`YOUR COSMETICS`}
					{address ? ` · ${t`MINTED TO`} ${shortenAddress(address)}` : ''}
				</span>
				<span className={styles.kickerCount}>
					{equippable.length} {t`ITEMS`}
				</span>
			</div>

			{isLoading ? (
				<div className={styles.loadingContainer}>
					<Spinner />
				</div>
			) : equippable.length === 0 ? (
				<div className={styles.emptyState}>
					<SparkleIcon size={48} weight="duotone" className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>
						<Trans>No cosmetics yet</Trans>
					</p>
					<p className={styles.emptyDescription}>
						<Trans>Cosmetics you buy or that a creator mints to your wallet will show up here, ready to equip.</Trans>
					</p>
				</div>
			) : (
				<div className={styles.itemGrid}>
					{equippable.map((nft) => {
						const slot = nft.cosmetic_type as string;
						const isEquipped = currentMint(slot) === nft.mint;
						const isSaving = savingSlot === slot;
						return (
							<div key={nft.mint} className={clsx(styles.itemCard, isEquipped && styles.equippedCard)}>
								{isEquipped && (
									<span className={styles.equippedPill}>
										<Trans>EQUIPPED</Trans>
									</span>
								)}
								<div className={styles.itemArt}>
									{nft.image ? (
										<img src={nft.image} alt={nft.name} className={styles.itemArtImg} />
									) : (
										<StarIcon size={30} weight="duotone" className={styles.itemArtPlaceholder} />
									)}
									<span className={clsx(styles.rarityBadge, styles.itemRarityBadge, rarityStyle(styles, nft.rarity))}>
										{rarityLabel(nft.rarity).toUpperCase()}
									</span>
								</div>
								<div className={styles.itemBody}>
									<div className={styles.itemName}>{nft.name}</div>
									<div className={styles.itemType}>{(SLOT_LABELS[slot] ?? slot).toUpperCase()}</div>
								</div>
								<div className={styles.itemFooter}>
									{isEquipped ? (
										<button
											type="button"
											className={styles.unequipBtn}
											disabled={isSaving}
											onClick={() => void clearSlot(slot)}
										>
											{isSaving ? <Spinner size="small" /> : <Trans>UNEQUIP</Trans>}
										</button>
									) : (
										<button
											type="button"
											className={styles.equipBtn}
											disabled={isSaving}
											onClick={() => void applySlot(slot, nft.mint)}
										>
											{isSaving ? <Spinner size="small" /> : <Trans>EQUIP</Trans>}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
});
