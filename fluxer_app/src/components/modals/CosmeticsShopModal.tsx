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

import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import styles from '@app/components/modals/CosmeticsShopModal.module.css';
import {BuySheet} from '@app/components/modals/cosmetics_shop/BuySheet';
import {CreatorPanel} from '@app/components/modals/cosmetics_shop/CreatorPanel';
import {FeaturedDropCard} from '@app/components/modals/cosmetics_shop/FeaturedDropCard';
import {RailNav} from '@app/components/modals/cosmetics_shop/RailNav';
import {ServerView} from '@app/components/modals/cosmetics_shop/ServerView';
import {ShopItemCard} from '@app/components/modals/cosmetics_shop/ShopItemCard';
import type {RarityFilter, ShopFilter, ShopView, TypeFilterOption} from '@app/components/modals/cosmetics_shop/types';
import {WalletChip} from '@app/components/modals/cosmetics_shop/WalletChip';
import {YourItemsView} from '@app/components/modals/cosmetics_shop/YourItemsView';
import * as Modal from '@app/components/modals/Modal';
import {Scroller} from '@app/components/uikit/Scroller';
import {Spinner} from '@app/components/uikit/Spinner';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import PermissionStore from '@app/stores/PermissionStore';
import SelectedGuildStore from '@app/stores/SelectedGuildStore';
import {compareRarity, PROFILE_SLOT_TYPES, SERVER_SLOT_TYPES, SLOT_LABELS} from '@app/utils/cosmetics/rarity';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {StoreListingNft} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {SparkleIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo, useState} from 'react';

