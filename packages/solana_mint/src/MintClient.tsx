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

import {
	COSMETICS_MINT_AUTHORITY_SECRET_KEY,
	COSMETICS_MINT_RPC_URL,
	isMintingConfigured,
} from '@fluxer/solana_mint/src/MintConfig';
import {decodeSecretKey} from '@fluxer/solana_mint/src/SecretKeyCodec';
import {
	createNft,
	findMasterEditionPda,
	findMetadataPda,
	mplTokenMetadata,
	verifyCollectionV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
	generateSigner,
	keypairIdentity,
	none,
	percentAmount,
	publicKey,
	some,
	transactionBuilder,
	type Umi,
} from '@metaplex-foundation/umi';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';

/** Builds a Umi client authenticated as the mint authority. Throws if minting isn't configured. */
export function createMintAuthorityUmi(): Umi {
	if (!isMintingConfigured() || !COSMETICS_MINT_AUTHORITY_SECRET_KEY) {
		throw new Error('COSMETICS_MINT_AUTHORITY_SECRET_KEY is not configured — minting is inert on this deployment');
	}
	const umi = createUmi(COSMETICS_MINT_RPC_URL).use(mplTokenMetadata());
	const secretKeyBytes = decodeSecretKey(COSMETICS_MINT_AUTHORITY_SECRET_KEY);
	const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
	umi.use(keypairIdentity(authorityKeypair));
	return umi;
}

export interface MintCosmeticNftParams {
	/** NFT display name (Metaplex on-chain name field is capped at 32 bytes; callers should pre-truncate). */
	name: string;
	/** Off-chain metadata JSON URI (name/description/image/attributes) — build and host this before calling. */
	uri: string;
	/** Verified collection to attach this item to. null mints a standalone (unattached) NFT. */
	collectionMint: string | null;
	/** Buyer's Solana wallet — becomes the token account owner. */
	destinationWallet: string;
}

export interface MintCosmeticNftResult {
	mintAddress: string;
	txSignature: string;
}

/**
 * Mints one NFT directly to `destinationWallet` and (if `collectionMint` is set) verifies it into that
 * collection, in a single transaction. This is a direct on-demand mint, not Candy Machine — Candy Machine
 * assumes a fixed, pre-uploaded item set, but this marketplace's creators list new items dynamically at
 * any time, so there's no fixed set to pre-upload.
 */
export async function mintCosmeticNft(params: MintCosmeticNftParams): Promise<MintCosmeticNftResult> {
	const umi = createMintAuthorityUmi();
	const mint = generateSigner(umi);
	const destinationOwner = publicKey(params.destinationWallet);

	let builder = transactionBuilder().add(
		createNft(umi, {
			mint,
			name: params.name,
			uri: params.uri,
			sellerFeeBasisPoints: percentAmount(0),
			tokenOwner: destinationOwner,
			collection: params.collectionMint ? some({key: publicKey(params.collectionMint), verified: false}) : none(),
		}),
	);

	if (params.collectionMint) {
		builder = builder.add(
			verifyCollectionV1(umi, {
				metadata: findMetadataPda(umi, {mint: mint.publicKey}),
				collectionMint: publicKey(params.collectionMint),
			}),
		);
	}

	const {signature} = await builder.sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		mintAddress: mint.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

export interface CreateCollectionNftParams {
	name: string;
	uri: string;
}

export interface CreateCollectionNftResult {
	collectionAddress: string;
	txSignature: string;
}

/**
 * One-time setup: creates the "Multiverse Cosmetics" Collection NFT, authority = the mint authority
 * wallet. Intended to be called once, manually, by `packages/api/scripts/setupCosmeticsCollection.ts` —
 * NOT on every server boot. The resulting address should be saved into `COSMETICS_COLLECTION_ADDRESS`.
 */
export async function createCollectionNft(params: CreateCollectionNftParams): Promise<CreateCollectionNftResult> {
	const umi = createMintAuthorityUmi();
	const mint = generateSigner(umi);

	const builder = transactionBuilder().add(
		createNft(umi, {
			mint,
			name: params.name,
			uri: params.uri,
			sellerFeeBasisPoints: percentAmount(0),
			isCollection: true,
			collectionDetails: some({__kind: 'V1', size: 0}),
		}),
	);

	const {signature} = await builder.sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		collectionAddress: mint.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

/**
 * Confirms that `walletAddress` currently holds at least one unit of `mintAddress`, by querying token
 * accounts directly against COSMETICS_MINT_RPC_URL (the same devnet endpoint cosmetics NFTs are minted
 * on — these mints don't exist on whatever network SOLANA_NETWORK/DAS currently points to, so this must
 * NOT go through the shared mainnet/devnet DAS lookup path). Fails closed (returns false) on any RPC
 * error rather than trusting an unverifiable claim.
 */
export async function verifyWalletHoldsMint(walletAddress: string, mintAddress: string): Promise<boolean> {
	try {
		const res = await fetch(COSMETICS_MINT_RPC_URL, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'getTokenAccountsByOwner',
				params: [walletAddress, {mint: mintAddress}, {encoding: 'jsonParsed', commitment: 'confirmed'}],
			}),
		});
		const json = (await res.json()) as any;
		const accounts: Array<any> = json?.result?.value ?? [];
		return accounts.some((acc) => {
			const amount = acc?.account?.data?.parsed?.info?.tokenAmount;
			return amount && Number(amount.amount) > 0;
		});
	} catch {
		return false;
	}
}

// Re-exported so callers that only need PDA derivation (e.g. to log/verify a metadata address) don't
// need to import from `@metaplex-foundation/mpl-token-metadata` directly.
export {findMasterEditionPda, findMetadataPda};
