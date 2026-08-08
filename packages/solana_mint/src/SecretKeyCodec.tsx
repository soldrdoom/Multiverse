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

import bs58 from 'bs58';

/**
 * Decodes `COSMETICS_MINT_AUTHORITY_SECRET_KEY` into raw secret key bytes.
 * Accepts a JSON byte array (`solana-keygen`'s on-disk keypair format) or a
 * base58-encoded string (what most wallet "export private key" UIs produce).
 * Never logs the input or the decoded bytes.
 */
export function decodeSecretKey(raw: string): Uint8Array {
	const trimmed = raw.trim();
	if (trimmed.startsWith('[')) {
		const parsed = JSON.parse(trimmed);
		if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== 'number')) {
			throw new Error('COSMETICS_MINT_AUTHORITY_SECRET_KEY JSON array must contain only numbers');
		}
		return Uint8Array.from(parsed);
	}
	return bs58.decode(trimmed);
}
