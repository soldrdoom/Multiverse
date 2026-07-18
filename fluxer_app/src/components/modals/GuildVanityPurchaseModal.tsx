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

import * as GuildActionCreators from '@app/actions/GuildActionCreators';
import type {GuildVanityInvoice} from '@app/actions/GuildActionCreators';
import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/GuildVanityPurchaseModal.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {Logger} from '@app/lib/Logger';
import {isWalletRejectionError, paySolTransfer} from '@app/utils/SolanaWalletPayment';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

const logger = new Logger('GuildVanityPurchaseModal');

interface GuildVanityPurchaseModalProps {
	guildId: string;
	onSuccess?: () => void;
}

export const GuildVanityPurchaseModal: React.FC<GuildVanityPurchaseModalProps> = observer(({guildId, onSuccess}) => {
	const {t} = useLingui();
	const [invoice, setInvoice] = useState<GuildVanityInvoice | null>(null);
	const [loadingInvoice, setLoadingInvoice] = useState(true);
	const [invoiceError, setInvoiceError] = useState<string | null>(null);

	const [paying, setPaying] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [payError, setPayError] = useState<string | null>(null);

	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let mounted = true;
		GuildActionCreators.createVanityPurchaseInvoice(guildId)
			.then((inv) => {
				if (mounted) setInvoice(inv);
			})
			.catch((err) => {
				logger.error('Failed to create invoice', err);
				if (mounted) setInvoiceError(t`Failed to create payment invoice. Please try again.`);
			})
			.finally(() => {
				if (mounted) setLoadingInvoice(false);
			});
		return () => {
			mounted = false;
		};
	}, [guildId, t]);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		};
	}, []);

	const handleCopy = () => {
		if (!invoice) return;
		void navigator.clipboard.writeText(invoice.merchant_wallet);
		setCopied(true);
		copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
	};

	const handlePay = async () => {
		if (!invoice) return;
		setPayError(null);
		setPaying(true);
		try {
			const signature = await paySolTransfer({
				recipient: invoice.merchant_wallet,
				amountLamports: invoice.amount_lamports,
				recentBlockhash: invoice.recent_blockhash,
			});
			logger.info('Transaction sent', {signature});
			setPaying(false);
			setVerifying(true);
			await GuildActionCreators.verifyVanityPurchase(guildId, invoice.purchase_id, signature);
			ModalActionCreators.pop();
			onSuccess?.();
		} catch (err: unknown) {
			if (isWalletRejectionError(err)) return;
			logger.error('Vanity purchase failed', err);
			const e = err as {body?: {message?: string}; message?: string; code?: string};
			if (e.code === 'wallet-not-found') {
				setPayError(t`No Solana wallet found. Please install Phantom or a compatible wallet extension.`);
			} else {
				setPayError(e.body?.message ?? e.message ?? t`Payment failed. Please try again.`);
			}
		} finally {
			setPaying(false);
			setVerifying(false);
		}
	};

	const isBusy = paying || verifying;

	return (
		<Modal.Root size="small" centered onClose={() => !isBusy && ModalActionCreators.pop()}>
			<Modal.Header title={t`Buy Permanent Vanity Link`} onClose={() => !isBusy && ModalActionCreators.pop()} />
			<Modal.Content>
				<div className={styles.container}>
					{loadingInvoice ? (
						<div className={styles.spinnerContainer}>
							<Spinner />
						</div>
					) : invoiceError ? (
						<p className={styles.error}>{invoiceError}</p>
					) : invoice ? (
						<>
							<div className={styles.priceCard}>
								<div className={styles.priceLabel}>
									<Trans>One-Time Payment</Trans>
								</div>
								<div className={styles.priceAmount}>
									${invoice.usd_amount.toFixed(2)} <span className={styles.priceCurrency}>USD</span>
								</div>
								<div className={styles.priceSol}>
									≈ {(invoice.amount_lamports / 1_000_000_000).toFixed(4)} SOL{' '}
									<span className={styles.priceRate}>
										(@ ${invoice.sol_price_usd.toLocaleString(undefined, {maximumFractionDigits: 2})}/SOL)
									</span>
								</div>
								<p className={styles.priceNote}>
									<Trans>Permanent for the lifetime of this server — SOL only, no subscription.</Trans>
								</p>
							</div>

							<div>
								<div className={styles.walletLabel}>
									<Trans>Send SOL to:</Trans>
								</div>
								<div className={styles.walletRow}>
									<span className={styles.walletAddress}>{invoice.merchant_wallet}</span>
									<Button type="button" variant="secondary" small compact onClick={handleCopy} disabled={isBusy}>
										{copied ? <Trans>Copied!</Trans> : <Trans>Copy Address</Trans>}
									</Button>
								</div>
							</div>

							{isBusy ? (
								<div className={styles.busyRow}>
									<Spinner />
									<span className={styles.busyText}>
										{paying ? <Trans>Waiting for wallet confirmation…</Trans> : <Trans>Verifying payment…</Trans>}
									</span>
								</div>
							) : (
								<Button type="button" onClick={() => void handlePay()} disabled={isBusy} className={styles.payButton}>
									<Trans>Pay with Solana wallet</Trans>
								</Button>
							)}

							{payError && <p className={styles.error}>{payError}</p>}
						</>
					) : null}
				</div>
			</Modal.Content>
			<Modal.Footer>
				<Button type="button" variant="secondary" onClick={() => ModalActionCreators.pop()} disabled={isBusy}>
					<Trans>Cancel</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});

export default GuildVanityPurchaseModal;
