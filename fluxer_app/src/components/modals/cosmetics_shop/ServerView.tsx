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
import AuthenticationStore from '@app/stores/AuthenticationStore';
import GuildStore from '@app/stores/GuildStore';
import {rarityStyle} from '@app/utils/cosmetics/rarity';
import type {ServerCosmeticSlot} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {PaintBucketIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const SERVER_SLOTS: Array<{slot: ServerCosmeticSlot; label: string}> = [
	{slot: 'chat_background', label: 'Chat Background'},
	{slot: 'channel_list_background', label: 'Channel List BG'},
];

interface ServerViewProps {
	guildId: string;
}

export const ServerView: React.FC<ServerViewProps> = observer(({guildId}) => {
	const {t} = useLingui();
	const {savingSlot, isLoading, currentMint, nftsForSlot, applySlot, clearSlot} = useCosmeticSlotEquip(guildId);
	const guild = GuildStore.getGuild(guildId);
	const isOwner = guild?.ownerId === AuthenticationStore.currentUserId;

	return (
		<div className={styles.mainInner}>
			<div className={styles.kickerRow}>
				<span className={styles.kickerLabel}>
					{(guild?.name ?? t`THIS SERVER`).toUpperCase()} {t`· SERVER COSMETICS`}
				</span>
				<span className={styles.ownerPill}>{isOwner ? t`OWNER` : t`MANAGER`}</span>
			</div>
			<p className={styles.serverExplainer}>
				<Trans>Apply cosmetic NFTs from your wallet to customize how this server looks for every member.</Trans>
			</p>

			{isLoading ? (
				<div className={styles.loadingContainer}>
					<Spinner />
				</div>
			) : (
				<div className={styles.serverSlots}>
					{SERVER_SLOTS.map(({slot, label}) => {
						const mint = currentMint(slot);
						const owned = nftsForSlot(slot);
						const currentNft = owned.find((n) => n.mint === mint) ?? null;
						const isSaving = savingSlot === slot;

						return (
							<div key={slot} className={styles.serverSlotRow}>
								<div className={styles.serverSlotTop}>
									{currentNft?.image ? (
										<img src={currentNft.image} alt={currentNft.name} className={styles.serverSlotThumb} />
									) : (
										<div className={styles.serverSlotThumbEmpty} />
									)}
									<div className={styles.serverSlotInfo}>
										<span className={styles.serverSlotLabel}>{label.toUpperCase()}</span>
										<span className={clsx(styles.serverSlotName, !currentNft && styles.serverSlotNameEmpty)}>
											{currentNft ? currentNft.name : t`Empty slot`}
										</span>
									</div>
									{mint && (
										<button
											type="button"
											className={styles.serverClearBtn}
											disabled={isSaving}
											onClick={() => void clearSlot(slot)}
										>
											{isSaving ? <Spinner size="small" /> : <Trans>CLEAR</Trans>}
										</button>
									)}
								</div>

								{owned.length > 0 && (
									<>
										<div className={styles.serverSlotDivider} />
										<div className={styles.serverOptionsRow}>
											{owned.map((nft) => (
												<button
													key={nft.mint}
													type="button"
													className={clsx(styles.serverOptionDot, nft.mint === mint && styles.serverOptionDotActive)}
													disabled={isSaving}
													onClick={() => void applySlot(slot, nft.mint)}
												>
													{nft.image ? (
														<img src={nft.image} alt="" className={styles.serverOptionSwatch} />
													) : (
														<PaintBucketIcon size={10} weight="bold" />
													)}
													{nft.name}
												</button>
											))}
										</div>
									</>
								)}

								{owned.length === 0 && !currentNft && (
									<span
										className={clsx(styles.rarityBadge, rarityStyle(styles, 'common'))}
										style={{alignSelf: 'flex-start'}}
									>
										{t`NONE OWNED`}
									</span>
								)}
							</div>
						);
					})}
				</div>
			)}

			<p className={styles.serverFooterNote}>
				{t`ONLY THE SERVER OWNER CAN CHANGE THESE · MEMBERS SEE CHANGES INSTANTLY`}
			</p>
		</div>
	);
});
