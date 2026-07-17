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

import {useCallback, useEffect, useState} from 'react';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import {initializeVault, rehydrateVault} from '@app/services/vault/VaultService';
import type {VaultKeyPair} from '@app/services/vault/VaultService';
import VaultStore from '@app/stores/VaultStore';

export type VaultStatus = 'idle' | 'pending' | 'unlocked' | 'error';

export interface UseVaultReturn {
	/** Current status of the vault unlock flow. */
	status: VaultStatus;
	/** Set once unlocked — the derived X25519 keypair (base64 strings). */
	keyPair: VaultKeyPair | null;
	/** Human-readable error message when status === 'error'. */
	error: string | null;
	/** Trigger wallet signing → key derivation → backend registration → IndexedDB storage. */
	unlock: () => Promise<void>;
}

/**
 * useVault — Phase 1 E2EE identity vault hook.
 *
 * On mount it attempts to restore a previously derived private key from
 * IndexedDB.  If none is found the vault is initialized automatically —
 * Phantom prompts the user for a single deterministic signature.  Since
 * Solana wallet login is the only authentication method, the wallet is
 * always available and already linked to the account.
 */
export function useVault(): UseVaultReturn {
	const [status, setStatus] = useState<VaultStatus>('idle');
	const [keyPair, setKeyPair] = useState<VaultKeyPair | null>(null);
	const [error, setError] = useState<string | null>(null);

	const unlock = useCallback(async () => {
		const userId = AuthenticationStore.currentUserId;
		if (!userId) {
			setError('Not authenticated.');
			setStatus('error');
			return;
		}

		// Prefer Phantom; fall back to legacy window.solana.
		const provider = (window as any).phantom?.solana ?? (window as any).solana;
		if (!provider) {
			setError('No Solana wallet detected. Install Phantom to use the Identity Vault.');
			setStatus('error');
			return;
		}

		setStatus('pending');
		setError(null);

		try {
			if (!provider.isConnected) {
				await provider.connect();
			}

			// Derive and persist the vault key from a single deterministic wallet signature.
			// The wallet is always linked to the account (Solana is the only login method).
			const signFn = async (messageBytes: Uint8Array) => {
				const result = await provider.signMessage(messageBytes);
				return {signature: new Uint8Array(result.signature as ArrayLike<number>)};
			};

			const derived = await initializeVault(userId, signFn);
			setKeyPair(derived);
			VaultStore.setKeyPair(derived);
			setStatus('unlocked');
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			setStatus('error');
		}
	}, []);

	// On mount: attempt silent restore from IndexedDB.
	// If no key is found and the wallet is already connected (trusted site),
	// auto-trigger vault initialization so the user sees one sign prompt.
	useEffect(() => {
		const userId = AuthenticationStore.currentUserId;
		if (!userId) return;

		rehydrateVault(userId).then((restored) => {
			if (restored) {
				// Private key recovered and public key re-registered with the server.
				setKeyPair(restored);
				VaultStore.setKeyPair(restored);
				setStatus('unlocked');
			} else {
				// No key in IDB — always trigger vault setup so E2EE is established
				// immediately. If the wallet is not connected, Phantom will prompt the
				// user to connect as part of the signing flow.
				void unlock();
			}
		});
	}, [unlock]);

	return {status, keyPair, error, unlock};
}
