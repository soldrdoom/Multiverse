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

/**
 * Metaplex Core + Core Candy Machine minting path — parallel to `MintClient.tsx`'s legacy
 * `@metaplex-foundation/mpl-token-metadata` path. Added so creator-configurable per-listing supply
 * caps can be enforced ON-CHAIN rather than only in our own backend's bookkeeping.
 *
 * Why Candy Machine and not just Core's own `MasterEdition` plugin: Core's `maxSupply` on that
 * plugin is informational only — nothing on-chain stops minting past it. Core Candy Machine's
 * `itemsAvailable`/`itemsRedeemed` counters, by contrast, are tracked and enforced by the Candy
 * Machine program itself; a mint past `itemsAvailable` is provably refused on-chain. Candy Machine
 * also supports genuine one-at-a-time on-demand minting (not just scheduled bulk drops) via its
 * `edition` guard, which auto-assigns sequential edition numbers as each purchase arrives — exactly
 * what an uncoordinated, purchase-driven mint flow needs. Every copy of one listing shares the same
 * artwork/metadata (only the edition number differs), so Candy Machine's `hiddenSettings` mode (one
 * shared name/uri template, no per-item config-line upload) is the right configuration here — not
 * the per-item config-line list mode, which assumes a pre-uploaded fixed item set.
 *
 * Core assets are NOT SPL tokens — ownership lives directly on the asset account's own `owner`
 * field, fetched via Core's `fetchAsset`, not a classic SPL token account. `MintClient.tsx`'s
 * `verifyWalletHoldsMint` (which calls `getTokenAccountsByOwner`) does NOT work for these; use
 * `verifyWalletHoldsCoreAsset` below instead.
 *
 * Same conventions as `MintClient.tsx`: signs via a `createMintAuthorityUmi()`-style helper, reads
 * only `COSMETICS_MINT_RPC_URL` (never `SOLANA_NETWORK`/the shared DAS RPC — see `MintConfig.tsx`'s
 * header for why), and throws rather than swallowing mint-attempt errors so callers can distinguish
 * "sold out" (Candy Machine refusing past `itemsAvailable`) from other failures.
 *
 * Devnet RPC propagation lag landmine (verified empirically, cost significant debugging time —
 * don't re-derive this): the public `https://api.devnet.solana.com` endpoint load-balances across
 * multiple backend nodes with read-after-write lag. A transaction "confirmed" against one node isn't
 * necessarily visible yet to whichever node handles a *following* transaction's simulation. Calling
 * e.g. `mintCoreAsset`/`createListingCandyMachine` immediately after `createCoreCollection` with no
 * delay reproducibly makes the on-chain mpl-core/Candy Machine programs panic — "index out of bounds:
 * the len is 0 but the index is 0" — because the program reads the just-created Collection account on
 * a node that doesn't have it yet (empty account data), NOT because of any client/SDK incompatibility.
 * This looks exactly like a version-skew bug at first glance (it isn't — same symptom reproduced with
 * every combination of createCollectionV1/V2, hiddenSettings/configLineSettings, with/without a
 * pre-attached plugin) and cost a full debugging pass to rule out. A ~10s gap (or a poll-until-
 * `fetchCollection`-succeeds loop) between creating an account and referencing it in a later
 * transaction reliably avoids it; callers wiring this into the real purchase flow should either add
 * that gap/poll for capped-listing setup (`createListingCandyMachine` right after `createCoreCollection`)
 * or point `COSMETICS_MINT_RPC_URL` at a dedicated (non-load-balanced) RPC provider, which shouldn't
 * exhibit this at all.
 */

