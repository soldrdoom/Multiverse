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
import {Trans, useLingui} from '@lingui/react/macro';
import {StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface FeaturedDropCardProps {
	item: StoreListingNft;
	onBuy: () => void;
}

export const FeaturedDropCard: React.FC<FeaturedDropCardProps> = ({item, onBuy}) => {
	const {t} = useLingui();
	const priceSol = (item.price_lamports / LAMPORTS_PER_SOL).toFixed(2);

	return (
		<div className={styles.featuredWrap}>
			<div className={styles.featuredInner}>
				<div className={styles.featuredArt}>
					{item.image ? (
						<img src={item.image} alt={item.name} className={styles.featuredArtImg} />
					) : (
						<StarIcon size={40} weight="duotone" className={styles.featuredArtPlaceholder} />
					)}
					<span className={styles.featuredSlotPill}>{SLOT_LABELS[item.cosmetic_type] ?? item.cosmetic_type}</span>
				</div>

				<div className={styles.featuredBody}>
					<div className={styles.featuredTop}>
						<span className={styles.featuredKicker}>{t`FEATURED DROP`}</span>
						<span className={clsx(styles.rarityBadge, styles.featuredRarityBadge, rarityStyle(styles, item.rarity))}>
							{rarityLabel(item.rarity).toUpperCase()}
						</span>
					</div>

					<div className={styles.featuredName}>{item.name}</div>
					{item.description && <div className={styles.featuredDescription}>{item.description}</div>}

					<div className={styles.featuredPriceRow}>
						<span className={styles.featuredPrice}>◎ {priceSol}</span>
						<button type="button" className={styles.featuredBuyBtn} onClick={onBuy}>
							<Trans>BUY NOW</Trans>
						</button>
					</div>
				</div>

				<div className={styles.featuredNotes}>
					<span className={styles.featuredNoteLine}>{t`MINTED ON SOLANA`}</span>
					<span className={styles.featuredNoteLine}>{t`SUB-CENT NETWORK FEES`}</span>
				</div>
			</div>
		</div>
	);
};
