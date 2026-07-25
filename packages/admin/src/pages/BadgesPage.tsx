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
import {BADGES} from '@fluxer/admin/src/AdminPackageConstants';
import {Layout} from '@fluxer/admin/src/components/Layout';
import {PageLayout} from '@fluxer/admin/src/components/ui/Layout/PageLayout';
import {VStack} from '@fluxer/admin/src/components/ui/Layout/VStack';
import {Stack} from '@fluxer/admin/src/components/ui/Stack';
import {Heading, Text} from '@fluxer/admin/src/components/ui/Typography';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {hasBigIntFlag, tryParseBigInt} from '@fluxer/admin/src/utils/Bigint';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {UserPremiumTypes} from '@fluxer/constants/src/UserConstants';
import type {Flash} from '@fluxer/hono/src/Flash';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import {Card} from '@fluxer/ui/src/components/Card';
import {CheckboxForm, CheckboxItem} from '@fluxer/ui/src/components/CheckboxForm';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import {SearchForm} from '@fluxer/ui/src/components/SearchForm';
import {formatUserTag} from '@fluxer/ui/src/utils/FormatUser';
import type {FC} from 'hono/jsx';

export interface BadgesPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	adminAcls: Array<string>;
	assetVersion: string;
	csrfToken: string;
	userId: string;
	user: UserAdminResponse | null;
	lookupError: string | null;
}

export const BadgesPage: FC<BadgesPageProps> = ({
	config,
	session,
	currentAdmin,
	flash,
	adminAcls,
	assetVersion,
	csrfToken,
	userId,
	user,
	lookupError,
}) => {
	const canEditFlagBadges = hasPermission(adminAcls, AdminACLs.USER_UPDATE_FLAGS);
	const canEditVisionary = hasPermission(adminAcls, AdminACLs.USER_UPDATE_PREMIUM);
	const currentFlags = user ? (tryParseBigInt(user.flags) ?? 0n) : 0n;
	const hasVisionary = user?.premium_type === UserPremiumTypes.LIFETIME;

	return (
		<Layout
			csrfToken={csrfToken}
			title="Badges"
			activePage="badges"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			<PageLayout maxWidth="3xl">
				<VStack gap={6}>
					<Card padding="md">
						<VStack gap={4}>
							<Heading level={1} size="2xl">
								Badges
							</Heading>
							<Text size="sm" color="muted">
								Look up a user by ID to grant or revoke their profile badges.
							</Text>
							<SearchForm
								action="/badges"
								method="get"
								basePath={config.basePath}
								fields={[
									{
										name: 'user_id',
										type: 'text',
										label: 'User ID',
										placeholder: 'e.g. 123456789012345678',
										value: userId,
									},
								]}
								submitLabel="Look Up"
								showClear={false}
							/>
						</VStack>
					</Card>

					{lookupError && (
						<Card padding="md">
							<Text color="danger" size="sm">
								{lookupError}
							</Text>
						</Card>
					)}

					{user && (
						<Card padding="md">
							<VStack gap={4}>
								<VStack gap={1}>
									<Heading level={2} size="xl">
										{formatUserTag(user.username, user.discriminator)}
									</Heading>
									<Text size="sm" color="muted" class="font-mono">
										{user.id}
									</Text>
								</VStack>

								<Text size="xs" color="muted">
									Most badges are cosmetic flags. Visionary is the exception — it grants lifetime premium status, not
									just a badge, and toggling it changes the user's premium tier.
								</Text>

								<CheckboxForm
									id="badges-form"
									action={`${config.basePath}/badges/update`}
									autoReveal
									saveButtonLabel="Save Badges"
								>
									<CsrfInput token={csrfToken} />
									<input type="hidden" name="user_id" value={user.id} />
									<Stack gap="sm">
										{BADGES.map((badge) => {
											const editable = badge.flag ? canEditFlagBadges : canEditVisionary;
											const checked = badge.flag ? hasBigIntFlag(currentFlags, badge.flag.value) : hasVisionary;
											return editable ? (
												<CheckboxItem
													key={badge.name}
													name="badges[]"
													value={badge.name}
													label={badge.label}
													checked={checked}
												/>
											) : (
												<Text key={badge.name} size="sm" color="muted">
													{badge.label} — {checked ? 'granted' : 'not granted'} (no permission to edit)
												</Text>
											);
										})}
									</Stack>
								</CheckboxForm>
							</VStack>
						</Card>
					)}
				</VStack>
			</PageLayout>
		</Layout>
	);
};
