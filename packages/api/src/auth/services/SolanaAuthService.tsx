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

import {createUserID} from '@fluxer/api/src/BrandedTypes';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {UserSettings} from '@fluxer/api/src/models/UserSettings';
import type {User} from '@fluxer/api/src/models/User';
import type {AuthSession} from '@fluxer/api/src/models/AuthSession';
import type {ICacheService} from '@fluxer/cache/src/ICacheService';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import type {IEmailService} from '@fluxer/email/src/IEmailService';
import {createPublicKey, randomBytes, verify as cryptoVerify} from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const SIWS_DOMAIN = 'multiverse.forum';
const SIWS_URI = 'https://multiverse.forum';
const SIWS_STATEMENT = 'Sign in to Multiverse';
const SIWS_ICON = 'https://multiverse.forum/web/logo.png';

// Some wallets prepend a magic prefix before signing a message. Try several known formats.
// Format 1 (raw): no prefix
// Format 2 (off-chain v0): 0xff*4 + "solana offchain" (19 bytes)
// Format 3 (off-chain v0 + null): 0xff*4 + "solana offchain" + 0x00 (20 bytes)
const OFFCHAIN_MAGIC_19 = Buffer.from([
	0xff, 0xff, 0xff, 0xff,
	115, 111, 108, 97, 110, 97, 32, 111, 102, 102, 99, 104, 97, 105, 110,
]);
const OFFCHAIN_MAGIC_20 = Buffer.concat([OFFCHAIN_MAGIC_19, Buffer.from([0x00])]);

function buildSiwsMessage(params: {address: string; nonce: string; issuedAt: string}): string {
	return [
		`${SIWS_DOMAIN} wants you to sign in with your Solana account:`,
		params.address,
		'',
		SIWS_STATEMENT,
		'',
		`URI: ${SIWS_URI}`,
		'Version: 1',
		'Chain ID: mainnet',
		`Nonce: ${params.nonce}`,
		`Issued At: ${params.issuedAt}`,
		`Resources:`,
		`- ${SIWS_ICON}`,
	].join('\n');
}

function decodeBase58(input: string): Uint8Array {
	const bytes = [0];
	for (const char of input) {
		const value = BASE58_ALPHABET.indexOf(char);
		if (value < 0) throw new Error('Invalid base58 character');
		let carry = value;
		for (let i = 0; i < bytes.length; i++) {
			carry += bytes[i] * 58;
			bytes[i] = carry & 0xff;
			carry >>= 8;
		}
		while (carry > 0) {
			bytes.push(carry & 0xff);
			carry >>= 8;
		}
	}
	for (const char of input) {
		if (char === '1') bytes.push(0);
		else break;
	}
	return new Uint8Array(bytes.reverse());
}

export type SiwsVerifyResult =
	| {needsOnboarding: false; token: string; user_id: string}
	| {needsOnboarding: true; tempToken: string};

export type FinalizeOnboardingResult = {needsEmailVerification: true; pendingToken: string; email: string};
export type VerifyOnboardingEmailResult = {token: string; user_id: string};

export class SolanaAuthService {
	private static readonly NONCE_PREFIX = 'solana-nonce:';
	private static readonly TEMP_TOKEN_PREFIX = 'solana-temp:';
	private static readonly NONCE_TTL_SECONDS = 300;
	private static readonly TEMP_TOKEN_TTL_SECONDS = 600;
	private static readonly OTP_PREFIX = 'solana-otp:';
	private static readonly PENDING_PREFIX = 'solana-pending:';
	private static readonly OTP_TTL_SECONDS = 900;

	constructor(
		private cacheService: ICacheService,
		private userRepository: IUserRepository,
		private snowflakeService: SnowflakeService,
		private createAuthSession: (params: {user: User; request: Request}) => Promise<[string, AuthSession]>,
	) {}

	async getNonce(address: string): Promise<{nonce: string; message: string}> {
		const nonce = randomBytes(16).toString('hex');
		const issuedAt = new Date().toISOString();
		await this.cacheService.set(
			`${SolanaAuthService.NONCE_PREFIX}${address}`,
			`${nonce}:${issuedAt}`,
			SolanaAuthService.NONCE_TTL_SECONDS,
		);
		const message = buildSiwsMessage({address, nonce, issuedAt});
		return {nonce, message};
	}

