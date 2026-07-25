/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFrontmatter, escapeTableText, writeFile} from './shared.mjs';

/**
 * Human-readable descriptions for each OAuth2 scope.
 *
 * The scope LIST itself is not declared here — it is read from
 * packages/constants/src/OAuth2Constants.tsx, which is the single source of
 * truth enforced at runtime by OAuth2Service.ALLOWED_SCOPES. This map only
 * supplies prose. If a scope is added to the constant without a description
 * here, generation fails loudly rather than silently publishing a short list.
 */
const OAuth2ScopeDescriptions = {
	identify: 'Allows access to basic user information including username, discriminator, avatar, and flags.',
	email: "Allows access to the user's email address. Requires the identify scope.",
	guilds: 'Allows access to the list of guilds the user is a member of.',
	connections: "Allows access to the list of the user's external service connections, via GET /users/@me/connections.",
	bot: 'Used for bot authorization. Adds a bot to a guild on behalf of the authorizing user.',
	admin: 'Reserved for the built-in first-party admin application. Requests from any other client are rejected.',
};

/**
 * Read the canonical scope list out of packages/constants/src/OAuth2Constants.tsx.
 *
 * This is a source-text extraction rather than an import because the constant
 * lives in a .tsx file this plain-node script cannot load. It is deliberately
 * strict: an unreadable or unparseable constant is an error, not a fallback to
 * a stale hardcoded list.
 */
async function readCanonicalScopes(repoRoot) {
	const constantsPath = path.join(repoRoot, 'packages/constants/src/OAuth2Constants.tsx');
	const source = await fs.readFile(constantsPath, 'utf8');

	const match = source.match(/export const OAuth2Scopes\s*:[^=]*=\s*\[([\s\S]*?)\]/);
	if (!match) {
		throw new Error(`Could not locate the OAuth2Scopes array in ${constantsPath}`);
	}

	const scopes = Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]);
	if (scopes.length === 0) {
		throw new Error(`Parsed an empty OAuth2Scopes array from ${constantsPath}`);
	}

	const undocumented = scopes.filter((scope) => !(scope in OAuth2ScopeDescriptions));
	if (undocumented.length > 0) {
		throw new Error(
			`OAuth2 scope(s) ${undocumented.map((s) => `'${s}'`).join(', ')} exist in OAuth2Constants.tsx but have ` +
				'no description in generate_scopes.mjs. Add one so the docs do not silently omit the scope.',
		);
	}

	const stale = Object.keys(OAuth2ScopeDescriptions).filter((scope) => !scopes.includes(scope));
	if (stale.length > 0) {
		throw new Error(
			`generate_scopes.mjs describes scope(s) ${stale.map((s) => `'${s}'`).join(', ')} that no longer exist ` +
				'in OAuth2Constants.tsx. Remove them.',
		);
	}

	return scopes;
}

/**
 * Render the OAuth2 scopes table.
 */
function renderScopesTable(scopes) {
	let out = '';
	out += '| Scope | Description |\n';
	out += '|-------|-------------|\n';

	for (const scope of scopes) {
		out += `| \`${escapeTableText(scope)}\` | ${escapeTableText(OAuth2ScopeDescriptions[scope])} |\n`;
	}

	return out;
}

async function main() {
	const dirname = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(dirname, '../..');
	const outPath = path.join(repoRoot, 'fluxer_docs/topics/oauth2.mdx');
	const scopes = await readCanonicalScopes(repoRoot);

	let out = '';
	out += createFrontmatter({
		title: 'OAuth2',
		description: 'OAuth2 scopes in Fluxer and what each scope enables.',
	});
	out += '\n\n';

	out +=
		'OAuth2 scopes define the level of access that an application can request from a user. When a user authorizes an application, they grant permission for the application to access specific resources on their behalf.\n\n';

	out += '## Available scopes\n\n';
	out += renderScopesTable(scopes);

	await writeFile(outPath, out);

	console.log('Generated OAuth2 documentation:');
	console.log(`  - ${outPath}`);
	console.log(`  - ${scopes.length} scopes`);
}

await main();
