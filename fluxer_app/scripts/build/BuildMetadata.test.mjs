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
 * These tests exist for exactly one failure mode: the Sentry source map upload
 * naming its artifacts differently from what the running bundle reports. When
 * that happens Sentry accepts the upload and then silently declines to
 * symbolicate, which is indistinguishable from never having uploaded at all.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
	APP_ROOT_DIR,
	readBuildMetadataFile,
	resolveBuildMetadata,
	resolveReleaseChannel,
	resolveSentryDist,
	resolveSentryRelease,
	SENTRY_RELEASE_PREFIX,
	writeBuildMetadataFile,
} from './BuildMetadata.mjs';

describe('resolveSentryRelease', () => {
	it('matches the release the app reports at runtime', () => {
		expect(resolveSentryRelease({buildSha: 'abc1234'})).toBe('fluxer-app@abc1234');
	});

	it('returns null for a dev sha because the app then reports no release', () => {
		expect(resolveSentryRelease({buildSha: 'dev'})).toBeNull();
	});

	it('returns null when the sha is missing', () => {
		expect(resolveSentryRelease({})).toBeNull();
		expect(resolveSentryRelease(null)).toBeNull();
	});
});

describe('resolveSentryDist', () => {
	it('omits dist when the build number is zero, matching the runtime guard', () => {
		expect(resolveSentryDist({buildNumber: '0'})).toBeNull();
		expect(resolveSentryDist({})).toBeNull();
	});

	it('returns the decimal build number', () => {
		expect(resolveSentryDist({buildNumber: '42'})).toBe('42');
	});

	it('normalizes like the runtime does (Config parses the define with Number)', () => {
		// src/Config.tsx transforms PUBLIC_BUILD_NUMBER with Number(), and
		// src/index.tsx then does String(...), so '007' is reported as '7'.
		expect(resolveSentryDist({buildNumber: '007'})).toBe('7');
	});

	it('returns null for values that are not positive numbers', () => {
		expect(resolveSentryDist({buildNumber: 'nightly'})).toBeNull();
		expect(resolveSentryDist({buildNumber: '-3'})).toBeNull();
	});
});

describe('resolveBuildMetadata', () => {
	it('prefers BUILD_SHA over git', () => {
		const metadata = resolveBuildMetadata({BUILD_SHA: 'deadbee', BUILD_NUMBER: '9', RELEASE_CHANNEL: 'stable'});
		expect(metadata.buildSha).toBe('deadbee');
		expect(metadata.buildNumber).toBe('9');
		expect(metadata.releaseChannel).toBe('stable');
	});

	it('defaults the build number to 0 so dist is omitted', () => {
		const metadata = resolveBuildMetadata({BUILD_SHA: 'deadbee'});
		expect(resolveSentryDist(metadata)).toBeNull();
	});
});

describe('resolveReleaseChannel', () => {
	it('falls back to nightly for unknown channels', () => {
		expect(resolveReleaseChannel({})).toBe('nightly');
		expect(resolveReleaseChannel({RELEASE_CHANNEL: 'weird'})).toBe('nightly');
		expect(resolveReleaseChannel({RELEASE_CHANNEL: 'CANARY'})).toBe('canary');
	});
});

describe('build metadata file', () => {
	it('round-trips through disk with the derived sentry fields', () => {
		const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'build-meta-')), '.build-meta.json');
		const written = writeBuildMetadataFile(
			{buildSha: 'abc1234', buildNumber: '5', buildTimestamp: '1', releaseChannel: 'stable'},
			filePath,
		);
		expect(written.sentryRelease).toBe('fluxer-app@abc1234');
		expect(written.sentryDist).toBe('5');

		const read = readBuildMetadataFile(filePath);
		expect(resolveSentryRelease(read)).toBe('fluxer-app@abc1234');
		expect(resolveSentryDist(read)).toBe('5');
	});

	it('returns null instead of throwing when the file is missing or corrupt', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'build-meta-'));
		expect(readBuildMetadataFile(path.join(directory, 'nope.json'))).toBeNull();
		const corruptPath = path.join(directory, 'corrupt.json');
		fs.writeFileSync(corruptPath, '{not json');
		expect(readBuildMetadataFile(corruptPath)).toBeNull();
	});
});

describe('agreement with the runtime Sentry init', () => {
	it('uses the same release prefix as src/index.tsx', () => {
		const source = fs.readFileSync(path.join(APP_ROOT_DIR, 'src', 'index.tsx'), 'utf-8');
		expect(source).toContain(`\`${SENTRY_RELEASE_PREFIX}@\${normalizedBuildSha}\``);
	});

	it('agrees with src/index.tsx that a "dev" sha means no release', () => {
		const source = fs.readFileSync(path.join(APP_ROOT_DIR, 'src', 'index.tsx'), 'utf-8');
		expect(source).toContain("Config.PUBLIC_BUILD_SHA !== 'dev'");
		expect(resolveSentryRelease({buildSha: 'dev'})).toBeNull();
	});

	it('agrees with src/index.tsx that dist is only sent for a positive build number', () => {
		const source = fs.readFileSync(path.join(APP_ROOT_DIR, 'src', 'index.tsx'), 'utf-8');
		expect(source).toContain('Config.PUBLIC_BUILD_NUMBER > 0');
		expect(resolveSentryDist({buildNumber: '0'})).toBeNull();
	});
});
