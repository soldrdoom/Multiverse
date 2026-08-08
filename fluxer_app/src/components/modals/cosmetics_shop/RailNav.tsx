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
import type {RarityFilter, ShopFilter, ShopView, TypeFilterOption} from '@app/components/modals/cosmetics_shop/types';
import {SettingsModalSidebarItem} from '@app/components/modals/shared/SettingsModalLayout';
import {Scroller} from '@app/components/uikit/Scroller';
import {RARITY_LABELS, RARITY_ORDER} from '@app/utils/cosmetics/rarity';
import {useLingui} from '@lingui/react/macro';
import type {Icon} from '@phosphor-icons/react';
import {HardDrivesIcon, PaintBrushIcon, StorefrontIcon, UserCircleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface RailNavProps {
	view: ShopView;
	onViewChange: (view: ShopView) => void;
	canManageServerCosmetics: boolean;
	// Shop-view-only filters
	filter: ShopFilter;
	onFilterChange: (filter: ShopFilter) => void;
	typeOptions: Array<TypeFilterOption>;
	typeFilter: string | null;
	onTypeFilterChange: (type: string | null) => void;
	rarityCounts: Record<string, number>;
	rarityFilter: RarityFilter;
	onRarityFilterChange: (rarity: RarityFilter) => void;
}

const NAV_ITEMS: Array<{view: ShopView; icon: Icon}> = [
	{view: 'shop', icon: StorefrontIcon},
	{view: 'creator', icon: PaintBrushIcon},
	{view: 'your_items', icon: UserCircleIcon},
	{view: 'server', icon: HardDrivesIcon},
];

export const RailNav: React.FC<RailNavProps> = observer(
	({
		view,
		onViewChange,
		canManageServerCosmetics,
		filter,
		onFilterChange,
		typeOptions,
		typeFilter,
		onTypeFilterChange,
		rarityCounts,
		rarityFilter,
		onRarityFilterChange,
	}) => {
		const {t} = useLingui();

		const navLabels: Record<ShopView, string> = {
			shop: t`Shop`,
			creator: t`Creator`,
			your_items: t`Your Items`,
			server: t`Server`,
		};

		return (
			<nav className={styles.rail} aria-label={t`Cosmetics shop sections`}>
				<Scroller className={styles.railScroll}>
					<div className={styles.railScrollInner}>
						<div className={styles.railNavList} role="tablist" aria-orientation="vertical">
							{NAV_ITEMS.map(({view: itemView, icon}) => {
								if (itemView === 'server' && !canManageServerCosmetics) return null;
								return (
									<SettingsModalSidebarItem
										key={itemView}
										label={navLabels[itemView]}
										icon={icon}
										iconWeight="bold"
										selected={view === itemView}
										onClick={() => onViewChange(itemView)}
										id={`cosmetics-shop-tab-${itemView}`}
										controlsId={`cosmetics-shop-panel-${itemView}`}
									/>
								);
							})}
						</div>

						{view === 'shop' && (
							<>
								<div className={styles.railSubKicker}>
									<span
										className={styles.railSubKickerDot}
										style={{background: 'var(--mv-green)', boxShadow: 'var(--glow-green-dot)'}}
									/>
									<span className={styles.railSubKickerLabel}>{t`Category`}</span>
								</div>
								<div className={styles.railChipRow}>
									{(['all', 'profile', 'server'] as const).map((f) => (
										<button
											key={f}
											type="button"
											className={clsx(styles.categoryChip, filter === f && styles.categoryChipActive)}
											onClick={() => onFilterChange(f)}
										>
											{f === 'all' ? t`All` : f === 'profile' ? t`Profile` : t`Server`}
										</button>
									))}
								</div>

								{typeOptions.length > 0 && (
									<>
										<div className={styles.railSubKicker}>
											<span
												className={styles.railSubKickerDot}
												style={{background: 'var(--shop-cyan)', boxShadow: '0 0 8px rgba(0,209,255,.4)'}}
											/>
											<span className={styles.railSubKickerLabel}>{t`Type`}</span>
										</div>
										<div className={styles.railChipCol}>
											{typeOptions.map((opt) => (
												<button
													key={opt.type}
													type="button"
													className={clsx(styles.typeChip, typeFilter === opt.type && styles.typeChipActive)}
													onClick={() => onTypeFilterChange(typeFilter === opt.type ? null : opt.type)}
												>
													<span className={styles.typeChipLabel}>{opt.label}</span>
													<span className={styles.typeChipCount}>{opt.count}</span>
												</button>
											))}
										</div>
									</>
								)}

								<div className={styles.railSubKicker}>
									<span
										className={styles.railSubKickerDot}
										style={{background: 'var(--mv-purple)', boxShadow: 'var(--glow-purple)'}}
									/>
									<span className={styles.railSubKickerLabel}>{t`Rarity`}</span>
								</div>
								<div className={styles.railChipCol}>
									{RARITY_ORDER.map((rarity) => (
										<button
											key={rarity}
											type="button"
											className={clsx(styles.rarityChip, rarityFilter === rarity && styles.rarityChipActive)}
											style={
												{
													'--rarity-chip-color':
														rarity === 'legendary' ? 'var(--mv-purple)' : `var(--rarity-${rarity})`,
												} as React.CSSProperties
											}
											onClick={() => onRarityFilterChange(rarityFilter === rarity ? null : rarity)}
										>
											<span
												className={clsx(styles.rarityChipDot, rarity === 'legendary' && styles.rarityChipDotLegendary)}
											/>
											<span className={styles.rarityChipLabel}>{RARITY_LABELS[rarity]}</span>
											<span className={styles.rarityChipCount}>{rarityCounts[rarity] ?? 0}</span>
										</button>
									))}
								</div>
							</>
						)}

						<div className={styles.railFooter}>
							{t`90% TO CREATORS`}
							<br />
							{t`MINTED ON SOLANA`}
							<br />
							{t`SUB-CENT FEES`}
						</div>
					</div>
				</Scroller>
			</nav>
		);
	},
);
