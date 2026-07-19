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

import {readFileSync} from 'node:fs';
import {parse} from 'yaml';

// Read directly from the marketing package's own source files (single source of truth,
// not a duplicated copy) — the Dockerfile preserves this same relative path when building.
const WHITEPAPER_PATH = new URL('../../marketing/src/content/whitepaper.md', import.meta.url);
const MARKETING_MESSAGES_PATH = new URL('../../marketing/src/marketing_i18n/locales/messages.yaml', import.meta.url);

function loadRoadmapText(): string {
	const raw = readFileSync(MARKETING_MESSAGES_PATH, 'utf-8');
	const messages = parse(raw) as Record<string, string>;

	const lines: Array<string> = ['## Roadmap'];
	for (const [key, value] of Object.entries(messages)) {
		if (!key.startsWith('roadmap_page.') || key.endsWith('.read_the_whitepaper')) continue;
		lines.push(`- ${key}: ${value}`);
	}
	return lines.join('\n');
}

export function loadKnowledgeBase(): string {
	const whitepaper = readFileSync(WHITEPAPER_PATH, 'utf-8');
	const roadmap = loadRoadmapText();
	return `${whitepaper}\n\n${roadmap}`;
}
