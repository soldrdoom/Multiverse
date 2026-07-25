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

import {makePersistent} from '@app/lib/MobXPersistence';
import {makeAutoObservable} from 'mobx';

interface WalletPublicKey {
	toBase58(): string;
}

interface SolanaWalletProvider {
	isPhantom?: boolean;
	publicKey?: WalletPublicKey;
	connect(opts?: {onlyIfTrusted?: boolean}): Promise<{publicKey: WalletPublicKey}>;
	disconnect(): Promise<void>;
}

/**
 * Global store for Solana wallet connection state.
 *
 * Persists the wallet address across sessions so the NFT sticker picker
 * does not require reconnecting on every page load.
 *
 * Supports Phantom, Solflare, and any injected window.solana provider.
 */
class SolanaWalletStore {
	walletAddress: string | null = null;
	isConnecting = false;
	error: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'SolanaWalletStore', ['walletAddress']);
	}

	get isConnected(): boolean {
		return this.walletAddress !== null;
	}

	/**
	 * Records an address that was already connected/authenticated elsewhere (e.g. by the
	 * Sign-In With Solana flow, which talks to the injected wallet provider directly and
	 * doesn't go through `connect()` above). Keeps this store — the single reactive source
	 * other UI like the Web3 & Identity side menu reads "wallet connected" state from — in
	 * sync with SIWS instead of requiring a redundant connection here.
	 */
	setConnectedAddress(address: string): void {
		this.walletAddress = address;
		this.error = null;
	}

	private getProvider(): SolanaWalletProvider | null {
		const win = window as unknown as {
			phantom?: {solana?: SolanaWalletProvider};
			solana?: SolanaWalletProvider;
			solflare?: SolanaWalletProvider;
		};
		return win.phantom?.solana ?? win.solana ?? win.solflare ?? null;
	}

	async connect(): Promise<void> {
		const provider = this.getProvider();
		if (!provider) {
			this.error = 'No Solana wallet detected. Please install Phantom or Solflare.';
			return;
		}

		this.isConnecting = true;
		this.error = null;

		try {
			const result = await provider.connect();
			this.walletAddress = result.publicKey.toBase58();
		} catch (e: unknown) {
			this.error = e instanceof Error ? e.message : 'Connection rejected';
		} finally {
			this.isConnecting = false;
		}
	}

	disconnect(): void {
		this.getProvider()
			?.disconnect()
			.catch(() => {});
		this.walletAddress = null;
		this.error = null;
	}
}

export default new SolanaWalletStore();
