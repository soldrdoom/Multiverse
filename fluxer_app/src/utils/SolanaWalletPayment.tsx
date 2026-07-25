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

import {PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import bs58 from 'bs58';

export interface SolTransferInstruction {
	recipient: string;
	lamports: number;
}

/**
 * Build a Solana legacy transaction with one or more System Program transfers
 * from the same sender, ready for base58 encoding and handoff to a wallet's
 * `signAndSendTransaction`. Built via `@solana/web3.js`'s own `Transaction`/
 * `SystemProgram` rather than hand-serializing the wire format — a hand-rolled
 * byte-packer previously used here produced messages that were valid enough to
 * broadcast and confirm on-chain, but caused at least one wallet extension to
 * throw an internal error when asked to sign a message referencing 3+ distinct
 * non-signer accounts (i.e. any multi-recipient transfer with no duplicate
 * addresses) via its raw signAndSendTransaction path — a wallet-side parsing
 * quirk that using the standard, widely-tested transaction builder avoids.
 */
export function buildSerializedSolTransferMulti(
	senderAddr: string,
	transfers: ReadonlyArray<SolTransferInstruction>,
	recentBlockhash: string,
): Uint8Array {
	if (transfers.length === 0) {
		throw new Error('At least one transfer is required');
	}

	const sender = new PublicKey(senderAddr);
	const tx = new Transaction({recentBlockhash, feePayer: sender});
	for (const transfer of transfers) {
		tx.add(
			SystemProgram.transfer({
				fromPubkey: sender,
				toPubkey: new PublicKey(transfer.recipient),
				lamports: transfer.lamports,
			}),
		);
	}

	return tx.serialize({requireAllSignatures: false, verifySignatures: false});
}

/** Serialize a Solana legacy SOL-transfer transaction to bytes, ready for base58 encoding. */
export function buildSerializedSolTransfer(
	senderAddr: string,
	recipientAddr: string,
	lamports: number,
	recentBlockhash: string,
): Uint8Array {
	return buildSerializedSolTransferMulti(senderAddr, [{recipient: recipientAddr, lamports}], recentBlockhash);
}

// ── Wallet interaction ───────────────────────────────────────────────────────

interface PhantomLikeProvider {
	isConnected?: boolean;
	publicKey?: {toString(): string};
	connect: () => Promise<unknown>;
	request: (args: {method: string; params: unknown}) => Promise<unknown>;
}

function getInjectedSolanaProvider(): PhantomLikeProvider | null {
	const w = window as unknown as {phantom?: {solana?: PhantomLikeProvider}; solana?: PhantomLikeProvider};
	return w.phantom?.solana ?? w.solana ?? null;
}

export interface PaySolTransferParams {
	recipient: string;
	amountLamports: number;
	recentBlockhash: string;
}

export interface PayMultiSolTransferParams {
	transfers: ReadonlyArray<SolTransferInstruction>;
	recentBlockhash: string;
}

/**
 * Connects to the injected Solana wallet (Phantom or compatible), signs and
 * sends one or more SOL transfers in a single transaction, and returns the
 * transaction signature. Throws on failure; throws with
 * `code === 'wallet-not-found'` if no wallet is injected, and rethrows the
 * raw error (with `.code === 4001`-style user-rejection markers intact) so
 * callers can distinguish "user cancelled" from real errors.
 */
export async function payMultiSolTransfer(params: PayMultiSolTransferParams): Promise<string> {
	const {transfers, recentBlockhash} = params;
	const sol = getInjectedSolanaProvider();
	if (!sol) {
		const error = new Error('No Solana wallet found. Please install Phantom or a compatible wallet extension.');
		(error as {code?: string}).code = 'wallet-not-found';
		throw error;
	}

	if (!sol.isConnected) await sol.connect();
	const senderAddress = sol.publicKey?.toString();
	if (!senderAddress) {
		throw new Error('Could not get wallet address.');
	}

	const txBytes = buildSerializedSolTransferMulti(senderAddress, transfers, recentBlockhash);
	const encodedTx = bs58.encode(txBytes);

	if (typeof sol.request !== 'function') {
		throw new Error(`Wallet does not support request() (${typeof sol.request})`);
	}

	const result = (await sol.request({
		method: 'signAndSendTransaction',
		params: {message: encodedTx, sendOptions: {preflightCommitment: 'confirmed'}},
	})) as {signature?: string} | string;

	const signature = typeof result === 'string' ? result : result?.signature;
	if (!signature) {
		throw new Error(`No signature returned: ${JSON.stringify(result)}`);
	}
	return signature;
}

/** Single-transfer convenience wrapper around {@link payMultiSolTransfer}. */
export async function paySolTransfer(params: PaySolTransferParams): Promise<string> {
	const {recipient, amountLamports, recentBlockhash} = params;
	return payMultiSolTransfer({transfers: [{recipient, lamports: amountLamports}], recentBlockhash});
}

export function isWalletRejectionError(err: unknown): boolean {
	const e = err as {code?: number | string; message?: string} | null;
	return e?.code === 4001 || Boolean(e?.message?.includes('rejected')) || Boolean(e?.message?.includes('cancelled'));
}
