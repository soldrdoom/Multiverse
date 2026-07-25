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

import {SOLANA_RPC_URL} from '@fluxer/solana_das/src/SolanaNetwork';
import {PublicKey} from '@solana/web3.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_RPC_URL = SOLANA_RPC_URL;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const NON_NFT_INTERFACES = new Set(['FungibleToken', 'FungibleAsset', 'Custom']);
const DAS_PAGE_LIMIT = 100;
const MAX_PAGES = 10; // cap at 1 000 NFTs

// ── Public types ──────────────────────────────────────────────────────────────

export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface NftItem {
	mint: string;
	name: string;
	imageUrl: string;
	mediaType: 'image' | 'video';
	collection: string | null;
	collectionMint: string | null;
	compressed: boolean;
	/** Alias of imageUrl — the field name the cosmetics-apply feature (OwnedCosmeticNft) expects. */
	image: string;
	/**
	 * Cosmetic slot this NFT can be applied to, derived from a "Cosmetic Type"
	 * trait in the NFT's metadata attributes. null for the vast majority of a
	 * wallet's NFTs, which aren't tagged as a Multiverse cosmetic at all.
	 */
	cosmetic_type: string | null;
	/** Rarity tier from a "Rarity" trait. Defaults to "common" when absent. */
	rarity: CosmeticRarity;
}

/**
 * The minimal shape needed to evaluate a tokengate: does this wallet hold an
 * asset matching a configured mint or collection address? Unlike NftItem,
 * this is never dropped for missing display metadata (no image/video) —
 * a wallet can legitimately hold a matching mint/cNFT whose off-chain
 * metadata can't be resolved to a displayable image, and it must still
 * satisfy the gate.
 */
export interface GatingAsset {
	mint: string;
	collectionMint: string | null;
	compressed: boolean;
}

// ── Cosmetic trait parsing ────────────────────────────────────────────────────
//
// Multiverse cosmetic NFTs are expected to carry "Cosmetic Type" / "Rarity"
// entries in their metadata `attributes` array (the standard Metaplex
// trait_type/value convention). Everything else a wallet holds — PFPs, DRiP
// airdrops, etc. — simply has no such trait and comes back with
// cosmetic_type: null, which excludes it from cosmetic-slot pickers client-side.

const RARITY_VALUES = new Set<CosmeticRarity>(['common', 'uncommon', 'rare', 'epic', 'legendary']);

interface MetadataAttribute {
	trait_type?: string;
	value?: unknown;
}

function normaliseTraitValue(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalised = value
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	return normalised || null;
}

function parseCosmeticTraits(attributes: Array<MetadataAttribute> | undefined): {
	cosmeticType: string | null;
	rarity: CosmeticRarity;
} {
	let cosmeticType: string | null = null;
	let rarity: CosmeticRarity | null = null;

	for (const attr of attributes ?? []) {
		const traitType = attr.trait_type?.trim().toLowerCase();
		if (traitType === 'cosmetic type' || traitType === 'cosmetic_type') {
			cosmeticType = normaliseTraitValue(attr.value);
		} else if (traitType === 'rarity') {
			const value = normaliseTraitValue(attr.value);
			if (value && RARITY_VALUES.has(value as CosmeticRarity)) rarity = value as CosmeticRarity;
		}
	}

	return {cosmeticType, rarity: rarity ?? 'common'};
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
		metadata?: {name?: string; attributes?: Array<MetadataAttribute>};
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
	const {cosmeticType, rarity} = parseCosmeticTraits(content.metadata?.attributes);

	return {
		mint: asset.id,
		name,
		imageUrl,
		image: imageUrl,
		mediaType,
		collection: col?.collection_metadata?.name ?? null,
		collectionMint: col?.group_value ?? null,
		compressed: asset.compression?.compressed ?? false,
		cosmetic_type: cosmeticType,
		rarity,
	};
}

/**
 * Gating-oriented parse: only needs mint/collection/compression, so (unlike
 * parseDasAsset) it never drops an asset for lacking a resolvable image.
 */
