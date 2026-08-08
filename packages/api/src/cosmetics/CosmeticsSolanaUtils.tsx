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

import {COSMETICS_PAYMENT_RPC_URL} from '@fluxer/api/src/cosmetics/CosmeticsPaymentConfig';

/**
 * SOL-payment RPC helpers for the cosmetics shop invoice/purchase flow, mirroring the
 * fetchRecentBlockhash / pollSolanaTransaction / sumTransfersTo pattern used by the guild
 * vanity-purchase and user-tip flows in fluxer_server/src/Routes.tsx.
 *
 * These are intentionally duplicated here rather than imported from Routes.tsx — the
 * originals are unexported closures inside `mountRoutes()`, and this endpoint lives in
 * packages/api/src/cosmetics/CosmeticsController.tsx (per this feature's plan), not in
 * Routes.tsx, so there's nothing importable to share without refactoring the two existing,
 * already-live payment flows — out of scope for this change.
 *
 * NOTE: this deliberately goes through COSMETICS_PAYMENT_RPC_URL (see
 * CosmeticsPaymentConfig.tsx), NOT `SOLANA_RPC_URL`/`SOLANA_NETWORK` (the switch shared by
 * SIWS auth, tokengating, DAS NFT lookups, vanity purchases, and tips) — while the cosmetics
 * shop is being hardened its SOL *payment* verification is pinned to its own devnet-by-default
 * RPC endpoint, independent of whatever network the rest of the live app's payments use. This
 * mirrors *minting*'s own independent pin to `COSMETICS_MINT_RPC_URL` via @fluxer/solana_mint.
 * See CosmeticsController.tsx's purchase handler for how these stay separate.
 */

/** Fetches a fresh blockhash for building a client-side transfer transaction. */
export async function fetchRecentBlockhash(): Promise<string> {
	const rpcRes = await fetch(COSMETICS_PAYMENT_RPC_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{commitment: 'confirmed'}]}),
	});
	const rpcData = (await rpcRes.json()) as any;
	const blockhash: string | undefined = rpcData?.result?.value?.blockhash;
	if (!blockhash) throw new Error('No blockhash in response');
	return blockhash;
}

/** Polls `getTransaction` for a signature, retrying up to 8x with a 3s delay to ride out confirmation lag. */
export async function pollSolanaTransaction(txSignature: string): Promise<any> {
	let txData: any;
	for (let attempt = 0; attempt < 8; attempt++) {
		try {
			const rpcRes = await fetch(COSMETICS_PAYMENT_RPC_URL, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'getTransaction',
					params: [txSignature, {encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0}],
				}),
			});
			const rpcJson = (await rpcRes.json()) as any;
			txData = rpcJson?.result;
		} catch {
			/* ignore transient error, retry */
		}
		if (txData) break;
		if (attempt < 7) await new Promise((r) => setTimeout(r, 3000));
	}
	return txData;
}

/**
 * Sums lamports transferred to `destination` via System Program `transfer` instructions in a
 * parsed transaction. Sums each matching instruction individually rather than diffing
 * `destination`'s net pre/post account balance — the latter breaks whenever the payer is also
 * `destination`, since the account's net balance then reflects every other outgoing transfer too.
 */
export function sumTransfersTo(txData: any, destination: string): number {
	const instructions: Array<any> = txData?.transaction?.message?.instructions ?? [];
	let total = 0;
	for (const ix of instructions) {
		if (ix?.program !== 'system' || ix?.parsed?.type !== 'transfer') continue;
		if (ix.parsed.info?.destination !== destination) continue;
		total += Number(ix.parsed.info?.lamports ?? 0);
	}
	return total;
}

/**
 * Extracts the fee-payer address (account index 0, always the fee-payer/sender for these
 * simple-transfer transaction shapes — same convention documented at the vanity-purchase and
 * tip-verify call sites in fluxer_server/src/Routes.tsx) from a parsed `getTransaction` result.
 * Returns '' if the transaction has no account keys.
 *
 * Callers must compare this against the authenticated caller's own linked wallet — an amount-only
 * check (`sumTransfersTo`) alone verifies WHAT was paid but not WHO paid it, which lets an attacker
 * observe someone else's broadcast payment and race them to claim the resulting purchase/mint.
 */
export function getFeePayerAddress(txData: any): string {
	const accountKeys: Array<{pubkey: string}> = txData?.transaction?.message?.accountKeys ?? [];
	return accountKeys[0]?.pubkey ?? '';
}
