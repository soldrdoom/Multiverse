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
import {type CosmeticsInvoice, fetchCosmeticsInvoice, purchaseCosmetic} from '@app/services/cosmetics/CosmeticsService';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import {SLOT_LABELS} from '@app/utils/cosmetics/rarity';
import {isWalletRejectionError, payMultiSolTransfer} from '@app/utils/SolanaWalletPayment';
import type {StoreListingNft} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowSquareOutIcon, CheckIcon, StarIcon, WarningIcon, XIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;
/** Typical Solana base signature fee — informational display only, not itself a transfer instruction. */
const ESTIMATED_NETWORK_FEE_LAMPORTS = 5000;

type Phase = 'confirm' | 'paying' | 'verifying' | 'success' | 'success_pending_mint' | 'error';

function formatSol(lamports: number): string {
	return (lamports / LAMPORTS_PER_SOL).toFixed(lamports < LAMPORTS_PER_SOL / 100 ? 6 : 3);
}

function shortenAddress(address: string): string {
	if (address.length <= 10) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

interface BuySheetProps {
	item: StoreListingNft;
	onClose: () => void;
}

export const BuySheet: React.FC<BuySheetProps> = ({item, onClose}) => {
	const {t} = useLingui();
	const [phase, setPhase] = useState<Phase>('confirm');
	const [invoice, setInvoice] = useState<CosmeticsInvoice | null>(null);
	const [invoiceError, setInvoiceError] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [txSignature, setTxSignature] = useState<string | null>(null);

	const buyerAddress = SolanaWalletStore.walletAddress;
	const priceSol = (item.price_lamports / LAMPORTS_PER_SOL).toFixed(2);

	useEffect(() => {
		let cancelled = false;
		fetchCosmeticsInvoice(item.id)
			.then((inv) => {
				if (!cancelled) setInvoice(inv);
			})
			.catch((err: unknown) => {
				if (!cancelled) setInvoiceError(err instanceof Error ? err.message : t`Could not prepare this purchase.`);
			});
		return () => {
			cancelled = true;
		};
	}, [item.id, t]);

	const handleConfirm = async () => {
		if (!invoice || !buyerAddress) return;
		setPhase('paying');
		setErrorMessage(null);
		try {
			const signature = await payMultiSolTransfer({
				transfers: [
					{recipient: invoice.creator_wallet, lamports: invoice.creator_lamports},
					{recipient: invoice.platform_wallet, lamports: invoice.platform_lamports},
				],
				recentBlockhash: invoice.recent_blockhash,
			});
			setTxSignature(signature);
			setPhase('verifying');

			const response = await purchaseCosmetic(item.id, signature, buyerAddress, invoice.purchase_id);
			// `paid` is always true for a 200 response; `minted`/`nft` cover the
			// graceful-degradation case where the on-chain payment is verified but
			// this deployment has no mint authority configured yet (or the mint
			// attempt failed after payment cleared) — the payment is NOT rolled
			// back, so this is a distinct success state, not an error.
			setPhase(response.minted && response.nft ? 'success' : 'success_pending_mint');
			// Refresh via existing store loaders — purchased item disappears from
			// the shop grid (loadStoreItems) and appears in Your Items (loadOwnedNfts).
			void CosmeticsStore.loadStoreItems();
			void CosmeticsStore.loadOwnedNfts();
		} catch (err: unknown) {
			if (isWalletRejectionError(err)) {
				setPhase('confirm');
				return;
			}
			setErrorMessage(err instanceof Error ? err.message : t`Something went wrong during checkout.`);
			setPhase('error');
		}
	};

	const isSuccess = phase === 'success' || phase === 'success_pending_mint';

	return (
		<div className={styles.buySheetOverlay}>
			<div className={styles.buySheetCard}>
				{!isSuccess && (
					<div className={styles.buySheetHeader}>
						<div className={styles.buySheetItemRow}>
							{item.image ? (
								<img src={item.image} alt={item.name} className={styles.buySheetItemArt} />
							) : (
								<div className={styles.buySheetItemArt} />
							)}
							<div>
								<div className={styles.buySheetItemName}>{item.name}</div>
								<div className={styles.itemType}>{SLOT_LABELS[item.cosmetic_type] ?? item.cosmetic_type}</div>
							</div>
						</div>
						<button
							type="button"
							className={styles.buySheetClose}
							onClick={onClose}
							disabled={phase === 'paying' || phase === 'verifying'}
							aria-label={t`Close`}
						>
							<XIcon size={16} weight="bold" />
						</button>
					</div>
				)}

				{phase === 'confirm' && (
					<>
						{invoiceError ? (
							<p className={styles.buySheetErrorBox}>
								<WarningIcon weight="bold" size={16} /> {invoiceError}
							</p>
						) : !invoice ? (
							<div className={styles.loadingContainer}>
								<Spinner />
							</div>
						) : (
							<div className={styles.buySheetBreakdown}>
								<div className={styles.breakdownRow}>
									<span>{t`ITEM`}</span>
									<span className={styles.breakdownValue}>◎ {priceSol}</span>
								</div>
								<div className={styles.breakdownRow}>
									<span>{t`NETWORK FEE`}</span>
									<span className={styles.breakdownValue}>◎ {formatSol(ESTIMATED_NETWORK_FEE_LAMPORTS)}</span>
								</div>
								<div className={styles.breakdownRow}>
									<span>{t`CREATOR SHARE (90%)`}</span>
									<span className={styles.breakdownValue}>◎ {formatSol(invoice.creator_lamports)}</span>
								</div>
								<div className={styles.breakdownDivider} />
								<div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
									<span>{t`TOTAL`}</span>
									<span className={styles.breakdownValue}>
										◎ {formatSol(invoice.creator_lamports + invoice.platform_lamports + ESTIMATED_NETWORK_FEE_LAMPORTS)}
									</span>
								</div>
							</div>
						)}

						{buyerAddress && (
							<p className={styles.buySheetSigningNote}>
								{t`SIGNING WITH`} {shortenAddress(buyerAddress)}
							</p>
						)}

						<div className={styles.buySheetActions}>
							<button type="button" className={styles.btnOutline} onClick={onClose}>
								<Trans>CANCEL</Trans>
							</button>
							<button
								type="button"
								className={styles.btnSheen}
								onClick={() => void handleConfirm()}
								disabled={!invoice || !buyerAddress}
							>
								<Trans>CONFIRM & SIGN</Trans>
							</button>
						</div>
						{!buyerAddress && (
							<p className={styles.buySheetErrorBox}>
								<WarningIcon weight="bold" size={16} /> <Trans>Link a Solana wallet to your account first.</Trans>
							</p>
						)}
					</>
				)}

				{(phase === 'paying' || phase === 'verifying') && (
					<div className={styles.loadingContainer}>
						<Spinner />
						<p className={styles.buySheetSigningNote} style={{marginTop: 12}}>
							{phase === 'paying' ? <Trans>Waiting for wallet signature…</Trans> : <Trans>Confirming on-chain…</Trans>}
						</p>
					</div>
				)}

				{isSuccess && (
					<div className={styles.buySheetSuccess}>
						<div className={styles.successDisc}>
							<CheckIcon size={26} weight="bold" />
						</div>
						<div className={styles.successTitle}>
							{phase === 'success' ? (
								<Trans>Minted to your wallet</Trans>
							) : (
								<Trans>Payment confirmed — mint pending</Trans>
							)}
						</div>
						<p className={styles.successSubtitle}>
							{phase === 'success' ? (
								<Trans>{item.name} is now in Your Items.</Trans>
							) : (
								<Trans>
									Your SOL payment for {item.name} was confirmed on-chain. Minting isn't configured yet — the NFT will
									appear in Your Items once it is.
								</Trans>
							)}
						</p>
						{txSignature && (
							<a
								className={styles.txPill}
								href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
								target="_blank"
								rel="noreferrer noopener"
							>
								{shortenAddress(txSignature)} <ArrowSquareOutIcon size={12} weight="bold" />
							</a>
						)}
						<button type="button" className={styles.btnSheen} style={{marginTop: 8}} onClick={onClose}>
							<Trans>DONE</Trans>
						</button>
					</div>
				)}

				{phase === 'error' && (
					<div className={styles.buySheetSuccess}>
						<StarIcon size={32} weight="duotone" className={styles.emptyIcon} />
						<p className={styles.buySheetErrorBox}>
							<WarningIcon weight="bold" size={16} /> {errorMessage}
						</p>
						<div className={styles.buySheetActions}>
							<button type="button" className={styles.btnOutline} onClick={onClose}>
								<Trans>CLOSE</Trans>
							</button>
							<button type="button" className={styles.btnSheen} onClick={() => setPhase('confirm')}>
								<Trans>TRY AGAIN</Trans>
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
