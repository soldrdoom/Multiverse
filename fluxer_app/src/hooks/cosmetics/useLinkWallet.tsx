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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import UserStore from '@app/stores/UserStore';
import {getApiErrorMessage} from '@app/utils/ApiErrorUtils';
import {getSolanaWalletProvider, uint8ArrayToBase64} from '@app/utils/solana/SolanaWalletProvider';
import type {User} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useState} from 'react';

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

export interface UseLinkWalletResult {
	/** True while a link attempt (connect → nonce → sign → verify) is in flight. */
	isLinking: boolean;
	/** Error from the most recent failed link attempt, or null. */
	linkError: string | null;
	/** Runs the full link flow and syncs the result into SolanaWalletStore/UserStore. */
	linkWallet: () => Promise<void>;
}

/**
 * Shared non-visual logic behind every "link a Solana wallet to this account" CTA in the
 * shop modal (header WalletChip, CreatorPanel's gate, BuySheet's gate). Extracted from
 * WalletChip.tsx, which originally owned this as its own handleLinkWallet callback — moved
 * here so CreatorPanel/BuySheet can reuse the exact same flow instead of duplicating it.
 */
export function useLinkWallet(): UseLinkWalletResult {
	const {t} = useLingui();
	const [isLinking, setIsLinking] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);

	const linkWallet = useCallback(async () => {
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
			// CosmeticsStore.creatorStatus (CreatorPanel's gate) is now also kept live by a
			// reaction on UserStore's solanaAddress in CosmeticsStore's own constructor, so this
			// explicit reload is belt-and-suspenders rather than the only mechanism — kept here
			// so the refetch fires the instant this promise resolves rather than waiting a tick
			// for the reaction to observe the UserStore change above.
			void CosmeticsStore.loadCreatorStatus();
		} catch (error) {
			setLinkError(getApiErrorMessage(error) ?? (error instanceof Error ? error.message : t`Failed to link wallet`));
		} finally {
			setIsLinking(false);
		}
	}, [t]);

	return {isLinking, linkError, linkWallet};
}
