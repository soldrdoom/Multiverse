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

import {Config} from '@fluxer/api/src/Config';
import {CosmeticsRepository, isPendingMintSetupSentinel} from '@fluxer/api/src/cosmetics/CosmeticsRepository';
import type {CosmeticListingRow} from '@fluxer/api/src/database/types/CosmeticTypes';
import type {IStorageService} from '@fluxer/api/src/infrastructure/IStorageService';
import {Logger} from '@fluxer/api/src/Logger';
import {
	createCoreCollection,
	createListingCandyMachine,
	mintCoreAsset,
	mintFromCandyMachine,
	waitForCoreCandyMachinePropagation,
	waitForCoreCollectionPropagation,
} from '@fluxer/solana_mint/src/CoreMintClient';
import {isMintingConfigured} from '@fluxer/solana_mint/src/MintConfig';

/**
 * Glues the cosmetics domain (a listing + a paid purchase) to `@fluxer/solana_mint`'s Metaplex
 * Core / Core Candy Machine primitives (`@fluxer/solana_mint/src/CoreMintClient`): lazily deploys
 * a per-listing Collection (+ Candy Machine for capped listings) and shared off-chain metadata the
 * first time a listing is actually bought, then mints.
 *
 * Deliberately lives in packages/api (not @fluxer/solana_mint) — it depends on IStorageService and
 * Config.endpoints.staticCdn, which are app-layer concerns @fluxer/solana_mint has no business
 * knowing about.
 *
 * Supersedes the legacy `MintClient.tsx` (`@metaplex-foundation/mpl-token-metadata`) path this
 * file used to call — Core assets aren't SPL tokens, and Candy Machine's `itemsAvailable` /
 * `itemsRedeemed` counters give this domain a real, on-chain-enforced supply cap that Core's own
 * `MasterEdition`-style `maxSupply` plugin does not (see CoreMintClient.tsx's header comment).
 */

const cosmeticsRepo = new CosmeticsRepository();

/** Metaplex's on-chain `name` field is capped at 32 bytes; listing names can exceed that. */
function truncateForOnChainName(name: string): string {
	const bytes = new TextEncoder().encode(name);
	if (bytes.length <= 32) return name;
	// Truncate by UTF-16 code units until the UTF-8 byte length fits; simple and safe enough for
	// the mostly-ASCII listing names this marketplace expects.
	let truncated = name;
	while (new TextEncoder().encode(truncated).length > 32) {
		truncated = truncated.slice(0, -1);
	}
	return truncated;
}

