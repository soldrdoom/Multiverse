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
import * as UserTipActionCreators from '@app/actions/UserTipActionCreators';
import type {UserTipTarget} from '@app/actions/UserTipActionCreators';
import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/TipUserModal.module.css';
import {Input} from '@app/components/form/Input';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {Logger} from '@app/lib/Logger';
import {isWalletRejectionError, payMultiSolTransfer} from '@app/utils/SolanaWalletPayment';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

const logger = new Logger('TipUserModal');

const LAMPORTS_PER_SOL = 1_000_000_000;

interface TipUserModalProps {
	userId: string;
	displayName: string;
}

function parseSolAmount(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const value = Number(trimmed);
	if (!Number.isFinite(value) || value <= 0) return null;
	return value;
}

export const TipUserModal: React.FC<TipUserModalProps> = observer(({userId, displayName}) => {
	const {t} = useLingui();
	const [target, setTarget] = useState<UserTipTarget | null>(null);
	const [loadingTarget, setLoadingTarget] = useState(true);
	const [targetError, setTargetError] = useState<string | null>(null);

	const [amountInput, setAmountInput] = useState('');
	const [paying, setPaying] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [payError, setPayError] = useState<string | null>(null);
	const [sentSignature, setSentSignature] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		UserTipActionCreators.fetchTipTarget(userId)
			.then((t) => {
				if (mounted) setTarget(t);
			})
			.catch((err) => {
				logger.error('Failed to fetch tip target', err);
				const e = err as {body?: {message?: string}; message?: string};
				if (mounted) setTargetError(e.body?.message ?? e.message ?? t`Unable to load this user's wallet. Please try again.`);
			})
			.finally(() => {
				if (mounted) setLoadingTarget(false);
			});
		return () => {
			mounted = false;
		};
	}, [userId, t]);

	const amount = parseSolAmount(amountInput);
	const amountLamports = amount !== null ? Math.round(amount * LAMPORTS_PER_SOL) : null;

	const handlePay = async () => {
		if (!target || amountLamports === null || amountLamports <= 0) return;
		setPayError(null);
		setPaying(true);
		try {
			const signature = await payMultiSolTransfer({
				transfers: [
					{recipient: target.recipient_wallet, lamports: amountLamports},
					{recipient: target.platform_wallet, lamports: target.fee_lamports},
				],
				recentBlockhash: target.recent_blockhash,
			});
			logger.info('Tip transaction sent', {signature});
			setPaying(false);
			setVerifying(true);
			await UserTipActionCreators.verifyTip(userId, signature);
			setSentSignature(signature);
		} catch (err: unknown) {
			if (isWalletRejectionError(err)) return;
			logger.error('Tip failed', err);
			const e = err as {body?: {message?: string}; message?: string; code?: string};
			if (e.code === 'wallet-not-found') {
				setPayError(t`No Solana wallet found. Please install Phantom or a compatible wallet extension.`);
			} else {
				setPayError(e.body?.message ?? e.message ?? t`Tip failed. Please try again.`);
			}
		} finally {
			setPaying(false);
			setVerifying(false);
		}
	};

	const isBusy = paying || verifying;
	const feeSol = target ? target.fee_lamports / LAMPORTS_PER_SOL : 0;

	return (
		<Modal.Root size="small" centered onClose={() => !isBusy && ModalActionCreators.pop()}>
			<Modal.Header
				title={t`Send SOL to ${displayName}`}
				onClose={() => !isBusy && ModalActionCreators.pop()}
			/>
			<Modal.Content>
				<div className={styles.container}>
					{loadingTarget ? (
						<div className={styles.spinnerContainer}>
							<Spinner />
						</div>
					) : targetError ? (
						<p className={styles.error}>{targetError}</p>
					) : target ? (
						sentSignature ? (
							<div className={styles.successCard}>
								<div className={styles.successTitle}>
									<Trans>Tip sent!</Trans>
								</div>
								<p className={styles.successText}>
									<Trans>Your SOL is on its way to {displayName}.</Trans>
								</p>
								<a
									href={`https://solscan.io/tx/${sentSignature}`}
									target="_blank"
									rel="noreferrer"
									className={styles.solscanLink}
								>
									<Trans>View transaction on Solscan</Trans>
								</a>
							</div>
						) : (
							<>
								<Input
									type="text"
									inputMode="decimal"
									label={t`Amount (SOL)`}
									placeholder="0.10"
									value={amountInput}
									onChange={(e) => setAmountInput(e.currentTarget.value)}
									disabled={isBusy}
									autoFocus
								/>

								<div className={styles.feeNotice}>
									<Trans>
										Multiverse adds a tiny platform fee — ${target.fee_usd.toFixed(2)} (≈ {feeSol.toFixed(6)} SOL) — on
										top of your tip, similar to network gas fees.
									</Trans>
								</div>

								{isBusy ? (
									<div className={styles.busyRow}>
										<Spinner />
										<span className={styles.busyText}>
											{paying ? <Trans>Waiting for wallet confirmation…</Trans> : <Trans>Verifying payment…</Trans>}
										</span>
									</div>
								) : (
									<Button
										type="button"
										onClick={() => void handlePay()}
										disabled={amountLamports === null || amountLamports <= 0}
										className={styles.payButton}
									>
										<Trans>Send with Solana wallet</Trans>
									</Button>
								)}

								{payError && <p className={styles.error}>{payError}</p>}
							</>
						)
					) : null}
				</div>
			</Modal.Content>
			<Modal.Footer>
				<Button type="button" variant="secondary" onClick={() => ModalActionCreators.pop()} disabled={isBusy}>
					{sentSignature ? <Trans>Done</Trans> : <Trans>Cancel</Trans>}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});

export default TipUserModal;
