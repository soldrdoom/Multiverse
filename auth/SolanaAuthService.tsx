/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import {createUserID} from '@fluxer/api/src/BrandedTypes';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import {UserSettings} from '@fluxer/api/src/models/UserSettings';
import type {User} from '@fluxer/api/src/models/User';
import type {AuthSession} from '@fluxer/api/src/models/AuthSession';
import type {ICacheService} from '@fluxer/cache/src/ICacheService';
import type {IUserRepository} from '@fluxer/api/src/user/IUserRepository';
import {createPublicKey, randomBytes, verify as cryptoVerify} from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

export class SolanaAuthService {
	private static readonly NONCE_PREFIX = 'solana-nonce:';
	private static readonly TEMP_TOKEN_PREFIX = 'solana-temp:';
	private static readonly NONCE_TTL_SECONDS = 300;
	private static readonly TEMP_TOKEN_TTL_SECONDS = 600;

	constructor(
		private cacheService: ICacheService,
		private userRepository: IUserRepository,
		private snowflakeService: SnowflakeService,
		private createAuthSession: (params: {user: User; request: Request}) => Promise<[string, AuthSession]>,
	) {}

	async getNonce(address: string): Promise<string> {
		const nonce = randomBytes(16).toString('hex');
		await this.cacheService.set(
			`${SolanaAuthService.NONCE_PREFIX}${address}`,
			nonce,
			SolanaAuthService.NONCE_TTL_SECONDS,
		);
		return nonce;
	}

	async verifySiws({
		address,
		signature,
		nonce,
		request,
	}: {
		address: string;
		signature: string;
		nonce: string;
		request: Request;
	}): Promise<SiwsVerifyResult> {
		// Validate and consume nonce
		const nonceKey = `${SolanaAuthService.NONCE_PREFIX}${address}`;
		const storedNonce = await this.cacheService.getAndDelete<string>(nonceKey);
		if (!storedNonce || storedNonce !== nonce) {
			throw new Error('Invalid or expired nonce');
		}

		// Verify ed25519 signature
		const message = `Sign in to Multiverse\nNonce: ${nonce}`;
		const messageBytes = Buffer.from(message, 'utf-8');
		const signatureBytes = Buffer.from(signature, 'base64');
		const rawPublicKey = decodeBase58(address);
		const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
		const spkiKey = Buffer.concat([spkiPrefix, rawPublicKey]);
		const publicKey = createPublicKey({key: spkiKey, format: 'der', type: 'spki'});

		const valid = cryptoVerify(null, messageBytes, publicKey, signatureBytes);
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

		// No complete user record — issue a temp token for the onboarding flow
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
		request,
	}: {
		tempToken: string;
		username: string;
		request: Request;
	}): Promise<{token: string; user_id: string}> {
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

		// Race-condition guard: wallet may have been claimed between verify and finalize
		let user = await this.userRepository.findBySolanaAddress(address);

		if (!user) {
			user = await this.createWalletUser(address, trimmed);
			await this.userRepository.upsertSettings(
				UserSettings.getDefaultUserSettings({
					userId: user.id,
					locale: 'en-US' as any,
					isAdult: false,
				}),
			);
		}

		const [token] = await this.createAuthSession({user, request});
		return {token, user_id: user.id.toString()};
	}

	private async createWalletUser(address: string, username: string): Promise<User> {
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
			email: null,
			email_verified: true,
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