function buildListingMetadataJson(listing: CosmeticListingRow): string {
	return JSON.stringify({
		name: listing.name,
		description: listing.description ?? '',
		image: listing.image_url ?? '',
		attributes: [
			{trait_type: 'Cosmetic Type', value: listing.cosmetic_type},
			{trait_type: 'Rarity', value: listing.rarity},
		],
		properties: {
			files: listing.image_url ? [{uri: listing.image_url, type: 'image/png'}] : [],
			category: 'image',
		},
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown by `ensureListingMintSetup` when setup could not be completed (or confirmed complete). */
export class ListingMintSetupFailedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ListingMintSetupFailedError';
	}
}

export interface ListingMintSetup {
	collectionAddress: string;
	candyMachineAddress: string | null;
	metadataUri: string;
}

const SETUP_POLL_MAX_ATTEMPTS = 8;
const SETUP_POLL_DELAY_MS = 3000;

/**
 * Idempotently ensures a listing's on-chain mint setup (Core Collection, optional Core Candy
 * Machine for capped listings, and shared off-chain metadata) exists, performing it on first use
 * and reusing it forever after. Concurrency-safe via `CosmeticsRepository.claimListingMintSetup`'s
 * LWT claim on `collection_address` — see that method's doc comment for the exact mechanism.
 *
 * Must be called (and awaited to success) before any payment is verified in both the invoice and
 * purchase routes, so a setup failure never happens after a buyer has already paid. It's also
 * called again from `mintPurchasedCosmetic` below — cheap and idempotent once setup is done, so
 * the duplicate call is harmless.
 */
export async function ensureListingMintSetup(
	listing: CosmeticListingRow,
	storageService: IStorageService,
): Promise<ListingMintSetup> {
	const {applied} = await cosmeticsRepo.claimListingMintSetup(listing.id);

	if (!applied) {
		// Either setup is already complete, or another concurrent request is doing it right now.
		// Poll until collection_address stops being a pending-setup sentinel (mirrors this exact
		// controller file's own "retry up to 8x with 3s delay" convention for transaction
		// confirmation lag — see pollSolanaTransaction). Note this poll budget (~24s) is well under
		// the sentinel's own staleness threshold, so a genuinely-crashed claimant won't get
		// reclaimed and finish successfully mid-poll here — the poll will simply time out and the
		// caller can retry, at which point `claimListingMintSetup` will see the stale claim itself.
		for (let attempt = 0; attempt < SETUP_POLL_MAX_ATTEMPTS; attempt++) {
			const latest = await cosmeticsRepo.getListingById(listing.id);
			if (!latest) throw new ListingMintSetupFailedError('Listing no longer exists');
			if (latest.collection_address !== null && !isPendingMintSetupSentinel(latest.collection_address)) {
				return {
					collectionAddress: latest.collection_address,
					candyMachineAddress: latest.candy_machine_address,
					metadataUri: latest.metadata_uri ?? '',
				};
			}
			if (attempt < SETUP_POLL_MAX_ATTEMPTS - 1) await sleep(SETUP_POLL_DELAY_MS);
		}
		throw new ListingMintSetupFailedError('Please try again in a moment.');
	}

	// We hold the exclusive claim — perform the actual metadata upload + on-chain setup. Any
	// failure along the way reverts collection_address back to null so a future attempt can
	// reclaim and retry, rather than leaving the listing stuck on the 'pending' sentinel forever.
	try {
		const metadataJson = buildListingMetadataJson(listing);
		const key = `${listing.id}.json`;
		await storageService.uploadAvatar({
			prefix: 'cosmetics-metadata',
			key,
			body: new TextEncoder().encode(metadataJson),
		});
		const metadataUri = `${Config.endpoints.staticCdn}/cosmetics-metadata/${key}`;

		const {collectionAddress} = await createCoreCollection({
			name: truncateForOnChainName(listing.name),
			uri: metadataUri,
		});
		// Guard against the devnet read-after-write propagation lag before this collection is
		// referenced by a following transaction (createListingCandyMachine below, or a
		// purchase-time mint call against it) — see CoreMintClient.tsx's header comment.
		await waitForCoreCollectionPropagation(collectionAddress);

		let candyMachineAddress: string | null = null;
		if (listing.max_supply !== null) {
			const candyMachine = await createListingCandyMachine({
				collection: collectionAddress,
				itemsAvailable: listing.max_supply,
				name: truncateForOnChainName(listing.name),
				uri: metadataUri,
			});
			candyMachineAddress = candyMachine.candyMachineAddress;
			// Same devnet read-after-write propagation-lag guard as the Collection above — a mint
			// attempt against this Candy Machine can happen later in this very request (the
			// first-purchase-of-a-new-capped-listing path continues on to `mintFromCandyMachine`
			// once this function returns), so it must be visible before we return. See
			// `waitForCoreCandyMachinePropagation`'s doc comment / CoreMintClient.tsx's header.
			await waitForCoreCandyMachinePropagation(candyMachineAddress);
			await cosmeticsRepo.patchListingMintFields(listing.id, {candy_machine_address: candyMachineAddress});
		}

		await cosmeticsRepo.patchListingMintFields(listing.id, {metadata_uri: metadataUri});
		// Last: write the real collection_address, overwriting the 'pending' sentinel — this is
		// the signal every other request polling this listing is watching for.
		await cosmeticsRepo.patchListingMintFields(listing.id, {collection_address: collectionAddress});

		return {collectionAddress, candyMachineAddress, metadataUri};
	} catch (err) {
		try {
			await cosmeticsRepo.patchListingMintFields(listing.id, {collection_address: null});
		} catch (revertErr) {
			Logger.error(
				{revertErr, listingId: listing.id},
				'Failed to revert collection_address sentinel after cosmetics listing mint setup failure',
			);
		}
		Logger.error({err, listingId: listing.id}, 'Cosmetics listing mint setup failed');
		throw new ListingMintSetupFailedError('Setup failed, please try again');
	}
}

/**
 * Thrown by `mintPurchasedCosmetic` when a capped listing's Core Candy Machine rejects a mint
 * on-chain because it's exhausted (`itemsRedeemed === itemsAvailable`) — the real, program-
 * enforced supply cap, as opposed to `reserveMintSlot`'s local cache pre-check. Verified on devnet
 * to surface as an Anchor program error, code 6006 (`CandyMachineEmpty`), from program
 * `CMACYFENjoBMHzapRXyo1JZkVS6EtaDDzkjMrmQLvr4J`. Callers should treat this exactly like
 * `reserveMintSlot` returning `applied: false`: the payment already landed on-chain and stays
 * recorded, and the buyer is told to contact support.
 */
export class CosmeticListingSoldOutOnChainError extends Error {
	constructor(
		public readonly listingId: string,
		public override readonly cause: unknown,
	) {
		super(`Candy Machine for listing ${listingId} rejected the mint as sold out`);
		this.name = 'CosmeticListingSoldOutOnChainError';
	}
}

/**
 * Identifies a Candy Machine "sold out" rejection (the Candy Machine Core program's
 * `CandyMachineEmpty` error, Anchor error code 0x1776 / 6006) from whatever shape Umi's
 * `sendAndConfirm` throws for it, versus any other failure (RPC error, transient network issue,
 * etc.).
 *
 * Prefers a typed check: Umi's `ProgramRepository.resolveError` (invoked automatically inside
 * `createWeb3JsRpc`'s `sendTransaction`/`confirmTransaction` whenever the underlying error carries
 * `.logs`) parses `Custom program error: 0x<hex>` out of the transaction logs, maps it through the
 * matched program's own generated error table, and throws a typed `ProgramError` subclass with a
 * stable `.name` (`'CandyMachineEmpty'`) and numeric `.code` (`0x1776`) —
 * see `CmCandyMachineEmptyError` in `@metaplex-foundation/mpl-core-candy-machine`'s generated
 * errors and `createDefaultProgramRepository.cjs`'s `resolveError`. This is a real, checkable
 * identity rather than a guess at string shape.
 *
 * Falls back to string-matching only for cases Umi couldn't resolve to a typed error (e.g. the
 * program not registered in this Umi instance, or an unexpected log shape) — anchored to the exact
 * log substring Umi's own `resolveError` parses (`Custom program error: 0x1776`), not a bare
 * decimal/hex match that risks false-positiving on unrelated log content (compute units, slot
 * numbers, etc. can incidentally contain "6006" or "1776").
 */
function isCandyMachineSoldOutError(err: unknown): boolean {
	const CANDY_MACHINE_EMPTY_CODE = 0x1776; // 6006

	if (err && typeof err === 'object') {
		const typed = err as {name?: unknown; code?: unknown};
		if (typed.name === 'CandyMachineEmpty' && typed.code === CANDY_MACHINE_EMPTY_CODE) {
			return true;
		}
	}

	const parts: Array<string> = [];
	if (err instanceof Error) {
		parts.push(err.message);
		const withLogs = err as {logs?: unknown};
		if (withLogs.logs) {
			try {
				parts.push(JSON.stringify(withLogs.logs));
			} catch {
				/* ignore */
			}
		}
	} else {
		parts.push(String(err));
	}
	const haystack = parts.join(' ');
	return /CandyMachineEmpty/i.test(haystack) || /custom program error:\s*0x1776\b/i.test(haystack);
}

export interface MintPurchasedCosmeticParams {
	storageService: IStorageService;
	purchaseId: string;
	listing: CosmeticListingRow;
	destinationWallet: string;
}

export interface MintPurchasedCosmeticResult {
	mintAddress: string;
}

/**
 * Mints the NFT for a paid cosmetics purchase. Returns `null` (not an error) when minting isn't
 * configured on this deployment — callers should treat that as "payment succeeded, minting pending"
 * rather than failing the request. Throws only for genuine mint-attempt failures (RPC error, setup
 * failure, on-chain sold-out rejection — see `CosmeticListingSoldOutOnChainError`) so the caller
 * can decide how to degrade (this codebase's convention: never fail an already-verified payment
 * just because the follow-on mint step had a problem).
 */
export async function mintPurchasedCosmetic(
	params: MintPurchasedCosmeticParams,
): Promise<MintPurchasedCosmeticResult | null> {
	if (!isMintingConfigured()) return null;

	const {storageService, listing, destinationWallet} = params;

	// Idempotent no-op if setup already completed (the normal case here — the calling route
	// already ran this before payment was verified). Re-running it gets us the resolved
	// addresses without the caller having to thread them through separately.
	const setup = await ensureListingMintSetup(listing, storageService);

	if (listing.max_supply !== null) {
		if (!setup.candyMachineAddress) {
			// A capped listing whose setup succeeded should always have a Candy Machine — this
			// would mean setup was interrupted between the collection and Candy Machine writes in
			// a way `ensureListingMintSetup`'s revert-on-failure should have already caught.
			throw new Error(`Cosmetics listing ${listing.id} is capped but has no candy_machine_address after setup`);
		}
		try {
			const {assetAddress} = await mintFromCandyMachine({
				candyMachine: setup.candyMachineAddress,
				collection: setup.collectionAddress,
				destinationWallet,
			});
			return {mintAddress: assetAddress};
		} catch (err) {
			if (isCandyMachineSoldOutError(err)) {
				throw new CosmeticListingSoldOutOnChainError(listing.id, err);
			}
			throw err;
		}
	}

	const {assetAddress} = await mintCoreAsset({
		name: truncateForOnChainName(listing.name),
		uri: setup.metadataUri,
		collection: setup.collectionAddress,
		destinationWallet,
	});
	return {mintAddress: assetAddress};
}
