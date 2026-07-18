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

// ── Base58 codec ──────────────────────────────────────────────────────────────

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(input: string): Uint8Array {
	const bytes = [0];
	for (const char of input) {
		const value = BASE58_CHARS.indexOf(char);
		if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
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
		if (char !== '1') break;
		bytes.push(0);
	}
	return new Uint8Array(bytes.reverse());
}

function encodeBase58(bytes: Uint8Array): string {
	const digits = [0];
	for (const byte of bytes) {
		let carry = byte;
		for (let i = 0; i < digits.length; i++) {
			carry += digits[i] << 8;
			digits[i] = carry % 58;
			carry = Math.floor(carry / 58);
		}
		while (carry > 0) {
			digits.push(carry % 58);
			carry = Math.floor(carry / 58);
		}
	}
	let result = '';
	for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1';
	for (let i = digits.length - 1; i >= 0; i--) result += BASE58_CHARS[digits[i]];
	return result;
}

function decode32(addr: string): Uint8Array {
	const raw = decodeBase58(addr);
	if (raw.length === 32) return raw;
	const out = new Uint8Array(32);
	if (raw.length < 32) {
		out.set(raw, 32 - raw.length);
	} else {
		out.set(raw.slice(raw.length - 32));
	}
	return out;
}

function concat(arrays: Array<Uint8Array>): Uint8Array {
	const total = arrays.reduce((n, a) => n + a.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		out.set(a, offset);
		offset += a.length;
	}
	return out;
}

export interface SolTransferInstruction {
	recipient: string;
	lamports: number;
}

/**
 * Serialize a Solana legacy transaction with one or more System Program
 * transfers from the same sender, ready for base58 encoding. All recipients
 * are writable, non-signer accounts, so the header's readonly-unsigned count
 * stays at 1 (the System Program itself) no matter how many transfers are
 * included — this is what lets a tip and its platform fee ride in one
 * wallet-signed transaction instead of two.
 */
export function buildSerializedSolTransferMulti(
	senderAddr: string,
	transfers: ReadonlyArray<SolTransferInstruction>,
	recentBlockhash: string,
): Uint8Array {
	if (transfers.length === 0) {
		throw new Error('At least one transfer is required');
	}

	const sender = decode32(senderAddr);
	const recipients = transfers.map((t) => decode32(t.recipient));
	const systemProgram = new Uint8Array(32); // 11111111... = all zeros
	const blockhash = decode32(recentBlockhash);

	const accounts = [sender, ...recipients, systemProgram];
	const systemProgramIdx = accounts.length - 1;

	// System program Transfer instruction: type=2 (u32 LE) + lamports (u64 LE)
	const instructions = transfers.map((transfer, i) => {
		const ixData = new Uint8Array(12);
		ixData[0] = 2; // instruction index (u32 LE, remaining 3 bytes are 0)
		new DataView(ixData.buffer).setBigUint64(4, BigInt(transfer.lamports), true);
		return concat([
			new Uint8Array([systemProgramIdx]), // programAccountIndex
			new Uint8Array([2, 0, i + 1]), // 2 account indices: sender=0, recipient=i+1
			new Uint8Array([12]), // data length = 12
			ixData,
		]);
	});

	// Message layout (legacy):
	//   header [3]: numSigs=1, numROSigned=0, numROUnsigned=1
	//   accounts [compact-u16 + 32*n]: sender, ...recipients, systemProgram
	//   recentBlockhash [32]
	//   instructions [compact-u16 + ...]
	//     ix: programIdx, [accountIdxs compact-u16...], data [compact-u16...]
	const message = concat([
		new Uint8Array([1, 0, 1]), // header
		new Uint8Array([accounts.length]),
		...accounts,
		blockhash,
		new Uint8Array([instructions.length]),
		...instructions,
	]);

	// Full transaction: [numSigs=1 compact-u16] [64 zero bytes = empty sig slot] [message]
	return concat([new Uint8Array([1]), new Uint8Array(64), message]);
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
	const encodedTx = encodeBase58(txBytes);

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