function parseDasAssetForGating(asset: DasAsset): GatingAsset | null {
	if (NON_NFT_INTERFACES.has(asset.interface)) return null;
	const col = asset.grouping?.find((g) => g.group_key === 'collection');
	return {
		mint: asset.id,
		collectionMint: col?.group_value ?? null,
		compressed: asset.compression?.compressed ?? false,
	};
}

async function fetchDasPages<T>(
	walletAddress: string,
	dasUrl: string,
	parse: (asset: DasAsset) => T | null,
): Promise<Array<T>> {
	const accumulated: Array<T> = [];
	let page = 1;

	// Note: Helius's `total` field is not a reliable grand total — in practice it
	// just echoes back `limit` whenever a full page is returned, on every page.
	// The only trustworthy end-of-pagination signal is a short page.
	while (page <= MAX_PAGES) {
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

		const {items} = data.result;

		for (const asset of items) {
			const parsed = parse(asset);
			if (parsed) accumulated.push(parsed);
		}

		if (items.length < DAS_PAGE_LIMIT) break;
		page++;
	}

	return accumulated;
}

async function fetchWithDas(walletAddress: string, dasUrl: string): Promise<Array<NftItem>> {
	return fetchDasPages(walletAddress, dasUrl, parseDasAsset);
}

/**
 * Fetch the minimal gating-relevant shape of every asset (NFT or cNFT) a
 * wallet holds, via the DAS `getAssetsByOwner` method. Requires a DAS
 * endpoint (Helius/Shyft/QuickNode) — cNFTs cannot be enumerated any other
 * way, since they live in Merkle trees rather than as SPL token accounts.
 */
export async function fetchGatingAssetsForWallet(walletAddress: string, dasUrl: string): Promise<Array<GatingAsset>> {
	return fetchDasPages(walletAddress, dasUrl, parseDasAssetForGating);
}

/**
 * Does any asset in `assets` satisfy the configured gate, per `matchMode`?
 * `matchMode` mirrors `TokenGateMatchMode` in `@fluxer/constants/src/GuildConstants`
 * (0 = EXACT_ASSET, 1 = COLLECTION) -- passed as a raw number rather than
 * importing that enum, since this package has no other dependency on
 * `@fluxer/constants` and one enum isn't worth adding one.
 */
export function matchesTokenGate(assets: ReadonlyArray<GatingAsset>, gateAddress: string, matchMode: number): boolean {
	if (matchMode === 1) {
		return assets.some((asset) => asset.collectionMint === gateAddress);
	}
	return assets.some((asset) => asset.mint === gateAddress);
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

/** Fetch the off-chain JSON metadata and extract the image URL + cosmetic traits. */
async function fetchNftMetadataJson(
	uri: string,
): Promise<{imageUrl: string | null; attributes?: Array<MetadataAttribute>}> {
	if (!uri) return {imageUrl: null};
	try {
		const res = await fetch(normaliseUrl(uri), {
			signal: AbortSignal.timeout(8_000),
			headers: {Accept: 'application/json'},
		});
		if (!res.ok) return {imageUrl: null};
		const json = (await res.json()) as {image?: string; attributes?: Array<MetadataAttribute>};
		return {
			imageUrl: json.image ? normaliseUrl(json.image) : null,
			attributes: json.attributes,
		};
	} catch {
		return {imageUrl: null};
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
		chunks.map((ch) =>
			rpcPost<MultipleAccountsValue>('getMultipleAccounts', [ch, {encoding: 'base64'}], STANDARD_RPC_URL),
		),
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
		parsed.map((meta) => async (): Promise<NftItem | null> => {
			const {imageUrl, attributes} = await fetchNftMetadataJson(meta.uri);
			if (!imageUrl) return null;
			const {cosmeticType, rarity} = parseCosmeticTraits(attributes);
			return {
				mint: meta.mint,
				name: meta.name,
				imageUrl,
				image: imageUrl,
				mediaType: 'image',
				collection: null,
				collectionMint: null,
				compressed: false,
				cosmetic_type: cosmeticType,
				rarity,
			};
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
