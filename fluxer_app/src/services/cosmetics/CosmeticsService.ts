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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import type {
	AppliedCosmeticEntry,
	CosmeticsInvoiceResponse,
	CreateListingRequest,
	CreatorApplyResponse,
	CreatorListingEntry,
	CreatorStatusResponse,
	OwnedCosmeticNft,
	ProfileCosmeticSlot,
	PurchaseCosmeticRequest,
	PurchaseCosmeticResponse,
	ServerCosmeticSlot,
	StoreListingNft,
	UpdateListingRequest,
} from '@fluxer/schema/src/domains/cosmetics/CosmeticSchemas';

// ─── Shop catalog ─────────────────────────────────────────────────────────────

/** Fetch the full cosmetics shop catalog. Returns empty until collection launches. */
export async function fetchCosmeticsStore(): Promise<Array<StoreListingNft>> {
	const response = await http.get<{items: Array<StoreListingNft>}>({url: Endpoints.COSMETICS_STORE});
	return response.body.items;
}

// ─── NFT listing ──────────────────────────────────────────────────────────────

/** Fetch all cosmetic NFTs the current user owns in their linked Solana wallet. */
export async function fetchOwnedNfts(): Promise<Array<OwnedCosmeticNft>> {
	const response = await http.get<{nfts: Array<OwnedCosmeticNft>}>({url: Endpoints.NFTS});
	return response.body.nfts;
}

// ─── Profile cosmetics ────────────────────────────────────────────────────────

/** Fetch applied profile cosmetics for the current user. */
export async function fetchUserCosmetics(): Promise<Array<AppliedCosmeticEntry>> {
	const response = await http.get<{applied: Array<AppliedCosmeticEntry>}>({url: Endpoints.USER_COSMETICS});
	return response.body.applied;
}

/** Fetch applied profile cosmetics for any user (public read for rendering). */
export async function fetchPublicUserCosmetics(userId: string): Promise<Array<AppliedCosmeticEntry>> {
	const response = await http.get<{applied: Array<AppliedCosmeticEntry>}>({
		url: Endpoints.USER_COSMETICS_PUBLIC(userId),
	});
	return response.body.applied;
}

/** Apply a cosmetic NFT to a profile slot. */
export async function applyProfileCosmetic(
	slot: ProfileCosmeticSlot,
	mintAddress: string,
): Promise<Array<AppliedCosmeticEntry>> {
	const response = await http.put<{ok: boolean; applied: Array<AppliedCosmeticEntry>}>({
		url: Endpoints.USER_COSMETICS,
		body: {slot, mint_address: mintAddress},
	});
	return response.body.applied;
}

/** Clear a profile cosmetic slot. */
export async function clearProfileCosmetic(slot: ProfileCosmeticSlot): Promise<Array<AppliedCosmeticEntry>> {
	const response = await http.put<{ok: boolean; applied: Array<AppliedCosmeticEntry>}>({
		url: Endpoints.USER_COSMETICS,
		body: {slot, mint_address: null},
	});
	return response.body.applied;
}

// ─── Server cosmetics ─────────────────────────────────────────────────────────

/** Fetch applied server cosmetics for a guild. */
export async function fetchGuildCosmetics(
	guildId: string,
): Promise<Array<AppliedCosmeticEntry & {applied_by: string}>> {
	const response = await http.get<{applied: Array<AppliedCosmeticEntry & {applied_by: string}>}>({
		url: Endpoints.GUILD_COSMETICS(guildId),
	});
	return response.body.applied;
}

/** Apply a cosmetic NFT to a server slot. Server owner only. */
export async function applyServerCosmetic(
	guildId: string,
	slot: ServerCosmeticSlot,
	mintAddress: string,
): Promise<Array<AppliedCosmeticEntry & {applied_by: string}>> {
	const response = await http.put<{ok: boolean; applied: Array<AppliedCosmeticEntry & {applied_by: string}>}>({
		url: Endpoints.GUILD_COSMETICS(guildId),
		body: {slot, mint_address: mintAddress},
	});
	return response.body.applied;
}

