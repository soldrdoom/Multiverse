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

import {PublicKey} from '@solana/web3.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_RPC_URL = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const NON_NFT_INTERFACES = new Set(['FungibleToken', 'FungibleAsset', 'Custom']);
const DAS_PAGE_LIMIT = 100;
const MAX_PAGES = 10; // cap at 1 000 NFTs

// ── Public types ──────────────────────────────────────────────────────────────

export interface NftItem {
	mint: string;
	name: string;
	imageUrl: string;
	mediaType: 'image' | 'video';
	collection: string | null;
	collectionMint: string | null;
	compressed: boolean;
}

// ── URL normalisation ─────────────────────────────────────────────────────────

function normaliseUrl(url: string): string {
	if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.slice(7)}`;
	if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
	return url;
}

// ── DAS mode (Helius / Shyft / QuickNode — supports traditional + cNFTs) ─────

interface DasAssetFile {
	uri: string;
	cdn_uri?: string;
	mime?: string;
}

interface DasAsset {
	interface: string;
	id: string;
	content?: {
		links?: {image?: string};
		files?: Array<DasAssetFile>;
		metadata?: {name?: string};
	};
	compression?: {compressed: boolean};
	grouping?: Array<{
		group_key: string;
		group_value: string;
		collection_metadata?: {name?: string};
	}>;
}

interface DasResponse {
	result: {total: number; limit: number; page: number; items: Array<DasAsset>};
	error?: {code: number; message: string};
}

function parseDasAsset(asset: DasAsset): NftItem | null {
	if (NON_NFT_INTERFACES.has(asset.interface)) return null;
	const content = asset.content;
	if (!content) return null;

	// Priority: video (MP4/WebM) > animated GIF > static image.
	// content.links.image is the static poster/thumbnail — always skip it when a richer
	// format is available in content.files.
	let imageUrl: string | null = null;
	let mediaType: 'image' | 'video' = 'image';

	const videoFile = content.files?.find((f) => f.mime === 'video/mp4' || f.mime === 'video/webm');
	const gifFile = content.files?.find((f) => f.mime === 'image/gif');

	if (videoFile) {
		imageUrl = normaliseUrl(videoFile.cdn_uri ?? videoFile.uri);
		mediaType = 'video';
	} else if (gifFile) {
		imageUrl = normaliseUrl(gifFile.cdn_uri ?? gifFile.uri);
	} else if (content.links?.image) {
		imageUrl = normaliseUrl(content.links.image);
	} else {
		const imageFile = content.files?.find((f) => f.mime?.startsWith('image/'));
		if (imageFile) imageUrl = normaliseUrl(imageFile.cdn_uri ?? imageFile.uri);
	}
	if (!imageUrl) return null;

	const name = content.metadata?.name?.trim() || `NFT ${asset.id.slice(0, 6)}…`;
	const col = asset.grouping?.find((g) => g.group_key === 'collection');

	return {
		mint: asset.id,
		name,
		imageUrl,
		mediaType,
		collection: col?.collection_metadata?.name ?? null,
		collectionMint: col?.group_value ?? null,
		compressed: asset.compression?.compressed ?? false,
	};
}

async function fetchWithDas(walletAddress: string, dasUrl: string): Promise<Array<NftItem>> {
	const accumulated: Array<NftItem> = [];
	let page = 1;
	let totalAssets = Infinity;

	while (accumulated.length < totalAssets && page <= MAX_PAGES) {
		const response = await fetch(dasUrl, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: `nft-p${page}`,
				method: 'getAssetsByOwner',
				params: {
					ownerAddress: walletAddress,
					page,
					limit: DAS_PAGE_LIMIT,
					displayOptions: {showCollectionMetadata: true},
					sortBy: {sortBy: 'created', sortDirection: 'desc'},
				},
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) throw new Error(`DAS API HTTP ${response.status}`);

		const data = (await response.json()) as DasResponse;
		if (data.error) throw new Error(`DAS error ${data.error.code}: ${data.error.message}`);

		const {items, total} = data.result;
		totalAssets = total;

		for (const asset of items) {
			const nft = parseDasAsset(asset);
			if (nft) accumulated.push(nft);
		}

		if (items.length < DAS_PAGE_LIMIT) break;
		page++;
	}

	return accumulated;
}

// ── Standard Solana RPC mode (traditional / non-compressed NFTs only) ─────────
//
// Flow:
//   1. getTokenAccountsByOwner  → all SPL token accounts for the wallet
//   2. Filter amount=1, decimals=0  → NFT mints
//   3. Derive Metaplex metadata PDA for each mint (no network call)
//   4. getMultipleAccounts (batched, ≤100)  → raw on-chain metadata
//   5. Parse borsh layout  → name + off-chain URI
//   6. Fetch URI JSON in parallel (≤20 concurrent)  → image URL
//
// cNFTs are stored in Merkle trees and cannot be enumerated this way;
// configure SOLANA_DAS_URL for full cNFT support.

async function rpcPost<T>(method: string, params: unknown[], rpcUrl: string): Promise<T> {
	const response = await fetch(rpcUrl, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
	const data = (await response.json()) as {result: {value: T}; error?: {code: number; message: string}};
	if (data.error) throw new Error(`Solana RPC error ${data.error.code}: ${data.error.message}`);
	return data.result.value;
}

/**
 * Derive the Metaplex Token Metadata PDA for a given mint.
 * Seeds: ["metadata", PROGRAM_ID, mint_pubkey]
 */
function getMetadataPDA(mint: string): string {
	const [pda] = PublicKey.findProgramAddressSync(
		[Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
		TOKEN_METADATA_PROGRAM_ID,
	);
	return pda.toBase58();
}

/**
 * Parse the borsh-encoded Metaplex Metadata v1 account to extract name and uri.
 *
 * On-chain fixed-size layout (all lengths are u32 LE, strings null-padded to max):
 *   offset  0      key (u8, must be 4)
 *   offset  1–32   update_authority (32 bytes)
 *   offset 33–64   mint (32 bytes)
 *   offset 65–68   name_len (u32 LE)
 *   offset 69–100  name data (max 32 bytes, null-padded)
 *   offset 101–104 symbol_len (u32 LE)
 *   offset 105–114 symbol data (max 10 bytes, null-padded)
 *   offset 115–118 uri_len (u32 LE)
 *   offset 119–318 uri data (max 200 bytes, null-padded)
 */
function parseMetadataAccount(data: Buffer): {name: string; uri: string} | null {
	if (data.length < 320) return null;
	if (data[0] !== 4) return null; // not MetadataV1 key

	const nameLen = Math.min(data.readUInt32LE(65), 32);
	const name = data
		.slice(69, 69 + nameLen)
		.toString('utf-8')
		.replace(/\0/g, '')
		.trim();

	const uriLen = Math.min(data.readUInt32LE(115), 200);
	const uri = data
		.slice(119, 119 + uriLen)
		.toString('utf-8')
		.replace(/\0/g, '')
		.trim();

	return {name: name || 'Unknown NFT', uri};
}

/** Fetch the off-chain JSON metadata and extract the image URL. */
async function fetchImageFromUri(uri: string): Promise<string | null> {
	if (!uri) return null;
	try {
		const res = await fetch(normaliseUrl(uri), {
			signal: AbortSignal.timeout(8_000),
			headers: {Accept: 'application/json'},
		});
		if (!res.ok) return null;
		const json = (await res.json()) as {image?: string};
		return json.image ? normaliseUrl(json.image) : null;
	} catch {
		return null;
	}
}

/** Run async tasks with a capped concurrency (avoids overwhelming gateways). */
async function withConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<Array<T>> {
	const results: Array<T> = new Array(tasks.length);
	let cursor = 0;
	async function runNext(): Promise<void> {
		const i = cursor++;
		if (i >= tasks.length) return;
		results[i] = await tasks[i]();
		await runNext();
	}
	await Promise.all(Array.from({length: Math.min(limit, tasks.length)}, runNext));
	return results;
}

function chunkArray<T>(arr: Array<T>, size: number): Array<Array<T>> {
	const chunks: Array<Array<T>> = [];
	for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
	return chunks;
}

async function fetchWithStandardRpc(walletAddress: string): Promise<Array<NftItem>> {
	// 1. Get all token accounts owned by this wallet.
	type TokenAccountValue = Array<{
		account: {data: {parsed: {info: {mint: string; tokenAmount: {amount: string; decimals: number}}}}};
	}>;

	const tokenAccounts = await rpcPost<TokenAccountValue>(
		'getTokenAccountsByOwner',
		[walletAddress, {programId: TOKEN_PROGRAM_ID}, {encoding: 'jsonParsed'}],
		STANDARD_RPC_URL,
	);

	// 2. Filter for NFT mints: exactly 1 token, 0 decimals.
	const nftMints = tokenAccounts
		.filter((acc) => {
			const {amount, decimals} = acc.account.data.parsed.info.tokenAmount;
			return amount === '1' && decimals === 0;
		})
		.map((acc) => acc.account.data.parsed.info.mint);

	if (nftMints.length === 0) return [];

	// 3. Derive Metaplex metadata PDAs.
	const metadataPDAs = nftMints.map(getMetadataPDA);

	// 4. Batch-fetch metadata accounts (max 100 per call).
	type MultipleAccountsValue = Array<{data: [string, string]} | null>;
	const chunks = chunkArray(metadataPDAs, 100);
	const chunkResults = await Promise.all(
		chunks.map((ch) => rpcPost<MultipleAccountsValue>('getMultipleAccounts', [ch, {encoding: 'base64'}], STANDARD_RPC_URL)),
	);
	const metadataAccounts = chunkResults.flat();

	// 5. Parse borsh to get name + off-chain URI.
	const parsed: Array<{mint: string; name: string; uri: string}> = [];
	for (let i = 0; i < metadataAccounts.length; i++) {
		const account = metadataAccounts[i];
		if (!account) continue;
		const buf = Buffer.from(account.data[0], 'base64');
		const meta = parseMetadataAccount(buf);
		if (meta?.uri) parsed.push({mint: nftMints[i], ...meta});
	}

	// 6. Fetch off-chain JSON to resolve image URLs (max 20 concurrent).
	const nfts = await withConcurrency(
		parsed.map((meta) => async () => {
			const imageUrl = await fetchImageFromUri(meta.uri);
			if (!imageUrl) return null;
			return {
				mint: meta.mint,
				name: meta.name,
				imageUrl,
				mediaType: 'image',
				collection: null,
				collectionMint: null,
				compressed: false,
			} satisfies NftItem;
		}),
		20,
	);

	return nfts.filter((n): n is NftItem => n !== null);
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Fetch all NFTs for a Solana wallet address.
 *
 * When `dasUrl` is provided (e.g. a Helius/Shyft endpoint configured via the
 * SOLANA_DAS_URL environment variable), both traditional and compressed NFTs
 * are returned via the DAS `getAssetsByOwner` method.
 *
 * Without a DAS URL, falls back to standard Solana RPC — which covers
 * traditional (non-compressed) NFTs only.
 */
export async function fetchNftsForWallet(walletAddress: string, dasUrl: string | null): Promise<Array<NftItem>> {
	if (dasUrl) {
		return fetchWithDas(walletAddress, dasUrl);
	}
	return fetchWithStandardRpc(walletAddress);
}
