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

import '@google/model-viewer';
import emojiStyles from '@app/components/channel/EmojiPicker.module.css';
import gifStyles from '@app/components/channel/GifPicker.module.css';
import styles from '@app/components/channel/nft_sticker_picker/NftStickersPicker.module.css';
import {PickerEmptyState} from '@app/components/channel/shared/PickerEmptyState';
import {ExpressionPickerHeaderPortal} from '@app/components/popouts/ExpressionPickerPopout';
import {Scroller} from '@app/components/uikit/Scroller';
import {useSearchInputAutofocus} from '@app/hooks/useSearchInputAutofocus';
import {Platform} from '@app/lib/Platform';
import type {NftStickerRecord} from '@app/records/NftStickerRecord';
import NftStickerStore from '@app/stores/NftStickerStore';
import {Trans, useLingui} from '@lingui/react/macro';
import {
	ArrowClockwiseIcon,
	ImagesIcon,
	LinkBreakIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

// ── Sub-components ────────────────────────────────────────────────────────────

interface NftGridItemProps {
	nft: NftStickerRecord;
	onHover: (nft: NftStickerRecord | null) => void;
	onSelect: (nft: NftStickerRecord) => void;
}

const NftGridItem = ({nft, onHover, onSelect}: NftGridItemProps) => {
	const [imgError, setImgError] = useState(false);

	return (
		<button
			type="button"
			className={styles.nftItem}
			onMouseEnter={() => onHover(nft)}
			onMouseLeave={() => onHover(null)}
			onFocus={() => onHover(nft)}
			onBlur={() => onHover(null)}
			onTouchStart={() => onHover(nft)}
			onTouchEnd={() => onHover(null)}
			onTouchCancel={() => onHover(null)}
			onClick={() => onSelect(nft)}
			aria-label={nft.name}
		>
			{imgError ? (
				<div className={styles.nftImagePlaceholder}>
					<LinkBreakIcon weight="duotone" />
				</div>
			) : nft.mediaType === 'video' ? (
				<video
					src={nft.imageUrl}
					className={styles.nftImage}
					autoPlay
					loop
					muted
					playsInline
					onError={() => setImgError(true)}
				/>
			) : nft.mediaType === 'model' ? (
				// @ts-expect-error model-viewer is a web component without TS types in JSX
				<model-viewer
					src={nft.imageUrl}
					auto-rotate
					camera-controls
					style={{width: '100%', height: '100%'}}
				/>
			) : (
				<img
					src={nft.imageUrl}
					alt={nft.name}
					className={styles.nftImage}
					loading="lazy"
					onError={() => setImgError(true)}
				/>
			)}
			{nft.compressed && <span className={styles.compressedBadge}>cNFT</span>}
		</button>
	);
};

// ── Main component ────────────────────────────────────────────────────────────

interface NftStickersPickerProps {
	handleSelect: (nft: NftStickerRecord) => void;
}

export const NftStickersPicker = observer(({handleSelect}: NftStickersPickerProps) => {
	const {t} = useLingui();
	const [searchTerm, setSearchTerm] = useState('');
	const [hoveredNft, setHoveredNft] = useState<NftStickerRecord | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const {nfts, loading, error: fetchError, dasEnabled} = NftStickerStore;

	useEffect(() => {
		void NftStickerStore.fetchNfts();
	}, []);

	useSearchInputAutofocus(searchInputRef);

	const filteredNfts = NftStickerStore.search(searchTerm);

	const collectionEntries = useMemo(() => {
		const map = new Map<string, Array<NftStickerRecord>>();
		for (const nft of filteredNfts) {
			const key = nft.collection ?? t`Uncollected`;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(nft);
		}
		return Array.from(map.entries());
	}, [filteredNfts, t]);

	const handleNftSelect = useCallback(
		(nft: NftStickerRecord) => {
			handleSelect(nft);
		},
		[handleSelect],
	);

	const handleRefresh = useCallback(() => {
		NftStickerStore.invalidate();
		void NftStickerStore.fetchNfts();
	}, []);

	// ── 1. Fetch error ─────────────────────────────────────────────────────────

	if (fetchError && !loading) {
		return (
			<div className={gifStyles.gifPickerContainer}>
				<div className={gifStyles.gifPickerMain}>
					<div className={styles.centeredState}>
						<span className={styles.centeredStateIcon}>
							<WarningIcon weight="duotone" />
						</span>
						<p className={styles.centeredStateTitle}>
							<Trans>Unable to Load NFTs</Trans>
						</p>
						<p className={styles.centeredStateDescription}>{fetchError}</p>
						<button type="button" className={styles.connectButton} onClick={handleRefresh}>
							<Trans>Retry</Trans>
						</button>
					</div>
				</div>
			</div>
		);
	}

	// ── 2. Loading ─────────────────────────────────────────────────────────────

	if (loading) {
		return (
			<div className={gifStyles.gifPickerContainer}>
				<div className={gifStyles.gifPickerMain}>
					<PickerEmptyState icon={ImagesIcon} title={t`Loading your NFTs…`} description="" />
				</div>
			</div>
		);
	}

	// ── 3. Empty wallet ────────────────────────────────────────────────────────

	if (nfts.length === 0) {
		return (
			<div className={gifStyles.gifPickerContainer}>
				<div className={gifStyles.gifPickerMain}>
					<PickerEmptyState
						icon={ImagesIcon}
						title={t`No NFTs Found`}
						description={
							dasEnabled
								? t`No NFTs or cNFTs were found in your wallet.`
								: t`No traditional NFTs found. Compressed NFTs (cNFTs) require the server to be configured with a DAS-compatible RPC endpoint.`
						}
					/>
				</div>
				<div className={styles.walletFooter}>
					<button type="button" className={styles.refreshButton} onClick={handleRefresh} aria-label={t`Refresh NFTs`}>
						<ArrowClockwiseIcon size={14} />
					</button>
				</div>
			</div>
		);
	}

	// ── 4. NFT grid ────────────────────────────────────────────────────────────

	const isMobile = Platform.isMobileBrowser;

	return (
		<div className={emojiStyles.container}>
			<ExpressionPickerHeaderPortal>
				<div className={emojiStyles.header}>
					<div className={emojiStyles.searchBar}>
						<div className={emojiStyles.searchBarInner}>
							<input
								ref={searchInputRef}
								type="text"
								className={emojiStyles.searchBarInput}
								placeholder={t`Search NFTs…`}
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.currentTarget.value)}
								aria-label={t`Search NFTs`}
							/>
						</div>
					</div>
					{hoveredNft && (
						<span
							className={emojiStyles.inspectorText}
							style={{marginLeft: 8, flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
						>
							{hoveredNft.name}
						</span>
					)}
				</div>
			</ExpressionPickerHeaderPortal>

			<div className={emojiStyles.emojiPicker} style={{gridTemplateColumns: '1fr'}}>
				<div className={emojiStyles.bodyWrapper} style={{gridColumn: '1 / 2'}}>
					<div className={emojiStyles.emojiPickerListWrapper} role="presentation">
						<Scroller
							className={`${emojiStyles.list} ${emojiStyles.listWrapper}`}
							fade={false}
							key="nft-sticker-picker-scroller"
						>
							{collectionEntries.map(([collectionName, collectionNfts]) => (
								<div key={collectionName}>
									<div className={styles.collectionHeader}>{collectionName}</div>
									<div className={styles.nftGrid}>
										{collectionNfts.map((nft) => (
											<NftGridItem
												key={nft.mint}
												nft={nft}
												onHover={setHoveredNft}
												onSelect={handleNftSelect}
											/>
										))}
									</div>
								</div>
							))}
						</Scroller>

						{filteredNfts.length === 0 && searchTerm && (
							<div className={emojiStyles.emptyState}>
								<div className={emojiStyles.emptyStateInner}>
									<div className={emojiStyles.emptyIcon}>
										<ImagesIcon weight="duotone" />
									</div>
									<div className={emojiStyles.emptyLabel}>{t`No NFTs match your search`}</div>
								</div>
							</div>
						)}
					</div>
				</div>

				{!isMobile && (
					<div className={emojiStyles.inspector}>
						{hoveredNft && (
							<>
								{hoveredNft.mediaType === 'video' ? (
									<video src={hoveredNft.imageUrl} className={emojiStyles.inspectorEmoji} autoPlay loop muted playsInline />
								) : hoveredNft.mediaType === 'model' ? (
									// @ts-expect-error model-viewer is a web component without TS types in JSX
									<model-viewer src={hoveredNft.imageUrl} auto-rotate camera-controls style={{width: '100%', height: '160px'}} />
								) : (
									<img src={hoveredNft.imageUrl} alt={hoveredNft.name} className={emojiStyles.inspectorEmoji} />
								)}
								<span className={emojiStyles.inspectorText}>{hoveredNft.name}</span>
							</>
						)}
					</div>
				)}
			</div>

			<div className={styles.walletFooter}>
				<button type="button" className={styles.refreshButton} onClick={handleRefresh} aria-label={t`Refresh NFTs`}>
					<ArrowClockwiseIcon size={14} />
				</button>
			</div>
		</div>
	);
});
