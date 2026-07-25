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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Multiverse.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * crypto-utils.ts — Client-Side E2EE Primitives (Phase 1)
 *
 * Encryption schema:
 *   Key derivation:
 *     1. User signs deterministic challenge with their Ed25519 Solana wallet.
 *     2. SHA-512(signature) → 64-byte seed material.
 *     3. First 32 bytes seeded into libsodium's Ed25519 keypair.
 *     4. Ed25519 keypair converted to X25519 (Curve25519) via birational map:
 *          u = (1 + y) / (1 - y) mod p
 *        Public: crypto_sign_ed25519_pk_to_curve25519(pk)
 *        Secret: crypto_sign_ed25519_sk_to_curve25519(sk)
 *
 *   Message sealing (sealMessage):
 *     - Generates a fresh ephemeral X25519 keypair per message.
 *     - Encrypts with nacl.box (X25519-XSalsa20-Poly1305):
 *         ciphertext = nacl.box(plaintext, nonce24, recipientPk, ephemeralSk)
 *     - Returns { ciphertext, nonce, ephemeralPublicKey } — all Base64.
 *     - The server stores only ciphertext + nonce + ephemeralPublicKey.
 *       It never receives or stores the plaintext.
 *
 *   Private key storage:
 *     - X25519 private key is encrypted with AES-256-GCM before IndexedDB storage.
 *     - Wrapping key = HKDF-SHA-256(sessionToken) — destroyed when user logs out.
 *     - encrypted_data (Base64) + nonce (Base64) are sent to the vault API so
 *       the user can recover their keypair on a new device after re-authentication.
 */

import sodium from 'libsodium-wrappers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ─── Key Conversion ────────────────────────────────────────────────────────

/**
 * Convert a raw 32-byte Ed25519 public key (e.g. from a Solana wallet) to a
 * 32-byte X25519 public key suitable for nacl.box DH key exchange.
 *
 * Uses libsodium's implementation of the birational map between Edwards25519
 * and Curve25519 (Montgomery form): u = (1 + y) / (1 - y) mod p.
 */
export async function ed25519PkToCurve25519(ed25519Pk: Uint8Array): Promise<Uint8Array> {
	await sodium.ready;
	return sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519Pk);
}

/**
 * Convert a 64-byte Ed25519 secret key (libsodium extended format: seed || pk)
 * to a 32-byte X25519 secret key for nacl.box.
 */
export async function ed25519SkToCurve25519(ed25519Sk: Uint8Array): Promise<Uint8Array> {
	await sodium.ready;
	return sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519Sk);
}

/**
 * Decode a base58-encoded Solana public key string to a raw 32-byte Uint8Array.
 * Accepts both base58 (wallet adapter default) and base64 encodings.
 */
export function decodeSolanaPublicKey(publicKeyStr: string): Uint8Array {
	try {
		const decoded = bs58.decode(publicKeyStr);
		if (decoded.length !== 32) throw new Error('Unexpected length');
		return decoded;
	} catch {
		// Fallback: try base64
		const bin = atob(publicKeyStr);
		return Uint8Array.from(bin, c => c.charCodeAt(0));
	}
}

// ─── Safe Base64 ───────────────────────────────────────────────────────────

function u8ToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

export function base64ToU8(b64: string): Uint8Array {
	const bin = atob(b64);
	return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ─── Message Sealing ───────────────────────────────────────────────────────

export interface SealedMessage {
	/** Base64-encoded NaCl box ciphertext (includes 16-byte Poly1305 MAC). */
	ciphertext: string;
	/** Base64-encoded 24-byte XSalsa20 nonce. */
	nonce: string;
	/**
	 * Base64-encoded 32-byte ephemeral X25519 public key.
	 * Required by the recipient to perform the DH exchange and decrypt.
	 * Safe to transmit publicly — ephemeral key reveals nothing about sender identity.
	 */
	ephemeralPublicKey: string;
}

/**
 * Encrypt a plaintext string for a specific recipient.
 *
 * Uses NaCl box (X25519-XSalsa20-Poly1305):
 *   - Generates a fresh random ephemeral X25519 keypair.
 *   - Derives shared secret: DH(ephemeralSk, recipientPk).
 *   - Encrypts+authenticates plaintext with XSalsa20-Poly1305.
 *
 * The server receives only the three opaque blobs in SealedMessage.
 * It has no access to the shared secret or the plaintext.
 *
 * @param plaintext          UTF-8 message text to encrypt.
 * @param recipientX25519Pk  Recipient's 32-byte X25519 public key.
 */
export function sealMessage(plaintext: string, recipientX25519Pk: Uint8Array): SealedMessage {
	const messageBytes = new TextEncoder().encode(plaintext);
	const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
	const ephemeralKp = nacl.box.keyPair();

	const ciphertext = nacl.box(messageBytes, nonce, recipientX25519Pk, ephemeralKp.secretKey);

	return {
		ciphertext: u8ToBase64(ciphertext),
		nonce: u8ToBase64(nonce),
		ephemeralPublicKey: u8ToBase64(ephemeralKp.publicKey),
	};
}

/**
 * Decrypt a SealedMessage using the recipient's X25519 secret key.
 *
 * Returns the plaintext string, or null if decryption/authentication fails
 * (tampered ciphertext, wrong key, replayed nonce, etc.).
 */
export function openMessage(sealed: SealedMessage, recipientX25519Sk: Uint8Array): string | null {
	try {
		const ciphertext = base64ToU8(sealed.ciphertext);
		const nonce = base64ToU8(sealed.nonce);
		const ephemeralPk = base64ToU8(sealed.ephemeralPublicKey);

		const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPk, recipientX25519Sk);
		if (!plaintext) return null;
		return new TextDecoder().decode(plaintext);
	} catch {
		return null;
	}
}

// ─── Private Key Wrapping for Vault Storage ────────────────────────────────

export interface WrappedPrivateKey {
	/**
	 * Base64-encoded AES-256-GCM ciphertext of the 32-byte X25519 private key.
	 * Server stores this opaque blob — plaintext key is never transmitted.
	 */
	encrypted_data: string;
	/** Base64-encoded 12-byte AES-GCM IV. */
	nonce: string;
}

/**
 * Encrypt a 32-byte X25519 private key with AES-256-GCM for vault storage.
 *
 * @param privateKeyBytes  The 32-byte X25519 private key.
 * @param wrappingKey      AES-256 CryptoKey derived from the user's session
 *                         via HKDF-SHA-256 (see VaultService.deriveWrappingKey).
 */
export async function wrapPrivateKey(
	privateKeyBytes: Uint8Array,
	wrappingKey: CryptoKey,
): Promise<WrappedPrivateKey> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, wrappingKey, new Uint8Array(privateKeyBytes));
	return {
		encrypted_data: u8ToBase64(new Uint8Array(ciphertext)),
		nonce: u8ToBase64(iv),
	};
}

/**
 * Decrypt an AES-256-GCM-wrapped X25519 private key.
 * Returns null if decryption fails (wrong key, tampered data).
 */
export async function unwrapPrivateKey(
	wrapped: WrappedPrivateKey,
	wrappingKey: CryptoKey,
): Promise<Uint8Array | null> {
	try {
		const iv = new Uint8Array(base64ToU8(wrapped.nonce));
		const ciphertext = base64ToU8(wrapped.encrypted_data);
		const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, wrappingKey, new Uint8Array(ciphertext));
		return new Uint8Array(plaintext);
	} catch {
		return null;
	}
}
