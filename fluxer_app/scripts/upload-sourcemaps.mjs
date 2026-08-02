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
 * Uploads the production bundle's source maps to Sentry, then deletes them.
 *
 * Runs as the last step of `pnpm --filter fluxer_app build`. It is a **no-op
 * without a Sentry auth token**: no token means a skip message and exit 0, and
 * `dist/` is left exactly as the bundler produced it. A fresh clone, a CI
 * checkout and a token-less local build all keep working unchanged.
 *
 * Design notes, because several of these are load-bearing:
 *
 * - `rspack.config.mjs` builds production with `devtool: 'hidden-source-map'`,
 *   so the emitted `.js` files carry **no** `//# sourceMappingURL=` trailer
 *   (commit `acb964b6` closed a publicly-served-source-maps exposure). Nothing
 *   here adds one back: `sentry-cli sourcemaps inject` appends only
 *   `//# debugId=<uuid>` and pairs `foo.js` with `foo.js.map` by filename.
 * - Symbolication is anchored on **debug IDs**, not just the release name. The
 *   injector stamps the same UUID into the asset and its map and shifts the
 *   map's `mappings` to account for the injected lines. The release/dist are
 *   still sent (derived from `scripts/build/BuildMetadata.mjs`, the same values
 *   the bundle reports via `src/index.tsx`) so releases group correctly.
 * - The auth token is passed through the child process env, never on argv, so
 *   it does not show up in `ps`.
 *
 * Environment:
 *   SENTRY_AUTH_TOKEN            required; absent => skip (the only "normal" skip)
 *   SENTRY_ORG, SENTRY_PROJECT   required alongside the token
 *   SENTRY_URL                   optional, for a self-hosted Sentry
 *   SENTRY_ENV_FILE              optional path to a KEY=VALUE file holding the above;
 *                                defaults to ~/.config/fluxer/sentry.env when present
 *   SENTRY_CLI_EXECUTABLE        optional explicit sentry-cli path
 *   SENTRY_CLI_NO_NPX=1          do not fall back to `npx @sentry/cli`
 *   SENTRY_SOURCEMAPS_REQUIRED=1 make upload failures fail the build
 *   SENTRY_SKIP_DEBUG_ID_INJECTION=1  upload without injecting debug ids
 *   SENTRY_KEEP_SOURCEMAPS=1     keep dist/assets/*.map after a successful upload
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	APP_ROOT_DIR,
	BUILD_METADATA_PATH,
	readBuildMetadataFile,
	resolveBuildMetadata,
	resolveSentryDist,
	resolveSentryRelease,
} from './build/BuildMetadata.mjs';

/** Pinned so an `npx` fallback cannot drift under us mid-deploy. */
const SENTRY_CLI_VERSION = '3.6.2';

