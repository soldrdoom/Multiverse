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
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import VaultStore from '@app/stores/VaultStore';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, CopyIcon, LockKeyIcon, SignOutIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

function getSolanaProvider(): {publicKey?: {toBase58(): string}; disconnect(): Promise<void>; signMessage(msg: Uint8Array): Promise<{signature: Uint8Array}> } | null {
	const w = window as any;
	return w.phantom?.solana ?? w.solana ?? w.solflare ?? null;
}

// Balances are fetched through this deployment's own `/sol-balance/:address` route
// (fluxer_server's Routes.tsx, same-origin, unauthenticated) rather than hitting a
// public Solana RPC directly from the browser. Two reasons, both confirmed live:
//   1. Public RPC endpoints (api.mainnet-beta.solana.com, rpc.ankr.com) reject
//      cross-origin *browser* requests outright — api.mainnet-beta.solana.com returns
//      HTTP 403 "Access forbidden" the moment a request carries an `Origin` header
//      (verified: identical request succeeds with curl, fails the same way with an
//      `Origin: https://multiverse.forum` header added — this is not rate limiting,
//      it's a deterministic block on all browser-originated traffic). rpc.ankr.com's
//      public endpoint additionally 403s unconditionally ("API key is not allowed to
//      access blockchain") regardless of Origin — it requires a paid Ankr key we don't
//      have, so it was never a working fallback to begin with.
//   2. This also collapses the client back onto SolanaNetwork.tsx's single
//      SOLANA_RPC_URL (devnet/mainnet switch) instead of a hardcoded, independently
//      drifting endpoint list — the same array that has twice accidentally ended up
//      with a leaked Helius key hardcoded into it.
async function fetchSolBalance(address: string): Promise<number | null> {
	try {
		const res = await fetch(`/sol-balance/${encodeURIComponent(address)}`);
		if (!res.ok) return null;
		const json = await res.json();
		if (json.result?.value == null) return null;
		return json.result.value / LAMPORTS_PER_SOL;
	} catch {
		return null;
	}
}


export const Web3Modal: React.FC = observer(() => {
	const {t} = useLingui();

	// Wallet state — read from the persisted store, not the raw injected provider:
	// the provider only has `publicKey` populated after connect() runs in this page
	// session, but the store's address survives reloads.
	const address = SolanaWalletStore.walletAddress;
	const [balance, setBalance] = useState<number | null>(null);
	const [balanceLoading, setBalanceLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);

	// Vault state — read directly from VaultStore (managed globally by VaultBootstrap).
	const vaultUnlocked = VaultStore.isUnlocked;

	// Fetch SOL balance on mount
	useEffect(() => {
		if (!address) return;
		let cancelled = false;
		setBalanceLoading(true);
		fetchSolBalance(address).then((bal) => {
			if (cancelled) return;
			setBalance(bal);
			setBalanceLoading(false);
		});
		return () => {
			cancelled = true;
		};
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