import {
	COSMETICS_MINT_AUTHORITY_SECRET_KEY,
	COSMETICS_MINT_RPC_URL,
	isMintingConfigured,
} from '@fluxer/solana_mint/src/MintConfig';
import {decodeSecretKey} from '@fluxer/solana_mint/src/SecretKeyCodec';
import {createCollectionV1, createV2, fetchAsset, fetchCollection, mplCore} from '@metaplex-foundation/mpl-core';
import {
	create as createCandyMachineAndGuard,
	fetchCandyMachine,
	mintV1 as mintFromCandyMachineV1,
	mplCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine';
import {generateSigner, keypairIdentity, publicKey, type Umi} from '@metaplex-foundation/umi';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';

/**
 * Builds a Umi client authenticated as the mint authority, with Core and Core Candy Machine
 * registered (`mplCandyMachine()` also pulls in `mplTokenMetadata()` internally — harmless, it's a
 * separate Umi instance per call). Throws if minting isn't configured, matching
 * `MintClient.tsx`'s `createMintAuthorityUmi()`.
 */
export function createCoreMintAuthorityUmi(): Umi {
	if (!isMintingConfigured() || !COSMETICS_MINT_AUTHORITY_SECRET_KEY) {
		throw new Error('COSMETICS_MINT_AUTHORITY_SECRET_KEY is not configured — minting is inert on this deployment');
	}
	const umi = createUmi(COSMETICS_MINT_RPC_URL).use(mplCore()).use(mplCandyMachine());
	const secretKeyBytes = decodeSecretKey(COSMETICS_MINT_AUTHORITY_SECRET_KEY);
	const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
	umi.use(keypairIdentity(authorityKeypair));
	return umi;
}

export interface CreateCoreCollectionParams {
	name: string;
	uri: string;
}

export interface CreateCoreCollectionResult {
	collectionAddress: string;
	txSignature: string;
}

/**
 * Creates a plain Core Collection (no Candy Machine attached), authority = mint authority wallet.
 * Used directly for uncapped listings, and as the parent Collection every capped listing's Candy
 * Machine mints its items into.
 *
 * Uses `createCollectionV1`, not `createCollectionV2` (which is otherwise the newer/default choice
 * elsewhere in this file for asset creation) — chosen to exactly match every Candy Machine test
 * fixture in metaplex-foundation/mpl-core-candy-machine's own `clients/js/test/_setup.ts`, since a
 * Candy Machine gets wired to this Collection later. Both versions were verified working on devnet
 * during development (see the RPC-propagation-lag note above for what actually looked like a V1/V2
 * incompatibility at first and wasn't) — V1 is kept here on the "match upstream's own tested
 * configuration exactly" principle, not because V2 is broken.
 */
export async function createCoreCollection(params: CreateCoreCollectionParams): Promise<CreateCoreCollectionResult> {
	const umi = createCoreMintAuthorityUmi();
	const collection = generateSigner(umi);

	const {signature} = await createCollectionV1(umi, {
		collection,
		name: params.name,
		uri: params.uri,
	}).sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		collectionAddress: collection.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

/**
 * Works around the devnet read-after-write propagation lag documented in this file's header
 * comment: polls `fetchCollection` (up to 10 attempts, 1s apart — a real fetch succeeding is a
 * more precise readiness signal than a fixed sleep) until the just-created Collection account is
 * actually visible, so a following transaction that references it (e.g.
 * `createListingCandyMachine`, or a purchase-time `mintCoreAsset`/`mintFromCandyMachine` call
 * against the same collection) doesn't land on an RPC backend node that hasn't seen it yet. Never
 * throws — if the collection still isn't visible after the poll budget, it gives up silently and
 * lets the caller's own on-chain call surface whatever the real problem turns out to be, rather
 * than turning a slow-but-fine propagation into a hard failure.
 */
export async function waitForCoreCollectionPropagation(collectionAddress: string): Promise<void> {
	const umi = createUmi(COSMETICS_MINT_RPC_URL).use(mplCore());
	const address = publicKey(collectionAddress);
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			await fetchCollection(umi, address);
			return;
		} catch {
			// Not yet visible on whichever backend node served this read — retry.
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

/**
 * Same devnet read-after-write propagation-lag guard as `waitForCoreCollectionPropagation`, but for
 * a just-created Candy Machine account rather than a Collection — the same class of lag risk
 * applies here: a mint attempt against a Candy Machine referenced immediately after
 * `createListingCandyMachine` (in the same request, on the first-purchase-of-a-new-capped-listing
 * path) can land on an RPC backend node that hasn't seen the just-created account yet. Polls
 * `fetchCandyMachine` (up to 10 attempts, 1s apart) until it resolves. Never throws — if the Candy
 * Machine still isn't visible after the poll budget, it gives up silently and lets the caller's own
 * on-chain call surface whatever the real problem turns out to be.
 */
export async function waitForCoreCandyMachinePropagation(candyMachineAddress: string): Promise<void> {
	const umi = createUmi(COSMETICS_MINT_RPC_URL).use(mplCore()).use(mplCandyMachine());
	const address = publicKey(candyMachineAddress);
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			await fetchCandyMachine(umi, address);
			return;
		} catch {
			// Not yet visible on whichever backend node served this read — retry.
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

export interface MintCoreAssetParams {
	/** NFT display name (Metaplex on-chain name field is capped at 32 bytes; callers should pre-truncate). */
	name: string;
	/** Off-chain metadata JSON URI (name/description/image/attributes) — build and host this before calling. */
	uri: string;
	/** An existing plain Core Collection (from `createCoreCollection`) to mint this asset into. */
	collection: string;
	/** Buyer's Solana wallet — becomes the new asset's `owner`. */
	destinationWallet: string;
}

export interface MintCoreAssetResult {
	assetAddress: string;
	txSignature: string;
}

/**
 * Mints one Core asset directly into an existing plain Collection, owner = `destinationWallet`, no
 * cap. This is the uncapped-listing purchase-time mint path — the direct Core analogue of
 * `MintClient.tsx`'s `mintCosmeticNft`. `owner` must be passed explicitly: Core's `createV2`
 * defaults an unset owner to the signing authority (the mint authority wallet), not the buyer.
 */
export async function mintCoreAsset(params: MintCoreAssetParams): Promise<MintCoreAssetResult> {
	const umi = createCoreMintAuthorityUmi();
	const asset = generateSigner(umi);

	const {signature} = await createV2(umi, {
		asset,
		collection: publicKey(params.collection),
		owner: publicKey(params.destinationWallet),
		name: params.name,
		uri: params.uri,
	}).sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		assetAddress: asset.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

export interface CreateListingCandyMachineParams {
	/** An existing plain Core Collection every mint from this Candy Machine will belong to. */
	collection: string;
	/** Hard on-chain cap — the Candy Machine program refuses any mint once `itemsRedeemed` reaches this. */
	itemsAvailable: number;
	/** Shared name prefix for every edition minted from this machine (all editions look identical apart from edition number). */
	name: string;
	/** Shared off-chain metadata URI for every edition minted from this machine. */
	uri: string;
}

export interface CreateListingCandyMachineResult {
	candyMachineAddress: string;
	txSignature: string;
}

/**
 * One-time setup for a capped listing: creates a Core Candy Machine with `hiddenSettings` (one
 * shared name/uri template — no per-item config-line upload, since every edition of a listing is
 * identical apart from its edition number) and the `edition` guard (auto-assigns sequential edition
 * numbers to each one-at-a-time purchase mint). Mint authority wallet is both the Candy Machine's
 * authority and — since it's also the Collection's update authority, having created it via
 * `createCoreCollection` — the required `collectionUpdateAuthority` signer.
 */
export async function createListingCandyMachine(
	params: CreateListingCandyMachineParams,
): Promise<CreateListingCandyMachineResult> {
	const umi = createCoreMintAuthorityUmi();
	const candyMachine = generateSigner(umi);

	const builder = await createCandyMachineAndGuard(umi, {
		candyMachine,
		collection: publicKey(params.collection),
		collectionUpdateAuthority: umi.identity,
		itemsAvailable: params.itemsAvailable,
		isMutable: true,
		hiddenSettings: {
			name: params.name,
			uri: params.uri,
			// Off-chain "hash of a cache file" field — purely informational (for wallets/explorers
			// that want to cross-check a config cache), not enforced by the program itself. We have
			// no such cache file since hiddenSettings mode has no per-item config lines to hash.
			hash: new Uint8Array(32),
		},
		guards: {
			edition: {editionStartOffset: 0},
		},
	});

	const {signature} = await builder.sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		candyMachineAddress: candyMachine.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

export interface MintFromCandyMachineParams {
	candyMachine: string;
	/** Must match the Collection the Candy Machine was created with in `createListingCandyMachine`. */
	collection: string;
	destinationWallet: string;
}

export interface MintFromCandyMachineResult {
	assetAddress: string;
	txSignature: string;
}

/**
 * Mints exactly one item from an existing Candy Machine to `destinationWallet`, through the
 * `edition` guard. This is the capped-listing purchase-time mint path — the actual on-chain
 * refusal-past-`itemsAvailable` happens here. Deliberately does NOT catch/swallow the SDK's error:
 * once the Candy Machine is exhausted, the underlying send fails and that failure IS the "sold out"
 * signal — callers should treat any throw from this function as sold-out-or-failed and let it
 * propagate, per this package's error-handling convention.
 */
export async function mintFromCandyMachine(params: MintFromCandyMachineParams): Promise<MintFromCandyMachineResult> {
	const umi = createCoreMintAuthorityUmi();
	const asset = generateSigner(umi);

	const builder = mintFromCandyMachineV1(umi, {
		candyMachine: publicKey(params.candyMachine),
		collection: publicKey(params.collection),
		asset,
		owner: publicKey(params.destinationWallet),
	});

	const {signature} = await builder.sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}});

	return {
		assetAddress: asset.publicKey.toString(),
		txSignature: Buffer.from(signature).toString('base64'),
	};
}

/**
 * Core-aware replacement for `MintClient.tsx`'s `verifyWalletHoldsMint` (which uses
 * `getTokenAccountsByOwner` — Core assets have no SPL token account to look up). Fetches the Core
 * asset account directly against `COSMETICS_MINT_RPC_URL` and checks its `owner` field. Doesn't
 * need the mint authority key (read-only), matching `verifyWalletHoldsMint`'s "works even when
 * minting itself isn't configured" convention. Fails closed (returns false) on any RPC/fetch error.
 */
export async function verifyWalletHoldsCoreAsset(walletAddress: string, assetAddress: string): Promise<boolean> {
	try {
		const umi = createUmi(COSMETICS_MINT_RPC_URL).use(mplCore());
		const asset = await fetchAsset(umi, publicKey(assetAddress));
		return asset.owner.toString() === walletAddress;
	} catch {
		return false;
	}
}