const DIST_DIR = path.join(APP_ROOT_DIR, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

/**
 * `output.publicPath` is `https://multiverse.forum/` and assets are emitted as
 * `assets/<contenthash>.js`, so the browser-visible path is `/assets/<name>`.
 * `~` is Sentry's host-agnostic prefix.
 */
const ASSET_URL_PREFIX = '~/assets';

const LOG_PREFIX = '[sentry-sourcemaps]';

function log(message) {
	console.log(`${LOG_PREFIX} ${message}`);
}

function warn(message) {
	console.warn(`${LOG_PREFIX} ${message}`);
}

function skip(reason) {
	log(`skipped: ${reason}`);
	log('this is not an error; the build output is unchanged.');
}

function parseEnvFile(content) {
	const values = {};
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) {
			continue;
		}
		const withoutExport = line.startsWith('export ') ? line.slice('export '.length) : line;
		const separatorIndex = withoutExport.indexOf('=');
		if (separatorIndex <= 0) {
			continue;
		}
		const key = withoutExport.slice(0, separatorIndex).trim();
		let value = withoutExport.slice(separatorIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
			(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
		) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

/**
 * Loads credentials from a file outside the repo so the token never has to sit
 * in the working tree or the Docker build context. Existing process env always
 * wins, and values are never logged.
 */
function loadCredentialFile(env) {
	const explicitPath = env.SENTRY_ENV_FILE;
	const defaultPath = path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'fluxer', 'sentry.env');
	const filePath = explicitPath || defaultPath;
	if (!fs.existsSync(filePath)) {
		if (explicitPath) {
			warn(`SENTRY_ENV_FILE points at a missing file: ${filePath}`);
		}
		return env;
	}
	let parsed;
	try {
		parsed = parseEnvFile(fs.readFileSync(filePath, 'utf-8'));
	} catch (error) {
		warn(`could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return env;
	}
	log(`loaded Sentry credentials from ${filePath}`);
	return {...parsed, ...env};
}

function listSourceMaps(directory) {
	let entries;
	try {
		entries = fs.readdirSync(directory, {withFileTypes: true});
	} catch {
		return [];
	}
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.map'))
		.map((entry) => path.join(directory, entry.name));
}

function resolveSentryCli(env) {
	if (env.SENTRY_CLI_EXECUTABLE) {
		return {command: env.SENTRY_CLI_EXECUTABLE, baseArgs: [], label: env.SENTRY_CLI_EXECUTABLE};
	}
	const localBinaries = [
		path.join(APP_ROOT_DIR, 'node_modules', '.bin', 'sentry-cli'),
		path.join(APP_ROOT_DIR, '..', 'node_modules', '.bin', 'sentry-cli'),
	];
	for (const candidate of localBinaries) {
		if (fs.existsSync(candidate)) {
			return {command: candidate, baseArgs: [], label: candidate};
		}
	}
	if (env.SENTRY_CLI_NO_NPX === '1') {
		return null;
	}
	return {
		command: 'npx',
		baseArgs: ['--yes', `@sentry/cli@${SENTRY_CLI_VERSION}`],
		label: `npx @sentry/cli@${SENTRY_CLI_VERSION}`,
	};
}

function runSentryCli(cli, args, childEnv) {
	log(`$ ${cli.label} ${args.join(' ')}`);
	const result = spawnSync(cli.command, [...cli.baseArgs, ...args], {
		cwd: APP_ROOT_DIR,
		stdio: 'inherit',
		env: childEnv,
	});
	if (result.error) {
		return {ok: false, reason: result.error.message};
	}
	if (result.status !== 0) {
		return {ok: false, reason: `sentry-cli exited with code ${result.status}`};
	}
	return {ok: true};
}

function deleteSourceMaps(files) {
	let deleted = 0;
	let bytes = 0;
	for (const file of files) {
		try {
			bytes += fs.statSync(file).size;
			fs.unlinkSync(file);
			deleted += 1;
		} catch (error) {
			warn(`could not delete ${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	log(`deleted ${deleted} local source map(s) (${Math.round(bytes / 1024 / 1024)} MB) from dist/assets`);
}

function fail(message, required) {
	warn('='.repeat(72));
	warn(`SOURCE MAPS WERE NOT UPLOADED: ${message}`);
	warn('Sentry stack traces for this build will point into the minified bundle.');
	warn('Local .map files were kept so the upload can be retried without a rebuild:');
	warn('  cd fluxer_app && node scripts/upload-sourcemaps.mjs');
	warn('='.repeat(72));
	return required ? 1 : 0;
}

function main() {
	const env = loadCredentialFile(process.env);
	const required = env.SENTRY_SOURCEMAPS_REQUIRED === '1';

	if (!env.SENTRY_AUTH_TOKEN) {
		skip('SENTRY_AUTH_TOKEN is not set, so there is nothing to upload to');
		return 0;
	}
	if (!env.SENTRY_ORG || !env.SENTRY_PROJECT) {
		return fail('SENTRY_AUTH_TOKEN is set but SENTRY_ORG and/or SENTRY_PROJECT are missing', required);
	}

	let metadata = readBuildMetadataFile();
	if (metadata) {
		log(`build metadata from ${path.relative(APP_ROOT_DIR, BUILD_METADATA_PATH)}`);
	} else {
		warn(`no build metadata at ${BUILD_METADATA_PATH}; falling back to the environment and git HEAD.`);
		warn('this can disagree with the bundle if HEAD moved since the build. Run the bundler first.');
		metadata = resolveBuildMetadata(env);
	}

	const release = resolveSentryRelease(metadata);
	const dist = resolveSentryDist(metadata);
	if (!release) {
		skip(`build sha is "${metadata.buildSha}", so the app reports no release and there is nothing to attach to`);
		return 0;
	}

	const sourceMaps = listSourceMaps(ASSETS_DIR);
	if (sourceMaps.length === 0) {
		return fail(`no .map files found in ${ASSETS_DIR}`, required);
	}

	const cli = resolveSentryCli(env);
	if (!cli) {
		return fail('no sentry-cli available (SENTRY_CLI_NO_NPX=1 and no local binary)', required);
	}

	log(`release=${release}${dist ? ` dist=${dist}` : ' dist=<none>'} channel=${metadata.releaseChannel}`);
	log(`${sourceMaps.length} source map(s) in dist/assets, uploading with ${cli.label}`);

	const childEnv = {
		...env,
		SENTRY_ORG: env.SENTRY_ORG,
		SENTRY_PROJECT: env.SENTRY_PROJECT,
		SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN,
	};

	if (env.SENTRY_SKIP_DEBUG_ID_INJECTION !== '1') {
		const injectResult = runSentryCli(cli, ['sourcemaps', 'inject', ASSETS_DIR], childEnv);
		if (!injectResult.ok) {
			return fail(`debug id injection failed (${injectResult.reason})`, required);
		}
	} else {
		warn('debug id injection disabled; symbolication will depend on the release/dist matching exactly');
	}

	const uploadArgs = ['sourcemaps', 'upload', '--release', release, '--url-prefix', ASSET_URL_PREFIX];
	if (dist) {
		uploadArgs.push('--dist', dist);
	}
	uploadArgs.push(ASSETS_DIR);

	const uploadResult = runSentryCli(cli, uploadArgs, childEnv);
	if (!uploadResult.ok) {
		return fail(`upload failed (${uploadResult.reason})`, required);
	}

	if (env.SENTRY_KEEP_SOURCEMAPS === '1') {
		warn('SENTRY_KEEP_SOURCEMAPS=1: keeping local .map files.');
		warn('they are excluded from the image by .dockerignore and blocked by app_proxy SourceMapGuard,');
		warn('but they should not be copied anywhere public by hand.');
	} else {
		deleteSourceMaps(listSourceMaps(ASSETS_DIR));
	}

	log(`done: ${release}${dist ? ` (dist ${dist})` : ''} uploaded`);
	return 0;
}

process.exit(main());
