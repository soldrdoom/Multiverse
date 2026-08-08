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
import {rarityLabel, rarityStyle, SLOT_LABELS} from '@app/utils/cosmetics/rarity';
import type {StoreListingNft} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans} from '@lingui/react/macro';
import {StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface ShopItemCardProps {
	item: StoreListingNft;
	onSelect: (item: StoreListingNft) => void;
}

export const ShopItemCard: React.FC<ShopItemCardProps> = ({item, onSelect}) => {
	const priceSol = (item.price_lamports / LAMPORTS_PER_SOL).toFixed(2);

	return (
		<button
			type="button"
			className={clsx(styles.itemCard, item.rarity === 'legendary' && styles.itemCardLegendaryGlow)}
			onClick={() => onSelect(item)}
		>
			<div className={styles.itemArt}>
				{item.image ? (
					<img src={item.image} alt={item.name} className={styles.itemArtImg} />
				) : (
					<StarIcon size={30} weight="duotone" className={styles.itemArtPlaceholder} />
				)}
				<span className={clsx(styles.rarityBadge, styles.itemRarityBadge, rarityStyle(styles, item.rarity))}>
					{rarityLabel(item.rarity).toUpperCase()}
				</span>
			</div>
			<div className={styles.itemBody}>
				<div className={styles.itemName}>{item.name}</div>
				<div className={styles.itemType}>{(SLOT_LABELS[item.cosmetic_type] ?? item.cosmetic_type).toUpperCase()}</div>
			</div>
			<div className={styles.itemFooter}>
				<span className={styles.itemPrice}>◎ {priceSol}</span>
				<span className={styles.buyPill}>
					<Trans>BUY</Trans>
				</span>
			</div>
		</button>
	);
};
