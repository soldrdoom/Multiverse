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
import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import UserStore from '@app/stores/UserStore';
import {getApiErrorMessage} from '@app/utils/ApiErrorUtils';
import {getSolanaWalletProvider, uint8ArrayToBase64} from '@app/utils/solana/SolanaWalletProvider';
import type {User} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface LinkSolanaWalletResponse {
	solana_address: string;
}

/**
 * Proves ownership of the connected wallet to the backend (nonce + Ed25519 signature — the
 * same proof-of-ownership flow as SIWS login, see AuthLoginLayout.tsx's handleSolanaLogin)
 * and links it to the already-authenticated account. The backend is the source of truth:
 * this never sets SolanaWalletStore's address before the server confirms the signature.
 */
async function linkWalletToAccount(): Promise<string> {
	const provider = getSolanaWalletProvider();
	if (!provider) {
		throw new Error(
			'No Solana wallet detected. Please use Phantom, Solflare, Backpack, Coinbase Wallet, Magic Eden, or Jupiter.',
		);
	}

	await provider.connect();
	if (!provider.publicKey) throw new Error('Wallet connection did not return a public key');
	const address = provider.publicKey.toBase58();

	const nonceRes = await fetch('/api/auth/solana/nonce', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({address}),
	});
	if (!nonceRes.ok) throw new Error('Failed to request a signing nonce');
	const {nonce, message} = await nonceRes.json();

	let signature: string;
	let signedMessage: string | undefined;

	if (typeof provider.signIn === 'function') {
		const result = await provider.signIn({
			domain: window.location.host,
			address,
			statement: 'Sign in to Multiverse',
			uri: window.location.origin,
			version: '1',
			nonce,
			issuedAt: new Date().toISOString(),
			icon: 'https://multiverse.forum/web/logo.png',
		});
		signature = uint8ArrayToBase64(new Uint8Array(result.signature));
		signedMessage = uint8ArrayToBase64(new Uint8Array(result.signedMessage));
	} else {
		const msgBytes = new Uint8Array(new TextEncoder().encode(message));
		const result = await provider.signMessage(msgBytes);
		signature = uint8ArrayToBase64(new Uint8Array(result.signature));
		if (result.signedMessage) {
			signedMessage = uint8ArrayToBase64(new Uint8Array(result.signedMessage));
		}
	}

	const response = await http.post<LinkSolanaWalletResponse>(Endpoints.USER_SOLANA_WALLET, {
		address,
		signature,
		nonce,
		signedMessage,
	});
	return response.body.solana_address;
}

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
	const {t} = useLingui();
	// Identity — "does this account have a wallet linked" — comes from the account's own
	// profile (UserStore), NOT SolanaWalletStore (which only tracks whether a wallet
	// browser-extension is actively connected in *this* browser session, a separate concept
	// originally built for the NFT sticker picker). This is what makes the chip show the
	// account's real linked wallet on a fresh session, with no "connect" click required.
	const address = UserStore.getCurrentUser()?.solanaAddress ?? null;
	const [balance, setBalance] = useState<number | null>(null);
	const [isLinking, setIsLinking] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);

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

	const handleLinkWallet = useCallback(async () => {
		setIsLinking(true);
		setLinkError(null);
		try {
			const linkedAddress = await linkWalletToAccount();
			// Backend confirmed the signature and persisted the link. Reflect it in both:
			// - SolanaWalletStore, the reactive "wallet extension connected in this browser"
			//   state that other UI (e.g. the NFT sticker picker, Web3 & Identity menu) reads.
			// - UserStore, the account's own profile record — this is the source of truth
			//   WalletChip itself displays from, and there is no gateway USER_UPDATE dispatch
			//   for a wallet link, so this optimistic local patch is what makes the chip flip
			//   to "linked" immediately instead of only after the next full profile refetch.
			SolanaWalletStore.setConnectedAddress(linkedAddress);
			const currentUser = UserStore.getCurrentUser();
			if (currentUser) {
				UserStore.handleUserUpdate({id: currentUser.id, solana_address: linkedAddress} as User);
			}
			// CreatorPanel (a sibling in the shop modal, not an ancestor/descendant of this
			// component) gates on CosmeticsStore.creatorStatus.wallet_linked, fetched once on its
			// own mount from GET /creators/@me. That fetch happened before this link existed, so
			// without an explicit reload here the gate would keep showing "Link a Wallet First"
			// until the modal is closed and reopened. CosmeticsStore is a MobX singleton and
			// CreatorPanel is an observer, so this reaches it immediately as long as both are
			// mounted — no prop wiring or context needed.
			void CosmeticsStore.loadCreatorStatus();
		} catch (error) {
			setLinkError(getApiErrorMessage(error) ?? (error instanceof Error ? error.message : t`Failed to link wallet`));
		} finally {
			setIsLinking(false);
		}
	}, [t]);

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
				<button className={styles.walletChipLinkButton} disabled={isLinking} onClick={handleLinkWallet} type="button">
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
