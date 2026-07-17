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
	type EmojiProvider,
	setEmojiParserConfig,
	type UnicodeEmoji,
} from '@fluxer/markdown_parser/src/parsers/EmojiParsers';
import emojiRegex from 'emoji-regex';

interface EmojiData {
	surrogate: string;
	names: Array<string>;
	hasDiversity?: boolean;
	skins?: Array<{surrogate: string}>;
}

const EMOJI_DATA: Map<string, EmojiData> = new Map([
	['smile', {surrogate: '😄', names: ['smile', 'grinning_face_with_smiling_eyes']}],
	[
		'wave',
		{
			surrogate: '👋',
			names: ['wave', 'waving_hand'],
			hasDiversity: true,
			skins: [{surrogate: '👋🏻'}, {surrogate: '👋🏼'}, {surrogate: '👋🏽'}, {surrogate: '👋🏾'}, {surrogate: '👋🏿'}],
		},
	],
	['heart', {surrogate: '❤️', names: ['heart', 'red_heart']}],
	[
		'thumbsup',
		{
			surrogate: '👍',
			names: ['thumbsup', 'thumbs_up', '+1'],
			hasDiversity: true,
			skins: [{surrogate: '👍🏻'}, {surrogate: '👍🏼'}, {surrogate: '👍🏽'}, {surrogate: '👍🏾'}, {surrogate: '👍🏿'}],
		},
	],
	['blush', {surrogate: '😊', names: ['blush', 'smiling_face_with_smiling_eyes']}],
	['grinning', {surrogate: '😀', names: ['grinning', 'grinning_face']}],
	['smiley', {surrogate: '😃', names: ['smiley', 'smiling_face_with_open_mouth']}],
	['grin', {surrogate: '😁', names: ['grin', 'beaming_face_with_smiling_eyes']}],
	[
		'foot',
		{
			surrogate: '🦶',
			names: ['foot', 'leg'],
			hasDiversity: true,
			skins: [{surrogate: '🦶🏻'}, {surrogate: '🦶🏼'}, {surrogate: '🦶🏽'}, {surrogate: '🦶🏾'}, {surrogate: '🦶🏿'}],
		},
	],
	['face_holding_back_tears', {surrogate: '🥹', names: ['face_holding_back_tears']}],
	['white_check_mark', {surrogate: '✅', names: ['white_check_mark', 'check_mark_button']}],
	['x', {surrogate: '❌', names: ['x', 'cross_mark']}],
	['leftwards_arrow_with_hook', {surrogate: '↩️', names: ['leftwards_arrow_with_hook']}],
	['rightwards_arrow_with_hook', {surrogate: '↪️', names: ['rightwards_arrow_with_hook']}],
	['arrow_heading_up', {surrogate: '⤴️', names: ['arrow_heading_up']}],
	['family_mwgb', {surrogate: '👨‍👩‍👧‍👦', names: ['family_mwgb', 'family_man_woman_girl_boy']}],
	[
		'mx_claus',
		{
			surrogate: '🧑‍🎄',
			names: ['mx_claus'],
			hasDiversity: true,
			skins: [
				{surrogate: '🧑🏻‍🎄'},
				{surrogate: '🧑🏼‍🎄'},
				{surrogate: '🧑🏽‍🎄'},
				{surrogate: '🧑🏾‍🎄'},
				{surrogate: '🧑🏿‍🎄'},
			],
		},
	],
]);

const SKIN_TONE_SURROGATES: ReadonlyArray<string> = ['🏻', '🏼', '🏽', '🏾', '🏿'];

const SURROGATE_TO_NAME: Map<string, string> = new Map();
const NAME_TO_EMOJI: Map<string, UnicodeEmoji> = new Map();
const SKIN_TONE_EMOJI: Map<string, UnicodeEmoji> = new Map();

for (const [mainName, data] of EMOJI_DATA) {
	SURROGATE_TO_NAME.set(data.surrogate, mainName);
	for (const name of data.names) {
		NAME_TO_EMOJI.set(name, {surrogates: data.surrogate});
	}

	if (data.hasDiversity && data.skins) {
		data.skins.forEach((skin, index) => {
			const skinToneSurrogate = SKIN_TONE_SURROGATES[index];
			for (const name of data.names) {
				const skinKey = `${name}:${skinToneSurrogate}`;
				SKIN_TONE_EMOJI.set(skinKey, {surrogates: skin.surrogate});
				SURROGATE_TO_NAME.set(skin.surrogate, `${name}::skin-tone-${index + 1}`);
			}
		});
	}
}

const testEmojiProvider: EmojiProvider = {
	getSurrogateName(surrogate: string): string | null {
		return SURROGATE_TO_NAME.get(surrogate) || null;
	},
	findEmojiByName(name: string): UnicodeEmoji | null {
		return NAME_TO_EMOJI.get(name) || null;
	},
	findEmojiWithSkinTone(baseName: string, skinToneSurrogate: string): UnicodeEmoji | null {
		const skinKey = `${baseName}:${skinToneSurrogate}`;
		return SKIN_TONE_EMOJI.get(skinKey) || null;
	},
};

export function setupTestEmojiProvider(): void {
	setEmojiParserConfig({
		emojiProvider: testEmojiProvider,
		emojiRegex: emojiRegex(),
		skinToneSurrogates: SKIN_TONE_SURROGATES,
	});
}

export function clearTestEmojiProvider(): void {
	setEmojiParserConfig({
		emojiProvider: undefined,
		emojiRegex: undefined,
		skinToneSurrogates: undefined,
	});
}
