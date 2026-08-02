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
 * Single source of truth for the build identity that both the bundle and the
 * Sentry source map upload use.
 *
 * `rspack.config.mjs` feeds these values into `DefinePlugin` as
 * `import.meta.env.PUBLIC_BUILD_*`; `src/index.tsx` turns them into the Sentry
 * `release`/`dist` at runtime. `scripts/upload-sourcemaps.mjs` derives the same
 * strings for the upload. If those two ever disagree, Sentry accepts the
 * artifacts and then silently refuses to symbolicate, so the derivation lives
 * here once instead of being written twice.
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `fluxer_app/` -- this file lives at `fluxer_app/scripts/build/`. */
export const APP_ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Written by the rspack config at build time, read by the upload step.
 *
 * Deliberately outside `dist/`: `output.clean` wipes `dist/` at the start of
 * every build, and everything in `dist/` is copied into the server image and
 * served publicly (`fluxer_server/Dockerfile`: `COPY fluxer_app/dist
 * /usr/src/app/assets`).
 */
export const BUILD_METADATA_PATH = path.join(APP_ROOT_DIR, '.build-meta.json');

/**
 * Must stay identical to the release prefix in `src/index.tsx` (`releaseLabel`).
 * `BuildMetadata.test.mjs` asserts the two agree.
 */
export const SENTRY_RELEASE_PREFIX = 'fluxer-app';

function asString(value, fallback = undefined) {
	if (value === null || value === undefined) {
		return fallback;
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return fallback;
}

export function resolveReleaseChannel(env = process.env) {
	const raw = asString(env.RELEASE_CHANNEL, 'nightly').toLowerCase();
	if (raw === 'stable' || raw === 'canary') {
		return raw;
	}
	return 'nightly';
}

export function resolveBuildMetadata(env = process.env) {
	const envBuildSha = asString(env.BUILD_SHA);
	let buildSha = envBuildSha ?? undefined;
	if (!buildSha) {
		try {
			buildSha = execSync('git rev-parse --short HEAD', {cwd: APP_ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore']})
				.toString()
				.trim();
		} catch {
			buildSha = 'dev';
		}
	}
	const buildNumber = asString(env.BUILD_NUMBER, '0');
	const buildTimestamp = asString(env.BUILD_TIMESTAMP, String(Math.floor(Date.now() / 1000)));
	const releaseChannel = resolveReleaseChannel(env);
	return {
		buildSha,
		buildNumber,
		buildTimestamp,
		releaseChannel,
	};
}

/**
 * Mirrors `src/index.tsx`: `release` is only set when the sha is real, so a
 * `dev` build reports no release at all and must not have artifacts uploaded
 * under a made-up one.
 */
export function resolveSentryRelease(metadata) {
	const buildSha = asString(metadata?.buildSha);
	if (!buildSha || buildSha === 'dev') {
		return null;
	}
	return `${SENTRY_RELEASE_PREFIX}@${buildSha}`;
}

/**
 * Mirrors `src/index.tsx`: the runtime `dist` is
 * `String(Config.PUBLIC_BUILD_NUMBER)` and is omitted when the build number is
 * not greater than zero. `Config.PUBLIC_BUILD_NUMBER` is the *parsed number*
 * (`src/Config.tsx` transforms the string with `Number`), so `BUILD_NUMBER=007`
 * reports `dist=7`, not `007`.
 */
export function resolveSentryDist(metadata) {
	const parsed = Number(asString(metadata?.buildNumber, '0'));
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return String(parsed);
}

export function writeBuildMetadataFile(metadata, filePath = BUILD_METADATA_PATH) {
	const payload = {
		...metadata,
		sentryRelease: resolveSentryRelease(metadata),
		sentryDist: resolveSentryDist(metadata),
		writtenAt: new Date().toISOString(),
	};
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, '\t')}\n`, 'utf-8');
	return payload;
}

export function readBuildMetadataFile(filePath = BUILD_METADATA_PATH) {
	let content;
	try {
		content = fs.readFileSync(filePath, 'utf-8');
	} catch {
		return null;
	}
	try {
		const parsed = JSON.parse(content);
		return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