	async verifySiws({
		address,
		signature,
		nonce,
		signedMessage,
		request,
	}: {
		address: string;
		signature: string;
		nonce: string;
		signedMessage?: string;
		request: Request;
	}): Promise<SiwsVerifyResult> {
		// Validate and consume nonce
		const nonceKey = `${SolanaAuthService.NONCE_PREFIX}${address}`;
		const storedRaw = await this.cacheService.getAndDelete<string>(nonceKey);
		if (!storedRaw) throw new Error('Invalid or expired nonce');

		// stored as "nonce:issuedAt" — support legacy plain-nonce entries too
		const colonIdx = storedRaw.indexOf(':');
		const storedNonce = colonIdx > 0 ? storedRaw.slice(0, colonIdx) : storedRaw;
		const storedIssuedAt = colonIdx > 0 ? storedRaw.slice(colonIdx + 1) : null;

		if (storedNonce !== nonce) throw new Error('Invalid or expired nonce');

		// Determine the message bytes to verify against
		let messageBytes: Buffer;
		if (signedMessage) {
			// Wallet provided the exact bytes it signed — verify over those.
			// Covers both: signIn() SIWS canonical text, and signMessage() wallets that
			// prepend a binary prefix (e.g. Solana off-chain magic) before signing.
			messageBytes = Buffer.from(signedMessage, 'base64');
			// Nonce check: search in the UTF-8-decoded text (binary prefixes become
			// replacement chars but the ASCII message portion is intact).
			const text = messageBytes.toString('utf-8');
			const nonceMatch = text.match(/Nonce:\s*([a-f0-9]+)/);
			if (!nonceMatch || nonceMatch[1] !== storedNonce) {
				throw new Error('Nonce mismatch in signed message');
			}
		} else {
			// signMessage() fallback: the SPA signs the compact challenge message
			// (full SIWS reconstruction is only used for the signIn() path via signedMessage)
			messageBytes = Buffer.from(`Sign in to Multiverse\nNonce: ${storedNonce}`, 'utf-8');
		}

		// Verify ed25519 signature
		const signatureBytes = Buffer.from(signature, 'base64');
		const rawPublicKey = decodeBase58(address);
		const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
		const spkiKey = Buffer.concat([spkiPrefix, rawPublicKey]);
		const publicKey = createPublicKey({key: spkiKey, format: 'der', type: 'spki'});

		// Some wallets prepend a magic prefix before signing. Try several known formats.
		// Format 1 (raw): no prefix
		// Format 2 (off-chain v0): 0xff*4 + "solana offchain" (19 bytes)
		// Format 3 (off-chain v0 + null): 0xff*4 + "solana offchain" + 0x00 (20 bytes)
		const candidates = [
			messageBytes,
			Buffer.concat([OFFCHAIN_MAGIC_19, messageBytes]),
			Buffer.concat([OFFCHAIN_MAGIC_20, messageBytes]),
		];

		const validIdx = candidates.findIndex(c => cryptoVerify(null, c, publicKey, signatureBytes));
		const valid = validIdx >= 0;

		if (!valid) {
			throw new Error('Invalid signature');
		}

		// Look up existing user
		const user = await this.userRepository.findBySolanaAddress(address);

		// User exists with a username — create session immediately
		if (user?.username) {
			const [token] = await this.createAuthSession({user, request});
			return {needsOnboarding: false, token, user_id: user.id.toString()};
		}

		// Unknown wallet — start onboarding
		const tempToken = randomBytes(24).toString('hex');
		await this.cacheService.set(
			`${SolanaAuthService.TEMP_TOKEN_PREFIX}${tempToken}`,
			address,
			SolanaAuthService.TEMP_TOKEN_TTL_SECONDS,
		);
		return {needsOnboarding: true, tempToken};
	}

