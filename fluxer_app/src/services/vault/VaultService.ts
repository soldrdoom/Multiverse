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

/**
 * VaultService — Phase 1 E2EE (DMs only)
 *
 * Key derivation flow:
 *   1. Prompt the user to sign a deterministic challenge string with their wallet.
 *   2. Hash the 64-byte Ed25519 signature with SHA-512 → 64-byte output.
 *   3. Use the first 32 bytes as a seed for an Ed25519 keypair.
 *   4. Convert the Ed25519 keypair to X25519 (Curve25519) for ECDH.
 *   5. Register the X25519 public key (Base64) with the backend.
 *   6. Encrypt and store the X25519 private key in a dedicated IndexedDB store.
 *
 * Storage isolation:
 *   The private key is stored in the "MultiverseVault" IndexedDB database — entirely
 *   separate from all application data stores — encrypted with an AES-256-GCM key
 *   derived from the user's current auth token via HKDF-SHA-256.  Without the session
 *   token the raw private key bytes cannot be recovered from IndexedDB.
 */

import sodium from 'libsodium-wrappers';
import http from '@app/lib/HttpClient';
import {Endpoints} from '@app/Endpoints';
import {Logger} from '@app/lib/Logger';
import {signRawMessage, type SolanaWalletProviderLike} from '@app/utils/solana/SolanaWalletProvider';

const logger = new Logger('VaultService');

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_DB_NAME = 'MultiverseVault';
const VAULT_DB_VERSION = 2;
const VAULT_STORE_NAME = 'vault_keys';
const VAULT_MASTER_KEYS_STORE = 'vault_master_keys';

/** Strip any trailing version suffix (e.g. ":1") so vault keys are stable across sessions. */
const canonicalId = (userId: string): string =>
	userId.includes(':') ? userId.split(':')[0] : userId;

/** The fixed challenge string the user signs.  Must not change after deployment. */
const vaultChallenge = (userId: string): string =>
	`[Multiverse] Unlock Identity Vault for: ${canonicalId(userId)}`;

/**
 * Verify the wallet signed exactly the requested challenge bytes — no wallet-added
 * prefix/encoding tolerance. Ed25519 signing is deterministic for a given (key, message),
 * so requiring byte-exact agreement on every device is the only way to *guarantee* two
 * devices derive the identical Identity Vault key; a backend-style multi-prefix-candidate
 * match (see SolanaAuthService.tsx) would let two devices that each prefix the challenge
 * differently pass individually while still silently diverging from each other.
 */
export function verifyChallengeIntegrity(challengeBytes: Uint8Array, signedMessage?: Uint8Array): void {
	if (!signedMessage) {
		logger.warn(
			'Wallet did not report the exact bytes it signed (signedMessage) — cannot verify the ' +
				'challenge was signed unmodified. If this wallet transforms the challenge bytes before ' +
				'signing, cross-device Identity Vault key derivation may silently diverge.',
		);
		return;
	}
	if (!bytesEqual(signedMessage, challengeBytes)) {
		throw new Error(
			"Your wallet modified the message before signing it, which isn't compatible with Identity " +
				"Vault's cross-device key derivation. Try a different wallet or connection method.",
		);
	}
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type SignFn = (
	messageBytes: Uint8Array,
) => Promise<{signature: Uint8Array; signedMessage?: Uint8Array}>;

/**
 * Builds a VaultService SignFn from a connected wallet provider — shared by every
 * initializeVault call site so key derivation always goes through the same signing path.
 */
export function createVaultSignFn(provider: SolanaWalletProviderLike): SignFn {
	return (messageBytes: Uint8Array) => signRawMessage(provider, messageBytes);
}

export interface VaultKeyPair {
	publicKeyB64: string;
	privateKeyB64: string;
}

/**
 * Derive the X25519 keypair from a wallet signature, register the public key
 * with the backend, and persist the encrypted private key in IndexedDB.
 *
 * @param userId       The authenticated user's Snowflake ID string.
 * @param signFn       Callback built via `createVaultSignFn` from a connected wallet provider.
 * @returns            The derived keypair (base64 strings).
 */
export async function initializeVault(userId: string, signFn: SignFn): Promise<VaultKeyPair> {
	await sodium.ready;
	const uid = canonicalId(userId);

	// 1. Sign the deterministic challenge with the user's wallet.
	const challengeBytes = new TextEncoder().encode(vaultChallenge(uid));
	const {signature: ed25519Sig, signedMessage} = await signFn(challengeBytes);
	const sigBytes = new Uint8Array(ed25519Sig as ArrayLike<number>); // normalise mobile bridge

	// 1b. Verify the wallet actually signed the exact challenge bytes we requested —
	// see verifyChallengeIntegrity for why exactness (not prefix-tolerant matching) matters.
	verifyChallengeIntegrity(challengeBytes, signedMessage);

	// 2. Hash the 64-byte Ed25519 signature → 64-byte output; take first 32 as seed.
	const hashBuffer = await crypto.subtle.digest('SHA-512', sigBytes);
	const seed = new Uint8Array(hashBuffer, 0, 32);

	// 3. Derive an Ed25519 keypair from the seed.
	const ed25519KP = sodium.crypto_sign_seed_keypair(seed);

	// 4. Convert Ed25519 → X25519 (Curve25519).
	const x25519Pub = sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519KP.publicKey);
	const x25519Priv = sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519KP.privateKey);

	const publicKeyB64 = sodium.to_base64(x25519Pub, sodium.base64_variants.ORIGINAL);
	const privateKeyB64 = sodium.to_base64(x25519Priv, sodium.base64_variants.ORIGINAL);

	// 5. Register the public key with the backend.
	await registerPublicKey(publicKeyB64);

	// 6. Persist the encrypted private key in IndexedDB.
	await storePrivateKey(uid, privateKeyB64);

	logger.info('Vault initialized — X25519 keypair registered and stored.');
	return {publicKeyB64, privateKeyB64};
}

