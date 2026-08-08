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
 * Single source of truth for cosmetic rarity metadata — order, display
 * labels, and the CSS-module class KEY (not the class itself, since CSS
 * Modules scope class names per file) each rarity maps to.
 *
 * Every consumer defines its own `.rarity_legendary` / `.rarity_epic` /
 * `.rarity_rare` / `.rarity_uncommon` / `.rarity_common` classes (colours
 * per the "neon terminal" design tokens — legendary = brand gradient pill,
 * epic #b57bff, rare #5fd4ff, uncommon #14f195, common #8b93a7) and looks
 * the key up here via {@link rarityStyle} instead of hand-rolling its own
 * order/label/key maps. Replaces three previously-duplicated copies:
 * CosmeticsShopModal's var-driven version and two hardcoded-hex versions in
 * the Settings tabs (CosmeticsTab / GuildCosmeticsTab).
 */

export const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
	legendary: 'Legendary',
	epic: 'Epic',
	rare: 'Rare',
	uncommon: 'Uncommon',
	common: 'Common',
};

/** CSS-module class KEY per rarity — look up on the consumer's own `styles` object. */
export const RARITY_STYLE_KEYS: Record<Rarity, string> = {
	legendary: 'rarity_legendary',
	epic: 'rarity_epic',
	rare: 'rarity_rare',
	uncommon: 'rarity_uncommon',
	common: 'rarity_common',
};

function isRarity(value: string): value is Rarity {
	return (RARITY_ORDER as ReadonlyArray<string>).includes(value);
}

/** Resolve the rarity CSS-module class for `rarity` against a consumer's own `styles` object. Falls back to "common". */
export function rarityStyle(styles: Record<string, string | undefined>, rarity: string): string {
	const key = isRarity(rarity) ? rarity : 'common';
	return styles[RARITY_STYLE_KEYS[key]] ?? '';
}

/** Rarity label with a safe fallback for unrecognized values. */
export function rarityLabel(rarity: string): string {
	return isRarity(rarity) ? RARITY_LABELS[rarity] : rarity;
}

/** Sort comparator: legendary → common. Unrecognized rarities sort last. */
export function compareRarity(a: string, b: string): number {
	const aIdx = RARITY_ORDER.indexOf(a as Rarity);
	const bIdx = RARITY_ORDER.indexOf(b as Rarity);
	return (aIdx === -1 ? RARITY_ORDER.length : aIdx) - (bIdx === -1 ? RARITY_ORDER.length : bIdx);
}

// ─── Slots ──────────────────────────────────────────────────────────────────

export const PROFILE_SLOT_TYPES = new Set(['avatar_frame', 'profile_banner', 'profile_effect', 'badge', 'name_effect']);

export const SERVER_SLOT_TYPES = new Set(['chat_background', 'channel_list_background']);

export const SLOT_LABELS: Record<string, string> = {
	avatar_frame: 'Avatar Frame',
	profile_banner: 'Profile Banner',
	profile_effect: 'Profile Effect',
	badge: 'Badge',
	name_effect: 'Name Effect',
	chat_background: 'Chat Background',
	channel_list_background: 'Channel List BG',
};
