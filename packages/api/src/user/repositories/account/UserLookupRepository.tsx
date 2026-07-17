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

import type {UserID} from '@fluxer/api/src/BrandedTypes';
import {fetchMany, fetchOne} from '@fluxer/api/src/database/Cassandra';
import type {
	UserByEmailRow,
	UserByPhoneRow,
	UserBySolanaAddressRow,
	UserByStripeCustomerIdRow,
	UserByStripeSubscriptionIdRow,
	UserByUsernameRow,
} from '@fluxer/api/src/database/types/UserTypes';
import type {User} from '@fluxer/api/src/models/User';
import {
	UserByEmail,
	UserByPhone,
	UserBySolanaAddress,
	UserByStripeCustomerId,
	UserByStripeSubscriptionId,
	UserByUsername,
} from '@fluxer/api/src/Tables';

const FETCH_DISCRIMINATORS_BY_USERNAME_QUERY = UserByUsername.select({
	columns: ['discriminator', 'user_id'],
	where: UserByUsername.where.eq('username'),
});

const FETCH_USER_ID_BY_EMAIL_QUERY = UserByEmail.select({
	columns: ['user_id'],
	where: UserByEmail.where.eq('email_lower'),
	limit: 1,
});

const FETCH_USER_ID_BY_PHONE_QUERY = UserByPhone.select({
	columns: ['user_id'],
	where: UserByPhone.where.eq('phone'),
	limit: 1,
});

const FETCH_USER_ID_BY_STRIPE_CUSTOMER_ID_QUERY = UserByStripeCustomerId.select({
	columns: ['user_id'],
	where: UserByStripeCustomerId.where.eq('stripe_customer_id'),
	limit: 1,
});

const FETCH_USER_ID_BY_STRIPE_SUBSCRIPTION_ID_QUERY = UserByStripeSubscriptionId.select({
	columns: ['user_id'],
	where: UserByStripeSubscriptionId.where.eq('stripe_subscription_id'),
	limit: 1,
});

const FETCH_USER_ID_BY_SOLANA_ADDRESS_QUERY = UserBySolanaAddress.select({
	columns: ['user_id'],
	where: UserBySolanaAddress.where.eq('solana_address'),
	limit: 1,
});

const FETCH_SOLANA_ADDRESS_BY_USER_ID_QUERY = UserBySolanaAddress.select({
	columns: ['solana_address'],
	where: UserBySolanaAddress.where.eq('user_id'),
	limit: 1,
});

const FETCH_USER_ID_BY_USERNAME_DISCRIMINATOR_QUERY = UserByUsername.select({
	columns: ['user_id'],
	where: [UserByUsername.where.eq('username'), UserByUsername.where.eq('discriminator')],
	limit: 1,
});

export class UserLookupRepository {
	constructor(private findUniqueUser: (userId: UserID) => Promise<User | null>) {}

	async findByEmail(email: string): Promise<User | null> {
		const emailLower = email.toLowerCase();
		const result = await fetchOne<Pick<UserByEmailRow, 'user_id'>>(
			FETCH_USER_ID_BY_EMAIL_QUERY.bind({email_lower: emailLower}),
		);
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findByPhone(phone: string): Promise<User | null> {
		const result = await fetchOne<Pick<UserByPhoneRow, 'user_id'>>(FETCH_USER_ID_BY_PHONE_QUERY.bind({phone}));
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
		const result = await fetchOne<Pick<UserByStripeCustomerIdRow, 'user_id'>>(
			FETCH_USER_ID_BY_STRIPE_CUSTOMER_ID_QUERY.bind({stripe_customer_id: stripeCustomerId}),
		);
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<User | null> {
		const result = await fetchOne<Pick<UserByStripeSubscriptionIdRow, 'user_id'>>(
			FETCH_USER_ID_BY_STRIPE_SUBSCRIPTION_ID_QUERY.bind({stripe_subscription_id: stripeSubscriptionId}),
		);
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findBySolanaAddress(solanaAddress: string): Promise<User | null> {
		const result = await fetchOne<Pick<UserBySolanaAddressRow, 'user_id'>>(
			FETCH_USER_ID_BY_SOLANA_ADDRESS_QUERY.bind({solana_address: solanaAddress}),
		);
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findSolanaAddressByUserId(userId: UserID): Promise<string | null> {
		const result = await fetchOne<Pick<UserBySolanaAddressRow, 'solana_address'>>(
			FETCH_SOLANA_ADDRESS_BY_USER_ID_QUERY.bind({user_id: userId}),
		);
		return result?.solana_address ?? null;
	}

	async findByUsernameDiscriminator(username: string, discriminator: number): Promise<User | null> {
		const usernameLower = username.toLowerCase();
		const result = await fetchOne<Pick<UserByUsernameRow, 'user_id'>>(
			FETCH_USER_ID_BY_USERNAME_DISCRIMINATOR_QUERY.bind({username: usernameLower, discriminator}),
		);
		if (!result) return null;
		return await this.findUniqueUser(result.user_id);
	}

	async findDiscriminatorsByUsername(username: string): Promise<Set<number>> {
		const usernameLower = username.toLowerCase();
		const result = await fetchMany<Pick<UserByUsernameRow, 'discriminator'>>(
			FETCH_DISCRIMINATORS_BY_USERNAME_QUERY.bind({username: usernameLower}),
		);
		return new Set(result.map((r) => r.discriminator));
	}
}