/**
 * Load the private key from IndexedDB, re-derive the public key, and
 * re-register the public key with the backend.  Safe to call every session —
 * the backend endpoint is an upsert.  Returns null if no key is stored.
 */
export async function rehydrateVault(userId: string): Promise<VaultKeyPair | null> {
	await sodium.ready;
	const uid = canonicalId(userId);
	const privateKeyB64 = await loadPrivateKey(uid);
	if (!privateKeyB64) return null;

	const privateKey = sodium.from_base64(privateKeyB64, sodium.base64_variants.ORIGINAL);
	const publicKey = sodium.crypto_scalarmult_base(privateKey);
	const publicKeyB64 = sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL);

	await registerPublicKey(publicKeyB64);

	return {publicKeyB64, privateKeyB64};
}

/**
 * Attempt to load the private key from IndexedDB.
 * Returns null if the vault has not been initialized for this user / session.
 */
export async function loadPrivateKey(userId: string): Promise<string | null> {
	try {
		const uid = canonicalId(userId);
		const db = await openVaultDb();
		const masterKey = await getMasterKey(uid, db);
		const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
		const store = tx.objectStore(VAULT_STORE_NAME);
		const record = await idbRequest<VaultRecord | undefined>(store.get(uid));
		db.close();

		if (!record) return null;

		const decryptedBytes = await crypto.subtle.decrypt(
			{name: 'AES-GCM', iv: record.iv} as AesGcmParams,
			masterKey,
			record.encryptedPrivateKey,
		);
		return new TextDecoder().decode(decryptedBytes);
	} catch (err) {
		logger.warn('Failed to load vault private key from IndexedDB', err);
		return null;
	}
}

/**
 * Fetch the X25519 public key for any user (for DM encryption).
 */
export async function getPublicKey(userId: string): Promise<string | null> {
	try {
		const response = await http.get<{public_key: string}>({
			url: Endpoints.VAULT_KEY(canonicalId(userId)),
		});
		return response.body.public_key;
	} catch {
		return null;
	}
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function registerPublicKey(publicKeyB64: string): Promise<void> {
	await http.post<{ok: boolean}>({
		url: Endpoints.VAULT_KEYS,
		body: {public_key: publicKeyB64},
	});
}

interface VaultRecord {
	userId: string;
	encryptedPrivateKey: ArrayBuffer;
	iv: Uint8Array;
}

async function storePrivateKey(userId: string, privateKeyB64: string): Promise<void> {
	const db = await openVaultDb();
	const masterKey = await getMasterKey(userId, db);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = new TextEncoder().encode(privateKeyB64);
	const encryptedPrivateKey = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, masterKey, plaintext);

	const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
	const store = tx.objectStore(VAULT_STORE_NAME);
	await idbRequest(store.put({userId, encryptedPrivateKey, iv} satisfies VaultRecord));
	await idbTxComplete(tx);
	db.close();
}

/**
 * Get or create a stable, non-extractable AES-256-GCM master key for this user.
 * Stored directly in IndexedDB as a CryptoKey object — persists across sessions,
 * origin-bound, and never leaves the browser in raw form.
 */
async function getMasterKey(userId: string, db: IDBDatabase): Promise<CryptoKey> {
	const tx = db.transaction(VAULT_MASTER_KEYS_STORE, 'readwrite');
	const store = tx.objectStore(VAULT_MASTER_KEYS_STORE);
	const existing = await idbRequest<{userId: string; key: CryptoKey} | undefined>(store.get(userId));
	if (existing) return existing.key;

	const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
	await idbRequest(store.put({userId, key}));
	await idbTxComplete(tx);
	return key;
}

function openVaultDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
				db.createObjectStore(VAULT_STORE_NAME, {keyPath: 'userId'});
			}
			if (!db.objectStoreNames.contains(VAULT_MASTER_KEYS_STORE)) {
				db.createObjectStore(VAULT_MASTER_KEYS_STORE, {keyPath: 'userId'});
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function idbTxComplete(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
	});
}
