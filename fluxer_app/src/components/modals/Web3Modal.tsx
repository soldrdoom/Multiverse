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

import * as AuthenticationActionCreators from '@app/actions/AuthenticationActionCreators';
import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/Web3Modal.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import VaultStore from '@app/stores/VaultStore';
import UserStore from '@app/stores/UserStore';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, CopyIcon, LockKeyIcon, SignOutIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOLANA_RPC_ENDPOINTS = [
	'https://mainnet.helius-rpc.com/?api-key=da09865b-ac23-4449-a4f7-4b440c93d9ed',
	'https://rpc.ankr.com/solana',
	'https://api.mainnet-beta.solana.com',
];

function getSolanaProvider(): {publicKey?: {toBase58(): string}; disconnect(): Promise<void>; signMessage(msg: Uint8Array): Promise<{signature: Uint8Array}> } | null {
	const w = window as any;
	return w.phantom?.solana ?? w.solana ?? w.solflare ?? null;
}

async function fetchSolBalance(address: string): Promise<number | null> {
	const body = JSON.stringify({
		jsonrpc: '2.0',
		id: 1,
		method: 'getBalance',
		params: [address, {commitment: 'confirmed'}],
	});
	for (const endpoint of SOLANA_RPC_ENDPOINTS) {
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body,
			});
			if (!res.ok) continue;
			const json = await res.json();
			if (json.result?.value == null) continue;
			return json.result.value / LAMPORTS_PER_SOL;
		} catch {
			// try next endpoint
		}
	}
	return null;
}


export const Web3Modal: React.FC = observer(() => {
	const {t} = useLingui();

	// Wallet state
	const provider = getSolanaProvider();
	const address: string | null = provider?.publicKey?.toBase58() ?? null;
	const [balance, setBalance] = useState<number | null>(null);
	const [balanceLoading, setBalanceLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);

	// Vault state — read directly from VaultStore (managed globally by VaultBootstrap).
	const vaultUnlocked = VaultStore.isUnlocked;

	// Fetch SOL balance on mount
	useEffect(() => {
		if (!address) return;
		setBalanceLoading(true);
		fetchSolBalance(address).then((bal) => {
			setBalance(bal);
			setBalanceLoading(false);
		});
	}, [address]);

	const handleCopy = useCallback(() => {
		if (!address) return;
		navigator.clipboard.writeText(address).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [address]);

	const handleDisconnect = useCallback(async () => {
		setDisconnecting(true);
		try {
			await getSolanaProvider()?.disconnect();
		} catch {
			// ignore
		}
		ModalActionCreators.pop();
		await AuthenticationActionCreators.logout();
	}, []);

	return (
		<Modal.Root>
			<Modal.Header title={t`Web3 & Identity`} />
			<Modal.Content>

				{/* ── Wallet ──────────────────────────────────────────────── */}
				<div className={styles.section}>
					<p className={styles.sectionTitle}>
						<Trans>Connected Wallet</Trans>
					</p>

					{address ? (
						<div className={styles.card}>
							<div className={styles.addressRow}>
								<span className={styles.addressLabel}>
									<Trans>Address</Trans>
								</span>
								<span className={styles.addressValue} title={address}>
									{address}
								</span>
								<button
									type="button"
									className={styles.copyButton}
									onClick={handleCopy}
									aria-label={t`Copy wallet address`}
								>
									<CopyIcon size={14} weight="bold" />
								</button>
								{copied && (
									<span style={{fontSize: 11, color: 'var(--text-positive)'}}>
										<Trans>Copied!</Trans>
									</span>
								)}
							</div>

							<div className={styles.balanceRow}>
								{balanceLoading ? (
									<span className={styles.balanceLoading}>
										<Trans>Loading balance…</Trans>
									</span>
								) : balance !== null ? (
									<>
										<span className={styles.balanceAmount}>{balance.toFixed(4)}</span>
										<span className={styles.balanceCurrency}>SOL</span>
									</>
								) : (
									<span className={styles.balanceLoading}>
										<Trans>Balance unavailable</Trans>
									</span>
								)}
							</div>

							<div className={styles.disconnectRow}>
								<Button
									variant="danger-primary"
									small
									onClick={handleDisconnect}
									disabled={disconnecting}
								>
									{disconnecting ? (
										<Spinner size="small" />
									) : (
										<>
											<SignOutIcon size={14} weight="bold" style={{marginRight: 6}} />
											<Trans>Disconnect & Sign Out</Trans>
										</>
									)}
								</Button>
							</div>
						</div>
					) : (
						<p className={styles.noWallet}>
							<Trans>No wallet connected. Sign in with Solana to use Web3 features.</Trans>
						</p>
					)}
				</div>

				<hr className={styles.divider} />

				{/* ── End-to-End Encryption ────────────────────────────────── */}
				<div className={styles.section}>
					<p className={styles.sectionTitle}>
						<Trans>End-to-End Encryption</Trans>
					</p>

					<div className={styles.vaultCard}>
						<div className={styles.vaultCardIcon}>
							{vaultUnlocked ? (
								<CheckCircleIcon size={28} weight="duotone" className={styles.iconActive} />
							) : (
								<LockKeyIcon size={28} weight="duotone" className={styles.iconInactive} />
							)}
						</div>

						<div className={styles.vaultCardBody}>
							{vaultUnlocked ? (
								<>
									<p className={styles.vaultStatusLabel}>
										<Trans>E2EE active</Trans>
									</p>
									<p className={styles.vaultStatusDesc}>
										<Trans>
											All your direct messages are end-to-end encrypted. Only you and your
											recipient can read them.
										</Trans>
									</p>
								</>
							) : (
								<>
									<p className={styles.vaultStatusLabel}>
										<Trans>E2EE setting up…</Trans>
									</p>
									<p className={styles.vaultStatusDesc}>
										<Trans>
											Encryption is being initialized. Approve the signature request in your
											wallet to complete setup.
										</Trans>
									</p>
								</>
							)}
						</div>
					</div>
				</div>

			</Modal.Content>
		</Modal.Root>
	);
});