	async finalizeOnboarding({
		tempToken,
		username,
		email,
		emailService,
		request,
	}: {
		tempToken: string;
		username: string;
		email: string;
		emailService: IEmailService;
		request: Request;
	}): Promise<FinalizeOnboardingResult> {
		await this.snowflakeService.initialize();
		const tokenKey = `${SolanaAuthService.TEMP_TOKEN_PREFIX}${tempToken}`;
		const address = await this.cacheService.getAndDelete<string>(tokenKey);
		if (!address) {
			throw new Error('Invalid or expired onboarding token');
		}

		const trimmed = username.trim();
		if (!trimmed || trimmed.length < 2 || trimmed.length > 32) {
			throw new Error('Username must be 2–32 characters');
		}
		if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
			throw new Error('Username may only contain letters, numbers, dots, hyphens, and underscores');
		}

		const trimmedEmail = email.trim().toLowerCase();
		if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
			throw new Error('A valid email address is required');
		}

		// Race-condition guard: wallet may have been claimed between verify and finalize
		let user = await this.userRepository.findBySolanaAddress(address);

		if (!user) {
			user = await this.createWalletUser(address, trimmed, trimmedEmail);
			await this.userRepository.upsertSettings(
				UserSettings.getDefaultUserSettings({
					userId: user.id,
					locale: 'en-US' as any,
					isAdult: false,
				}),
			);
		}

		// Generate a 6-digit OTP and store it alongside a pending session token
		const otp = String(Math.floor(100000 + Math.random() * 900000));
		const pendingToken = randomBytes(24).toString('hex');

		await this.cacheService.set(
			`${SolanaAuthService.OTP_PREFIX}${user.id}`,
			otp,
			SolanaAuthService.OTP_TTL_SECONDS,
		);
		await this.cacheService.set(
			`${SolanaAuthService.PENDING_PREFIX}${pendingToken}`,
			user.id.toString(),
			SolanaAuthService.OTP_TTL_SECONDS,
		);

		await emailService.sendSolanaOnboardingCode(trimmedEmail, trimmed, otp);

		// Return masked email for display: j***@example.com
		const atIdx = trimmedEmail.indexOf('@');
		const maskedEmail = trimmedEmail[0] + '***' + trimmedEmail.slice(atIdx);

		return {needsEmailVerification: true, pendingToken, email: maskedEmail};
	}

	async verifyOnboardingEmail({
		pendingToken,
		code,
		request,
	}: {
		pendingToken: string;
		code: string;
		request: Request;
	}): Promise<VerifyOnboardingEmailResult> {
		const pendingKey = `${SolanaAuthService.PENDING_PREFIX}${pendingToken}`;
		const userId = await this.cacheService.getAndDelete<string>(pendingKey);
		if (!userId) {
			throw new Error('Invalid or expired verification session. Please start over.');
		}

		const otpKey = `${SolanaAuthService.OTP_PREFIX}${userId}`;
		const storedOtp = await this.cacheService.getAndDelete<string>(otpKey);
		if (!storedOtp) {
			throw new Error('Verification code has expired. Please start over.');
		}

		if (code.trim() !== storedOtp) {
			// Restore the OTP so the user can retry
			await this.cacheService.set(otpKey, storedOtp, SolanaAuthService.OTP_TTL_SECONDS);
			// Also restore the pending token so the form stays usable
			await this.cacheService.set(pendingKey, userId, SolanaAuthService.OTP_TTL_SECONDS);
			throw new Error('Incorrect verification code. Please try again.');
		}

		const user = await this.userRepository.findUnique(createUserID(BigInt(userId)) as any);
		if (!user) {
			throw new Error('User not found');
		}

		await this.userRepository.patchUpsert(user.id, {email_verified: true});
		const [token] = await this.createAuthSession({user, request});
		return {token, user_id: user.id.toString()};
	}

	/**
	 * Link a Solana wallet address to an existing (email/password) account.
	 * Verifies ownership of the wallet via a signed nonce, then persists the
	 * solana_address on the user record.  Idempotent — if the same address is
	 * already linked to this user the call succeeds without error.
	 *
	 * Deliberately restricted to first-time linking: if the account already has a
	 * *different* solana_address set, this throws WALLET_ALREADY_OWNED rather than
	 * switching it. This is a stopgap, not the real fix — UserIndexRepository.syncIndices
	 * never deletes the old `users_by_solana_address` reverse-index row when
	 * solana_address changes, so a switch here would leave the old wallet address
	 * permanently resolvable via SIWS login to this account even after the user moves
	 * on from that wallet (sells it, rotates keys, etc). Once that index-cleanup bug has
	 * its own dedicated fix, this restriction can be lifted.
	 */
	/**
	 * Verifies a wallet re-signature for sudo-mode re-verification (e.g. before changing a
	 * MultiverseTag). Unlike {@link linkWallet}, this never mutates the user's linked wallet —
	 * it only confirms the signer controls a wallet already linked to `user`.
	 */
	async verifySudoSignature({
		user,
		address,
		signature,
		nonce,
		signedMessage,
	}: {
		user: User;
		address: string;
		signature: string;
		nonce: string;
		signedMessage?: string;
	}): Promise<boolean> {
		if (user.solanaAddress !== address) return false;

		const nonceKey = `${SolanaAuthService.NONCE_PREFIX}${address}`;
		const storedRaw = await this.cacheService.getAndDelete<string>(nonceKey);
		if (!storedRaw) return false;

		const colonIdx = storedRaw.indexOf(':');
		const storedNonce = colonIdx > 0 ? storedRaw.slice(0, colonIdx) : storedRaw;
		if (storedNonce !== nonce) return false;

		const signatureBytes = Buffer.from(signature, 'base64');
		const rawPublicKey = decodeBase58(address);
		const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
		const spkiKey = Buffer.concat([spkiPrefix, rawPublicKey]);
		const publicKey = createPublicKey({key: spkiKey, format: 'der', type: 'spki'});

		if (signedMessage) {
			// Wallet reported the exact bytes it signed (may include an off-chain-message prefix,
			// or differ in other wallet-specific ways) — verify against those directly rather than
			// guessing the framing. Same approach as verifySiws().
			const exactBytes = Buffer.from(signedMessage, 'base64');
			const text = exactBytes.toString('utf-8');
			const nonceMatch = text.match(/Nonce:\s*([a-f0-9]+)/);
			if (!nonceMatch || nonceMatch[1] !== storedNonce) return false;
			return cryptoVerify(null, exactBytes, publicKey, signatureBytes);
		}

		// No signedMessage reported (e.g. classic extension providers like Phantom that only return
		// a signature) — reconstruct the challenge and try known prefix variants, same as verifySiws().
		const messageBytes = Buffer.from(`Sign in to Multiverse\nNonce: ${storedNonce}`, 'utf-8');
		const candidates = [
			messageBytes,
			Buffer.concat([OFFCHAIN_MAGIC_19, messageBytes]),
			Buffer.concat([OFFCHAIN_MAGIC_20, messageBytes]),
		];
		return candidates.some((candidate) => cryptoVerify(null, candidate, publicKey, signatureBytes));
	}

	async linkWallet({
		user,
		address,
		signature,
		nonce,
		signedMessage,
	}: {
		user: User;
		address: string;
		signature: string;
		nonce: string;
		signedMessage?: string;
	}): Promise<{solana_address: string}> {
		// Validate and consume nonce
		const nonceKey = `${SolanaAuthService.NONCE_PREFIX}${address}`;
		const storedRaw = await this.cacheService.getAndDelete<string>(nonceKey);
		if (!storedRaw) throw new Error('Invalid or expired nonce');

		const colonIdx = storedRaw.indexOf(':');
		const storedNonce = colonIdx > 0 ? storedRaw.slice(0, colonIdx) : storedRaw;
		if (storedNonce !== nonce) throw new Error('Invalid or expired nonce');

		// Verify Ed25519 signature — same approach as verifySiws()/verifySudoSignature(): prefer
		// the exact bytes the wallet reported it signed (signIn() wallets return this, and it may
		// carry a wallet-specific binary prefix), else reconstruct the compact challenge and try
		// known prefix variants (covers signMessage()-only wallets like classic Phantom).
		const signatureBytes = Buffer.from(signature, 'base64');
		const rawPublicKey = decodeBase58(address);
		const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
		const spkiKey = Buffer.concat([spkiPrefix, rawPublicKey]);
		const publicKey = createPublicKey({key: spkiKey, format: 'der', type: 'spki'});

		let valid: boolean;
		if (signedMessage) {
			const exactBytes = Buffer.from(signedMessage, 'base64');
			const text = exactBytes.toString('utf-8');
			const nonceMatch = text.match(/Nonce:\s*([a-f0-9]+)/);
			if (!nonceMatch || nonceMatch[1] !== storedNonce) {
				throw new Error('Nonce mismatch in signed message');
			}
			valid = cryptoVerify(null, exactBytes, publicKey, signatureBytes);
		} else {
			const messageBytes = Buffer.from(`Sign in to Multiverse\nNonce: ${storedNonce}`, 'utf-8');
			const candidates = [
				messageBytes,
				Buffer.concat([OFFCHAIN_MAGIC_19, messageBytes]),
				Buffer.concat([OFFCHAIN_MAGIC_20, messageBytes]),
			];
			valid = candidates.some((candidate) => cryptoVerify(null, candidate, publicKey, signatureBytes));
		}
		if (!valid) throw new Error('Invalid signature');

		// Stopgap: block switching to a different wallet once one is already linked (see the
		// class-level doc comment on this method for why). Re-linking the SAME address stays a
		// harmless no-op below.
		if (user.solanaAddress && user.solanaAddress !== address) {
			throw new Error('WALLET_ALREADY_OWNED');
		}

		// Check address not already claimed by a different user. This is a check-then-write —
		// same race tolerance as finalizeOnboarding's wallet-claim guard above — not a hard
		// DB-level constraint; two concurrent link attempts for the same brand-new address could
		// theoretically both pass this check. Acceptable here for the same reason it's accepted
		// there: exploiting it requires already controlling the wallet's private key, and the
		// worst outcome is a last-write-wins on which account ends up with the address, not an
		// unauthorized link.
		const existing = await this.userRepository.findBySolanaAddress(address);
		if (existing && existing.id.toString() !== user.id.toString()) {
			throw new Error('This wallet is already linked to another account');
		}

		// Already linked to this user — idempotent success, no write needed
		if (existing) return {solana_address: address};

		// Link wallet to account
		await this.userRepository.patchUpsert(user.id, {solana_address: address});
		return {solana_address: address};
	}

	private async createWalletUser(address: string, username: string, email: string): Promise<User> {
		const userId = createUserID(await this.snowflakeService.generate());
		const discriminator = 1000 + Math.floor(Math.random() * 9000);
		const now = new Date();

		return this.userRepository.create({
			user_id: userId,
			username,
			discriminator,
			global_name: null,
			bot: false,
			system: false,
			email,
			email_verified: false,
			email_bounced: false,
			phone: null,
			solana_address: address,
			password_hash: null,
			password_last_changed_at: null,
			totp_secret: null,
			authenticator_types: new Set(),
			avatar_hash: null,
			avatar_color: null,
			banner_hash: null,
			banner_color: null,
			bio: null,
			pronouns: null,
			accent_color: null,
			date_of_birth: null,
			locale: 'en-US' as any,
			flags: 0n,
			premium_type: null,
			premium_since: null,
			premium_until: null,
			premium_will_cancel: null,
			premium_billing_cycle: null,
			premium_lifetime_sequence: null,
			stripe_subscription_id: null,
			stripe_customer_id: null,
			has_ever_purchased: null,
			suspicious_activity_flags: null,
			terms_agreed_at: now,
			privacy_agreed_at: now,
			last_active_at: now,
			last_active_ip: null,
			temp_banned_until: null,
			pending_deletion_at: null,
			pending_bulk_message_deletion_at: null,
			pending_bulk_message_deletion_channel_count: null,
			pending_bulk_message_deletion_message_count: null,
			deletion_reason_code: null,
			deletion_public_reason: null,
			deletion_audit_log_reason: null,
			acls: null,
			traits: null,
			first_refund_at: null,
			gift_inventory_server_seq: null,
			gift_inventory_client_seq: null,
			premium_onboarding_dismissed_at: null,
			version: 1,
		});
	}
}
