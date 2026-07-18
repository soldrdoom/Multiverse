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

import type {GuildID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {GuildVanityPurchaseRow} from '@fluxer/api/src/database/types/GuildVanityPurchaseTypes';
import type {IGuildRepositoryAggregate} from '@fluxer/api/src/guild/repositories/IGuildRepositoryAggregate';
import {GuildVanityPurchaseRepository} from '@fluxer/api/src/guild/repositories/GuildVanityPurchaseRepository';
import type {GuildDataHelpers} from '@fluxer/api/src/guild/services/data/GuildDataHelpers';
import {AuditLogActionType} from '@fluxer/constants/src/AuditLogActionType';
import {GuildFeatures} from '@fluxer/constants/src/GuildConstants';
import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {MissingAccessError} from '@fluxer/errors/src/domains/core/MissingAccessError';
import {UnknownGuildError} from '@fluxer/errors/src/domains/guild/UnknownGuildError';

/** The wallet that receives all Solana payments to Multiverse — reused across payment features. */
export const GUILD_VANITY_MERCHANT_WALLET = 'AwsW3kad25Uk7ptX3YY3wy4o1mN5BJTATfuMa1u4Di23';

/** Fixed USD price for a permanent guild vanity link. SOL amount is computed at invoice time from the live price. */
export const GUILD_VANITY_PURCHASE_USD = 1.99;

export class GuildVanityPurchaseService {
	private readonly purchaseRepository = new GuildVanityPurchaseRepository();

	constructor(
		private readonly guildRepository: IGuildRepositoryAggregate,
		private readonly helpers: GuildDataHelpers,
	) {}

	private async requireOwner(userId: UserID, guildId: GuildID): Promise<void> {
		const {guildData} = await this.helpers.getGuildAuthenticated({userId, guildId});
		if (guildData.owner_id !== userId.toString()) {
			throw new MissingAccessError();
		}
	}

	/** Creates a pending purchase record. Called by fluxer_server once it has computed the SOL amount from a live price. */
	async initiatePurchase(params: {
		userId: UserID;
		guildId: GuildID;
		amountLamports: number;
		solPriceUsd: number;
		usdAmount: number;
	}): Promise<{purchaseId: string; merchantWallet: string}> {
		const {userId, guildId, amountLamports, solPriceUsd, usdAmount} = params;
		await this.requireOwner(userId, guildId);

		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) throw new UnknownGuildError();

		if (guild.features.has(GuildFeatures.VANITY_URL)) {
			throw InputValidationError.fromCode('guild_id', ValidationErrorCodes.GUILD_VANITY_ALREADY_PURCHASED);
		}

		const purchaseId = crypto.randomUUID();
		const row: GuildVanityPurchaseRow = {
			guild_id: guildId,
			purchase_id: purchaseId,
			purchaser_user_id: userId,
			tx_signature: null,
			payer_wallet_address: null,
			amount_lamports: amountLamports,
			sol_price_usd_at_purchase: solPriceUsd,
			usd_amount: usdAmount,
			vanity_code: null,
			status: 'pending',
			created_at: new Date(),
			confirmed_at: null,
		};
		await this.purchaseRepository.createPurchase(row);

		return {purchaseId, merchantWallet: GUILD_VANITY_MERCHANT_WALLET};
	}

	/** Fetches a pending purchase so fluxer_server knows the expected lamport amount before verifying on-chain. */
	async getPendingPurchase(params: {
		userId: UserID;
		guildId: GuildID;
		purchaseId: string;
	}): Promise<GuildVanityPurchaseRow> {
		const {userId, guildId, purchaseId} = params;
		await this.requireOwner(userId, guildId);

		const purchase = await this.purchaseRepository.getPurchase(guildId, purchaseId);
		if (!purchase || purchase.purchaser_user_id !== userId || purchase.status !== 'pending') {
			throw new MissingAccessError();
		}
		return purchase;
	}

	/** Confirms an on-chain-verified purchase: records the tx signature and grants the vanity URL feature permanently. */
	async confirmPurchase(params: {
		userId: UserID;
		guildId: GuildID;
		purchaseId: string;
		txSignature: string;
		payerWalletAddress: string;
	}): Promise<{ok: true}> {
		const {userId, guildId, purchaseId, txSignature, payerWalletAddress} = params;
		await this.requireOwner(userId, guildId);

		const purchase = await this.purchaseRepository.getPurchase(guildId, purchaseId);
		if (!purchase || purchase.purchaser_user_id !== userId || purchase.status !== 'pending') {
			throw new MissingAccessError();
		}

		const {applied} = await this.purchaseRepository.reserveTxSignature(txSignature, guildId, purchaseId);
		if (!applied) {
			throw InputValidationError.fromCode('tx_signature', ValidationErrorCodes.GUILD_VANITY_TX_ALREADY_USED);
		}

		const confirmedAt = new Date();
		await this.purchaseRepository.updatePurchase({
			...purchase,
			tx_signature: txSignature,
			payer_wallet_address: payerWalletAddress,
			status: 'confirmed',
			confirmed_at: confirmedAt,
		});

		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) throw new UnknownGuildError();

		const previousSnapshot = this.helpers.serializeGuildForAudit(guild);
		const updatedGuild = await this.guildRepository.upsert({
			...guild.toRow(),
			features: new Set([...guild.features, GuildFeatures.VANITY_URL]),
		});
		await this.helpers.dispatchGuildUpdate(updatedGuild);
		await this.helpers.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.GUILD_UPDATE,
			targetId: guildId,
			metadata: {
				vanity_purchase: 'true',
				tx_signature: txSignature,
				amount_lamports: String(purchase.amount_lamports),
			},
			changes: this.helpers.computeGuildChanges(previousSnapshot, updatedGuild),
		});

		return {ok: true};
	}
}
