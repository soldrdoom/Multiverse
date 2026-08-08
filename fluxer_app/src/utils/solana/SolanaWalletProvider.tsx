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

// Shared browser-wallet detection/connection helpers for Solana flows (SIWS login and
// in-app wallet linking). Deliberately dependency-light — no @solana/web3.js or
// wallet-adapter library on the client (bundle-size decision, see CLAUDE.md) — just the
// injected-provider / Wallet Standard registry conventions every Solana wallet supports.

export interface SolanaSignInResult {
	signature: ArrayLike<number>;
	signedMessage: ArrayLike<number>;
}

export interface SolanaSignMessageResult {
	signature: ArrayLike<number>;
	signedMessage?: ArrayLike<number>;
}

export interface SolanaWalletProviderLike {
	connect(): Promise<unknown>;
	signIn?(input: Record<string, unknown>): Promise<SolanaSignInResult>;
	signMessage(message: Uint8Array): Promise<SolanaSignMessageResult>;
	readonly publicKey: {toBase58(): string} | null;
}

/**
 * Detects an available Solana wallet in the current browser context: known injected
 * providers first (covers Phantom mobile in-app browser, which only exposes
 * `window.phantom.solana`), then falls back to the Wallet Standard registry so any
 * standard-compliant wallet (Jupiter, etc.) works without a per-wallet integration.
 *
 * Mirrors AuthLoginLayout.tsx's handleSolanaLogin detection exactly — keep the two in sync
 * if wallet support changes.
 */
export function getSolanaWalletProvider(): SolanaWalletProviderLike | null {
	const getWalletStandardProvider = (): SolanaWalletProviderLike | null => {
		try {
			const registered: Array<any> = [];
			// Apps dispatch wallet-standard:app-ready; wallets that are already initialized respond by calling register()
			window.dispatchEvent(
				new CustomEvent('wallet-standard:app-ready', {
					bubbles: false,
					cancelable: false,
					composed: false,
					detail: Object.freeze({register: (w: unknown) => registered.push(w)}),
				}),
			);
			// Prefer Jupiter by name; fall back to the first registered Solana wallet
			const wallet =
				registered.find((w) => w.name === 'Jupiter' && w.chains?.some((c: string) => c.startsWith('solana:'))) ??
				registered.find((w) => w.chains?.some((c: string) => c.startsWith('solana:')));
			if (!wallet) return null;

			let account: any = null;
			const provider: SolanaWalletProviderLike = {
				connect: async () => {
					const {accounts} = await wallet.features['standard:connect'].connect();
					account = accounts[0];
					if (!account) throw new Error('No accounts returned from wallet');
				},
				signIn: wallet.features['standard:signIn']
					? async (input: Record<string, unknown>) => {
							const [result] = await wallet.features['standard:signIn'].signIn(input);
							return result;
						}
					: undefined,
				signMessage: async (messageBytes: Uint8Array) => {
					const [result] = await wallet.features['solana:signMessage'].signMessage({
						account,
						message: messageBytes,
					});
					// signedMessage contains the exact bytes the wallet signed (may include prefix)
					return {signature: result.signature, signedMessage: result.signedMessage};
				},
				publicKey: null,
			};
			Object.defineProperty(provider, 'publicKey', {
				get: () => (account ? {toBase58: () => account.address} : null),
			});
			return provider;
		} catch {
			return null;
		}
	};

	const win = window as unknown as {
		phantom?: {solana?: SolanaWalletProviderLike};
		solana?: SolanaWalletProviderLike;
		solflare?: SolanaWalletProviderLike;
		coinbaseSolana?: SolanaWalletProviderLike;
		backpack?: {solana?: SolanaWalletProviderLike};
		magicEden?: {solana?: SolanaWalletProviderLike};
		station?: SolanaWalletProviderLike; // Jupiter Station mobile in-app browser
	};

	return (
		win.phantom?.solana ??
		win.solana ??
		win.solflare ??
		win.coinbaseSolana ??
		win.backpack?.solana ??
		win.magicEden?.solana ??
		win.station ??
		getWalletStandardProvider()
	);
}

/** Safe Uint8Array → base64: avoids spread-operator call-stack limits on mobile WebKit. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	const len = bytes.length;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
