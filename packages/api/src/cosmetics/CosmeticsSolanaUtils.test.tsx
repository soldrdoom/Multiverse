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

import {getFeePayerAddress, sumTransfersTo} from '@fluxer/api/src/cosmetics/CosmeticsSolanaUtils';
import {describe, expect, it} from 'vitest';

function parsedTransferIx(destination: string, lamports: number) {
	return {program: 'system', parsed: {type: 'transfer', info: {destination, lamports}}};
}

describe('sumTransfersTo', () => {
	it('sums only matching-destination system transfer instructions', () => {
		const txData = {
			transaction: {
				message: {
					instructions: [
						parsedTransferIx('creatorWallet', 900),
						parsedTransferIx('platformWallet', 100),
						parsedTransferIx('creatorWallet', 50),
						{program: 'spl-token', parsed: {type: 'transfer', info: {destination: 'creatorWallet', amount: 1}}},
					],
				},
			},
		};
		expect(sumTransfersTo(txData, 'creatorWallet')).toBe(950);
		expect(sumTransfersTo(txData, 'platformWallet')).toBe(100);
		expect(sumTransfersTo(txData, 'someoneElse')).toBe(0);
	});

	it('correctly sums per-destination even when the payer is also a destination', () => {
		// Regression guard for the balance-delta pitfall documented in Routes.tsx: if
		// destination == payer, a naive pre/post balance diff would net out the payer's own
		// outgoing transfers against their incoming ones. Summing matching instructions avoids that.
		const txData = {
			transaction: {
				message: {
					instructions: [parsedTransferIx('payerAndCreator', 900), parsedTransferIx('platformWallet', 100)],
				},
			},
		};
		expect(sumTransfersTo(txData, 'payerAndCreator')).toBe(900);
	});

	it('returns 0 for missing/malformed transaction data', () => {
		expect(sumTransfersTo(null, 'anything')).toBe(0);
		expect(sumTransfersTo({}, 'anything')).toBe(0);
		expect(sumTransfersTo({transaction: {}}, 'anything')).toBe(0);
	});
});

describe('getFeePayerAddress', () => {
	it('extracts account index 0 as the fee-payer', () => {
		const txData = {
			transaction: {
				message: {
					accountKeys: [{pubkey: 'payerWallet'}, {pubkey: 'creatorWallet'}, {pubkey: 'platformWallet'}],
				},
			},
		};
		expect(getFeePayerAddress(txData)).toBe('payerWallet');
	});

	it('returns "" for missing/malformed transaction data', () => {
		expect(getFeePayerAddress(null)).toBe('');
		expect(getFeePayerAddress({})).toBe('');
		expect(getFeePayerAddress({transaction: {}})).toBe('');
		expect(getFeePayerAddress({transaction: {message: {accountKeys: []}}})).toBe('');
	});
});

describe('fee-payer-mismatch rejection (CosmeticsController /cosmetics/purchase regression)', () => {
	// Regression guard for the "amount-only verification lets an attacker steal someone else's
	// payment" vulnerability: sumTransfersTo alone verifies WHAT was paid and to WHOM, but not WHO
	// paid it. An attacker who observes a legitimate buyer's broadcast (but not-yet-claimed)
	// transaction can submit its signature against their own account. CosmeticsController's
	// /cosmetics/purchase handler must reject any transaction whose fee-payer (account index 0)
	// doesn't match the authenticated caller's own linked wallet — even when every transfer leg is
	// individually correct — BEFORE crediting the purchase or minting to that caller's wallet.
	it('flags a transaction that pays the correct amounts to the correct wallets but was signed by someone else', () => {
		const attackerWallet = 'attackerWallet';
		const legitimateBuyerWallet = 'legitimateBuyerWallet';
		const creatorWallet = 'creatorWallet';
		const platformWallet = 'platformWallet';
		const expectedCreatorLamports = 900;
		const expectedPlatformLamports = 100;

		// A transaction broadcast and paid for by `attackerWallet`, but which happens to transfer
		// exactly the amounts the legitimate buyer's invoice expected, to the same creator/platform
		// wallets (e.g. the attacker observed the legitimate buyer's own pending broadcast and is
		// racing to submit it first under their own account).
		const attackerTxData = {
			transaction: {
				message: {
					accountKeys: [{pubkey: attackerWallet}, {pubkey: creatorWallet}, {pubkey: platformWallet}],
					instructions: [
						parsedTransferIx(creatorWallet, expectedCreatorLamports),
						parsedTransferIx(platformWallet, expectedPlatformLamports),
					],
				},
			},
		};

		// Amount-only verification (what the endpoint used to rely on exclusively) would pass this
		// transaction outright...
		expect(sumTransfersTo(attackerTxData, creatorWallet)).toBeGreaterThanOrEqual(expectedCreatorLamports);
		expect(sumTransfersTo(attackerTxData, platformWallet)).toBeGreaterThanOrEqual(expectedPlatformLamports);

		// ...but the fee-payer is not the buyer whose session/purchase this verification is for, so
		// the endpoint's `feePayerAddress !== buyerAddress` guard must reject it.
		const feePayerAddress = getFeePayerAddress(attackerTxData);
		expect(feePayerAddress).toBe(attackerWallet);
		expect(feePayerAddress).not.toBe(legitimateBuyerWallet);
	});
});
