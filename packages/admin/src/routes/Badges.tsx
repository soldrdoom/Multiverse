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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {hasPermission} from '@fluxer/admin/src/AccessControlList';
import {BADGES, type PatchableBadge, type PatchableUserFlag} from '@fluxer/admin/src/AdminPackageConstants';
import {getErrorMessage} from '@fluxer/admin/src/api/Errors';
import * as usersApi from '@fluxer/admin/src/api/Users';
import {redirectWithFlash} from '@fluxer/admin/src/middleware/Auth';
import {BadgesPage} from '@fluxer/admin/src/pages/BadgesPage';
import {getRouteContext} from '@fluxer/admin/src/routes/RouteContext';
import type {RouteFactoryDeps} from '@fluxer/admin/src/routes/RouteTypes';
import type {AppVariables} from '@fluxer/admin/src/types/App';
import {hasBigIntFlag, tryParseBigInt} from '@fluxer/admin/src/utils/Bigint';
import {getRequiredString, getStringArray, type ParsedBody} from '@fluxer/admin/src/utils/Forms';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {UserPremiumTypes} from '@fluxer/constants/src/UserConstants';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import {Hono} from 'hono';

function isFlagBadge(badge: PatchableBadge): badge is PatchableBadge & {flag: PatchableUserFlag} {
	return badge.flag !== null;
}

export function createBadgesRoutes({config, assetVersion, requireAuth}: RouteFactoryDeps) {
	const router = new Hono<{Variables: AppVariables}>();

	router.get('/badges', requireAuth, async (c) => {
		const {session, currentAdmin, flash, adminAcls, csrfToken} = getRouteContext(c);
		const userId = c.req.query('user_id')?.trim() ?? '';

		let lookedUpUser: UserAdminResponse | null = null;
		let lookupError: string | null = null;

		if (userId) {
			const result = await usersApi.lookupUsersByIds(config, session, [userId]);
			if (result.ok) {
				lookedUpUser = result.data[0] ?? null;
				if (!lookedUpUser) {
					lookupError = `No user found with ID ${userId}`;
				}
			} else {
				lookupError = getErrorMessage(result.error);
			}
		}

		return c.html(
			<BadgesPage
				config={config}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				adminAcls={adminAcls}
				assetVersion={assetVersion}
				csrfToken={csrfToken}
				userId={userId}
				user={lookedUpUser}
				lookupError={lookupError}
			/>,
		);
	});

	router.post('/badges/update', requireAuth, async (c) => {
		const {session, adminAcls} = getRouteContext(c);

		try {
			const formData = (await c.req.parseBody()) as ParsedBody;
			const userId = getRequiredString(formData, 'user_id');
			if (!userId) {
				return redirectWithFlash(c, `${config.basePath}/badges`, {message: 'User ID is required', type: 'error'});
			}

			const redirectUrl = `${config.basePath}/badges?user_id=${encodeURIComponent(userId)}`;

			const userResult = await usersApi.lookupUsersByIds(config, session, [userId]);
			const user = userResult.ok ? userResult.data[0] : undefined;
			if (!userResult.ok || !user) {
				return redirectWithFlash(c, redirectUrl, {message: 'User not found', type: 'error'});
			}

			const selectedBadges = new Set(getStringArray(formData, 'badges[]'));
			const canEditFlagBadges = hasPermission(adminAcls, AdminACLs.USER_UPDATE_FLAGS);
			const canEditVisionary = hasPermission(adminAcls, AdminACLs.USER_UPDATE_PREMIUM);

			let flagsOk = true;
			if (canEditFlagBadges) {
				const currentFlags = tryParseBigInt(user.flags) ?? 0n;
				const flagBadges = BADGES.filter(isFlagBadge);
				const addFlags = flagBadges
					.filter((badge) => selectedBadges.has(badge.name) && !hasBigIntFlag(currentFlags, badge.flag.value))
					.map((badge) => badge.flag.value.toString());
				const removeFlags = flagBadges
					.filter((badge) => !selectedBadges.has(badge.name) && hasBigIntFlag(currentFlags, badge.flag.value))
					.map((badge) => badge.flag.value.toString());

				if (addFlags.length > 0 || removeFlags.length > 0) {
					const flagsResult = await usersApi.updateUserFlags(config, session, userId, addFlags, removeFlags);
					flagsOk = flagsResult.ok;
				}
			}

			let visionaryOk = true;
			if (canEditVisionary) {
				const visionaryGranted = selectedBadges.has('VISIONARY');
				const visionaryCurrentlyGranted = user.premium_type === UserPremiumTypes.LIFETIME;
				if (visionaryGranted !== visionaryCurrentlyGranted) {
					const visionaryResult = await usersApi.updateUserVisionary(config, session, userId, visionaryGranted);
					visionaryOk = visionaryResult.ok;
				}
			}

			return redirectWithFlash(c, redirectUrl, {
				message: flagsOk && visionaryOk ? 'Badges updated successfully' : 'Failed to update one or more badges',
				type: flagsOk && visionaryOk ? 'success' : 'error',
			});
		} catch {
			return redirectWithFlash(c, `${config.basePath}/badges`, {message: 'Invalid form data', type: 'error'});
		}
	});

	return router;
}
