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
import {useLinkWallet} from '@app/hooks/cosmetics/useLinkWallet';
import UserStore from '@app/stores/UserStore';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

// Same-origin balance route as Web3Modal.tsx's fetchSolBalance — public RPC
// endpoints reject browser-originated (Origin-header) requests outright, so
// this deployment proxies through its own unauthenticated `/sol-balance/:address`
// route instead of hitting a Solana RPC directly from the client.
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

function shortenAddress(address: string): string {
	if (address.length <= 10) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export const WalletChip: React.FC = observer(() => {
	// Identity — "does this account have a wallet linked" — comes from the account's own
	// profile (UserStore), NOT SolanaWalletStore (which only tracks whether a wallet
	// browser-extension is actively connected in *this* browser session, a separate concept
	// originally built for the NFT sticker picker). This is what makes the chip show the
	// account's real linked wallet on a fresh session, with no "connect" click required.
	const address = UserStore.getCurrentUser()?.solanaAddress ?? null;
	const [balance, setBalance] = useState<number | null>(null);
	const {isLinking, linkError, linkWallet} = useLinkWallet();

	useEffect(() => {
		if (!address) return;
		let cancelled = false;
		fetchSolBalance(address).then((bal) => {
			if (!cancelled) setBalance(bal);
		});
		return () => {
			cancelled = true;
		};
	}, [address]);

	if (!address) {
		return (
			<div className={styles.walletChip}>
				{linkError ? (
					<span className={styles.walletChipLinkError} title={linkError}>
						{linkError}
					</span>
				) : (
					<span className={styles.walletChipDisconnected}>
						<Trans>No wallet linked</Trans>
					</span>
				)}
				<button
					className={styles.walletChipLinkButton}
					disabled={isLinking}
					onClick={() => void linkWallet()}
					type="button"
				>
					{isLinking ? <Trans>Linking…</Trans> : <Trans>Link Wallet</Trans>}
				</button>
			</div>
		);
	}

	return (
		<div className={styles.walletChip} title={address}>
			<span className={styles.walletChipBalance}>◎ {balance != null ? balance.toFixed(2) : '—'}</span>
			<span className={styles.walletChipDivider}>|</span>
			<span className={styles.walletChipAddress}>{shortenAddress(address)}</span>
		</div>
	);
});