/** Clear a server cosmetic slot. Server owner only. */
export async function clearServerCosmetic(
	guildId: string,
	slot: ServerCosmeticSlot,
): Promise<Array<AppliedCosmeticEntry & {applied_by: string}>> {
	const response = await http.put<{ok: boolean; applied: Array<AppliedCosmeticEntry & {applied_by: string}>}>({
		url: Endpoints.GUILD_COSMETICS(guildId),
		body: {slot, mint_address: null},
	});
	return response.body.applied;
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

/** Response shape for `POST /cosmetics/store/:itemId/invoice`. */
export type CosmeticsInvoice = CosmeticsInvoiceResponse;

/** Request a payment invoice for a store item — creator/platform SOL split + a recent blockhash. */
export async function fetchCosmeticsInvoice(itemId: string): Promise<CosmeticsInvoice> {
	const response = await http.post<CosmeticsInvoice>({url: Endpoints.COSMETICS_STORE_INVOICE(itemId)});
	return response.body;
}

// ─── Creator program ──────────────────────────────────────────────────────────

/** Submit a creator application. No body — wallet is taken from the user's account. */
export async function applyAsCreator(): Promise<CreatorApplyResponse> {
	const response = await http.post<CreatorApplyResponse>({url: Endpoints.CREATOR_APPLY});
	return response.body;
}

/** Get the current user's creator status, application, and listings. */
export async function fetchCreatorStatus(): Promise<CreatorStatusResponse> {
	const response = await http.get<CreatorStatusResponse>({url: Endpoints.CREATOR_STATUS});
	return response.body;
}

/** Create a new draft listing. */
export async function createListing(data: CreateListingRequest): Promise<CreatorListingEntry> {
	const response = await http.post<{listing: CreatorListingEntry}>({
		url: Endpoints.CREATOR_LISTINGS,
		body: data,
	});
	return response.body.listing;
}

/** Update a draft listing. */
export async function updateListing(id: string, patch: UpdateListingRequest): Promise<CreatorListingEntry> {
	const response = await http.put<{listing: CreatorListingEntry}>({
		url: Endpoints.CREATOR_LISTING(id),
		body: patch,
	});
	return response.body.listing;
}

/** Submit a draft listing for admin review. */
export async function submitListing(id: string): Promise<CreatorListingEntry> {
	const response = await http.post<{listing: CreatorListingEntry}>({
		url: Endpoints.CREATOR_LISTING_SUBMIT(id),
	});
	return response.body.listing;
}

/** Delete a draft listing. */
export async function deleteListing(id: string): Promise<void> {
	await http.delete({url: Endpoints.CREATOR_LISTING(id)});
}

/** Upload a listing image; returns the CDN URL. */
export async function uploadListingImage(file: File): Promise<string> {
	const formData = new FormData();
	formData.append('image', file);
	const response = await http.post<{url: string}>({
		url: Endpoints.CREATOR_LISTING_UPLOAD_IMAGE,
		body: formData,
	});
	return response.body.url;
}

/**
 * Purchase a cosmetic NFT.
 * The caller must first send the SOL payment on-chain and then pass the
 * confirmed transaction signature here. Passing `purchaseId` (from the invoice
 * returned by `fetchCosmeticsInvoice`) lets the server resolve and complete the
 * exact pending row created at invoice time instead of creating a new one —
 * omitting it leaves that invoice-time row permanently stuck at 'pending'.
 * Returns an error until the Multiverse cosmetics collection launches.
 */
export async function purchaseCosmetic(
	itemId: string,
	txSignature: string,
	buyerAddress: string,
	purchaseId?: string,
): Promise<PurchaseCosmeticResponse> {
	const body: PurchaseCosmeticRequest = {
		item_id: itemId,
		tx_signature: txSignature,
		buyer_address: buyerAddress,
		...(purchaseId ? {purchase_id: purchaseId} : {}),
	};
	const response = await http.post<PurchaseCosmeticResponse>({
		url: Endpoints.COSMETICS_PURCHASE,
		body,
	});
	return response.body;
}