export const CosmeticsShopModal: React.FC = observer(() => {
	const {t} = useLingui();
	const [view, setView] = useState<ShopView>('shop');
	const [filter, setFilter] = useState<ShopFilter>('all');
	const [typeFilter, setTypeFilter] = useState<string | null>(null);
	const [rarityFilter, setRarityFilter] = useState<RarityFilter>(null);
	const [buyingItem, setBuyingItem] = useState<StoreListingNft | null>(null);

	useEffect(() => {
		CosmeticsStore.loadStoreItems();
		// Fetch on every modal open (not just once per app session) so a wallet linked/unlinked
		// while the modal was closed doesn't leave CreatorPanel showing stale gate state.
		CosmeticsStore.loadCreatorStatus();
	}, []);

	const guildId = SelectedGuildStore.selectedGuildId;
	const canManageServerCosmetics = guildId != null && PermissionStore.can(Permissions.MANAGE_COSMETICS, {guildId});

	const handleClose = () => ModalActionCreators.pop();

	const handleFilterChange = (next: ShopFilter) => {
		setFilter(next);
		setTypeFilter(null);
	};

	const storeItems = CosmeticsStore.storeItems;

	const categoryItems = useMemo(() => {
		return storeItems.filter((item) => {
			if (filter === 'profile') return PROFILE_SLOT_TYPES.has(item.cosmetic_type);
			if (filter === 'server') return SERVER_SLOT_TYPES.has(item.cosmetic_type);
			return true;
		});
	}, [storeItems, filter]);

	const typeOptions = useMemo<Array<TypeFilterOption>>(() => {
		const counts = new Map<string, number>();
		for (const item of categoryItems) {
			counts.set(item.cosmetic_type, (counts.get(item.cosmetic_type) ?? 0) + 1);
		}
		return Array.from(counts.entries()).map(([type, count]) => ({
			type,
			label: (SLOT_LABELS[type] ?? type).toUpperCase(),
			count,
		}));
	}, [categoryItems]);

	const typeItems = useMemo(() => {
		if (!typeFilter) return categoryItems;
		return categoryItems.filter((item) => item.cosmetic_type === typeFilter);
	}, [categoryItems, typeFilter]);

	const rarityCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const item of typeItems) {
			counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
		}
		return counts;
	}, [typeItems]);

	const isUnfiltered = filter === 'all' && !typeFilter && !rarityFilter;

	const featuredItem = useMemo(() => {
		if (!isUnfiltered || storeItems.length === 0) return null;
		return [...storeItems].sort((a, b) => compareRarity(a.rarity, b.rarity) || b.price_lamports - a.price_lamports)[0];
	}, [isUnfiltered, storeItems]);

	const gridItems = useMemo(() => {
		const filtered = rarityFilter ? typeItems.filter((item) => item.rarity === rarityFilter) : typeItems;
		const withoutFeatured = featuredItem ? filtered.filter((item) => item.id !== featuredItem.id) : filtered;
		return [...withoutFeatured].sort((a, b) => compareRarity(a.rarity, b.rarity));
	}, [typeItems, rarityFilter, featuredItem]);

	const isLoading = CosmeticsStore.isLoadingStore;

	return (
		<Modal.Root size="large" className={styles.root} onClose={handleClose}>
			<Modal.ScreenReaderLabel text={t`Cosmetics Shop`} />
			<div className={styles.shell}>
				<div className={styles.header}>
					<div className={styles.headerLeft}>
						<span className={styles.headerKickerDot} />
						<span className={styles.headerKickerText}>{t`COSMETICS SHOP`}</span>
						<span className={styles.headerKickerSub}>{t`ON-CHAIN MARKETPLACE`}</span>
					</div>
					<div className={styles.headerRight}>
						<WalletChip />
						<button type="button" className={styles.closeBtn} onClick={handleClose} aria-label={t`Close`}>
							<XIcon size={18} weight="bold" />
						</button>
					</div>
				</div>

				<div className={styles.body}>
					<RailNav
						view={view}
						onViewChange={setView}
						canManageServerCosmetics={canManageServerCosmetics}
						filter={filter}
						onFilterChange={handleFilterChange}
						typeOptions={typeOptions}
						typeFilter={typeFilter}
						onTypeFilterChange={setTypeFilter}
						rarityCounts={rarityCounts}
						rarityFilter={rarityFilter}
						onRarityFilterChange={setRarityFilter}
					/>

					<div className={styles.main} role="tabpanel" id={`cosmetics-shop-panel-${view}`}>
						<div className={styles.gridWash} aria-hidden />
						<Scroller className={styles.mainScroll}>
							{view === 'shop' && (
								<div className={styles.mainInner}>
									{isLoading ? (
										<div className={styles.loadingContainer}>
											<Spinner />
										</div>
									) : storeItems.length === 0 ? (
										<div className={styles.emptyState}>
											<SparkleIcon size={48} weight="duotone" className={styles.emptyIcon} />
											<p className={styles.emptyTitle}>
												<Trans>Shop opening soon</Trans>
											</p>
											<p className={styles.emptyDescription}>
												<Trans>
													Cosmetic NFTs will be available to purchase here when the Multiverse collection launches.
													Check back soon!
												</Trans>
											</p>
											<span className={styles.emptyStatusLine}>{t`COLLECTION DEPLOYING · DEVNET LIVE`}</span>
										</div>
									) : (
										<>
											{featuredItem && (
												<FeaturedDropCard item={featuredItem} onBuy={() => setBuyingItem(featuredItem)} />
											)}

											<div className={styles.kickerRow}>
												<span className={styles.kickerLabel}>{t`ALL ITEMS`}</span>
												<span className={styles.kickerCount}>
													{gridItems.length} {t`ITEMS`}
												</span>
											</div>

											{gridItems.length > 0 ? (
												<div className={styles.itemGrid}>
													{gridItems.map((item) => (
														<ShopItemCard key={item.id} item={item} onSelect={setBuyingItem} />
													))}
												</div>
											) : (
												<div className={styles.emptyState}>
													<SparkleIcon size={40} weight="duotone" className={styles.emptyIcon} />
													<p className={styles.emptyTitle}>
														<Trans>No items match these filters</Trans>
													</p>
													<p className={styles.emptyDescription}>
														<Trans>Try clearing a filter in the rail to see more of the catalog.</Trans>
													</p>
												</div>
											)}
										</>
									)}
								</div>
							)}

							{view === 'creator' && (
								<div className={styles.mainInner}>
									<CreatorPanel />
								</div>
							)}

							{view === 'your_items' && <YourItemsView />}

							{view === 'server' && (canManageServerCosmetics && guildId ? <ServerView guildId={guildId} /> : null)}
						</Scroller>

						{buyingItem && <BuySheet item={buyingItem} onClose={() => setBuyingItem(null)} />}
					</div>
				</div>
			</div>
		</Modal.Root>
	);
});
