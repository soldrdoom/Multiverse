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

import {type GatingAsset, matchesTokenGate} from '@fluxer/solana_das/src/NftFetcher';
import {describe, expect, it} from 'vitest';

// Mirrors TokenGateMatchMode in @fluxer/constants/src/GuildConstants (this
// package has no dependency on that package for one enum -- see the comment
// on matchesTokenGate itself).
const EXACT_ASSET = 0;
const COLLECTION = 1;

describe('matchesTokenGate', () => {
	const exactMintOnly: GatingAsset = {mint: 'TargetMint', collectionMint: null, compressed: false};
	const collectionMemberOnly: GatingAsset = {mint: 'OtherMint', collectionMint: 'TargetMint', compressed: true};
	const unrelated: GatingAsset = {mint: 'Unrelated', collectionMint: 'AlsoUnrelated', compressed: false};

	it('EXACT_ASSET mode: matches a wallet holding the exact mint', () => {
		expect(matchesTokenGate([exactMintOnly], 'TargetMint', EXACT_ASSET)).toBe(true);
	});

	it("EXACT_ASSET mode: does NOT match a wallet that only holds a different asset from the gate's collection", () => {
		// This is the bug this test guards against: an admin gating on one
		// specific NFT should not be satisfied by someone who merely owns a
		// different item from the same collection.
		expect(matchesTokenGate([collectionMemberOnly], 'TargetMint', EXACT_ASSET)).toBe(false);
	});

	it('COLLECTION mode: matches a wallet holding any asset from the collection', () => {
		expect(matchesTokenGate([collectionMemberOnly], 'TargetMint', COLLECTION)).toBe(true);
	});

	it("COLLECTION mode: does NOT match a wallet holding only the collection's own address as a bare mint", () => {
		// Owning the master/collection NFT itself is not the same as owning a
		// member of it -- COLLECTION mode only checks collectionMint, by design.
		expect(matchesTokenGate([exactMintOnly], 'TargetMint', COLLECTION)).toBe(false);
	});

	it('neither mode matches an unrelated asset', () => {
		expect(matchesTokenGate([unrelated], 'TargetMint', EXACT_ASSET)).toBe(false);
		expect(matchesTokenGate([unrelated], 'TargetMint', COLLECTION)).toBe(false);
	});

	it('an empty wallet never satisfies either mode', () => {
		expect(matchesTokenGate([], 'TargetMint', EXACT_ASSET)).toBe(false);
		expect(matchesTokenGate([], 'TargetMint', COLLECTION)).toBe(false);
	});

	it('checks every asset in the wallet, not just the first', () => {
		expect(matchesTokenGate([unrelated, exactMintOnly], 'TargetMint', EXACT_ASSET)).toBe(true);
		expect(matchesTokenGate([unrelated, collectionMemberOnly], 'TargetMint', COLLECTION)).toBe(true);
	});
});
