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

import {hasAnyPermission} from '@fluxer/admin/src/AccessControlList';
import type {NavigationContext, NavSection} from '@fluxer/admin/src/navigation/NavigationTypes';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';

export function getSections(): Array<NavSection> {
	return [
		{
			title: 'Lookup',
			items: [
				{
					title: 'Users',
					path: '/users',
					activeKey: 'users',
					requiredAcls: [AdminACLs.USER_LOOKUP],
					description:
						'Look up a user by ID, username, or email — view their account, sessions, moderation history, and flags.',
				},
				{
					title: 'Guilds',
					path: '/guilds',
					activeKey: 'guilds',
					requiredAcls: [AdminACLs.GUILD_LOOKUP],
					description: 'Look up a guild by ID or name — view members, settings, features, and moderation history.',
				},
			],
		},
		{
			title: 'Moderation',
			items: [
				{
					title: 'Reports',
					path: '/reports',
					activeKey: 'reports',
					requiredAcls: [AdminACLs.REPORT_VIEW],
					description: 'Review user-submitted reports against messages, users, and guilds, and take action on them.',
				},
				{
					title: 'Bulk Actions',
					path: '/bulk-actions',
					activeKey: 'bulk-actions',
					requiredAcls: [
						AdminACLs.BULK_UPDATE_USER_FLAGS,
						AdminACLs.BULK_UPDATE_GUILD_FEATURES,
						AdminACLs.BULK_ADD_GUILD_MEMBERS,
						AdminACLs.BULK_DELETE_USERS,
					],
					description:
						'Apply flag, feature, membership, or deletion changes to many users or guilds at once — scheduled deletions are hard to undo, so double-check the ID list first.',
				},
			],
		},
		{
			title: 'Bans',
			items: [
				{
					title: 'IP Bans',
					path: '/ip-bans',
					activeKey: 'ip-bans',
					requiredAcls: [AdminACLs.BAN_IP_CHECK, AdminACLs.BAN_IP_ADD, AdminACLs.BAN_IP_REMOVE],
					description: 'Block or allow specific IP addresses or CIDR ranges at the network level, independent of account bans.',
				},
				{
					title: 'Email Bans',
					path: '/email-bans',
					activeKey: 'email-bans',
					requiredAcls: [AdminACLs.BAN_EMAIL_CHECK, AdminACLs.BAN_EMAIL_ADD, AdminACLs.BAN_EMAIL_REMOVE],
					description: 'Block specific email addresses from registering or logging in, independent of account bans.',
				},
				{
					title: 'Phone Bans',
					path: '/phone-bans',
					activeKey: 'phone-bans',
					requiredAcls: [AdminACLs.BAN_PHONE_CHECK, AdminACLs.BAN_PHONE_ADD, AdminACLs.BAN_PHONE_REMOVE],
					description: 'Block specific phone numbers from being used for verification, independent of account bans.',
				},
			],
		},
		{
			title: 'Content',
			items: [
				{
					title: 'Message Tools',
					path: '/messages',
					activeKey: 'message-tools',
					requiredAcls: [
						AdminACLs.MESSAGE_LOOKUP,
						AdminACLs.MESSAGE_DELETE,
						AdminACLs.MESSAGE_SHRED,
						AdminACLs.MESSAGE_DELETE_ALL,
					],
					description: 'Look up a message by ID or attachment, then delete or shred (irreversibly strip) its content.',
				},
				{
					title: 'System DMs',
					path: '/system-dms',
					activeKey: 'system-dms',
					requiredAcls: [AdminACLs.SYSTEM_DM_SEND],
					description: 'Send a one-off direct message from the system account to a filtered set of users, and track delivery.',
				},
				{
					title: 'Archives',
					path: '/archives',
					activeKey: 'archives',
					requiredAcls: [AdminACLs.ARCHIVE_VIEW_ALL, AdminACLs.ARCHIVE_TRIGGER_USER, AdminACLs.ARCHIVE_TRIGGER_GUILD],
					description: 'Trigger or review data export archives for a specific user or guild (e.g. for compliance/legal requests).',
				},
				{
					title: 'Asset Purge',
					path: '/asset-purge',
					activeKey: 'asset-purge',
					requiredAcls: [AdminACLs.ASSET_PURGE],
					description:
						'Permanently delete custom guild emoji/sticker files from S3 and CDN caches — this is destructive and does not remove the emoji/sticker record itself, only the underlying file.',
				},
				{
					title: 'News',
					path: '/news',
					activeKey: 'news',
					requiredAcls: [AdminACLs.NEWS_VIEW],
					description: 'Create, edit, and publish news stories shown to users on the platform.',
				},
			],
		},
		{
			title: 'Observability',
			items: [
				{
					title: 'Gateway',
					path: '/gateway',
					activeKey: 'gateway',
					requiredAcls: [AdminACLs.GATEWAY_MEMORY_STATS, AdminACLs.GATEWAY_RELOAD_ALL],
					description: 'Inspect realtime gateway node health and memory usage, and reload connected guild state.',
				},
				{
					title: 'Audit Logs',
					path: '/audit-logs',
					activeKey: 'audit-logs',
					requiredAcls: [AdminACLs.AUDIT_LOG_VIEW],
					description: 'Search the trail of every admin action taken across the platform, filterable by admin and target.',
				},
			],
		},
		{
			title: 'Platform',
			items: [
				{
					title: 'Search Index',
					path: '/search-index',
					activeKey: 'search-index',
					requiredAcls: [AdminACLs.GUILD_LOOKUP],
					description: 'Trigger reindexing of search collections (users, guilds, messages, etc.) when results look stale.',
				},
				{
					title: 'Voice Regions',
					path: '/voice-regions',
					activeKey: 'voice-regions',
					requiredAcls: [AdminACLs.VOICE_REGION_LIST],
					description: 'Manage the voice/video regions users can select for calls.',
				},
				{
					title: 'Voice Servers',
					path: '/voice-servers',
					activeKey: 'voice-servers',
					requiredAcls: [AdminACLs.VOICE_SERVER_LIST],
					description: "Manage the LiveKit SFU servers backing a specific voice region's call capacity.",
				},
			],
		},
		{
			title: 'Configuration',
			items: [
				{
					title: 'Instance Config',
					path: '/instance-config',
					activeKey: 'instance-config',
					requiredAcls: [AdminACLs.INSTANCE_CONFIG_VIEW, AdminACLs.INSTANCE_CONFIG_UPDATE],
					description: 'Platform-wide settings: registration review rules, SSO, and snowflake ID reservations.',
				},
				{
					title: 'Limit Config',
					path: '/limit-config',
					activeKey: 'limit-config',
					requiredAcls: [AdminACLs.INSTANCE_LIMIT_CONFIG_VIEW, AdminACLs.INSTANCE_LIMIT_CONFIG_UPDATE],
					description:
						'Tune platform-wide rate limits and resource caps (message length, upload size, guild member caps, etc.), optionally scoped to specific user/guild trait rules like premium.',
				},
				{
					title: 'Admin API Keys',
					path: '/admin-api-keys',
					activeKey: 'admin-api-keys',
					requiredAcls: [AdminACLs.ADMIN_API_KEY_MANAGE],
					description: 'Issue and revoke scoped API keys for programmatic access to admin endpoints.',
				},
			],
		},
		{
			title: 'Discovery',
			items: [
				{
					title: 'Applications',
					path: '/discovery?status=pending',
					activeKey: 'discovery',
					requiredAcls: [AdminACLs.DISCOVERY_REVIEW],
					description: 'Review guild applications to the server discovery directory — approve, reject, or remove listings.',
				},
				{
					title: 'Badges',
					path: '/badges',
					activeKey: 'badges',
					requiredAcls: [AdminACLs.USER_UPDATE_FLAGS, AdminACLs.USER_UPDATE_PREMIUM],
					description: 'Look up a user and grant or revoke their profile badges and lifetime Visionary status.',
				},
			],
		},
	];
}

export function getAccessibleSections(adminAcls: Array<string>, context?: NavigationContext): Array<NavSection> {
	const inspectedVoiceRegionId = context?.inspectedVoiceRegionId;
	const hasContext = Boolean(context);
	const hasInspectedVoiceRegion = Boolean(inspectedVoiceRegionId);

	return getSections()
		.map((section) => ({
			...section,
			items: section.items
				.filter((item) => hasAnyPermission(adminAcls, item.requiredAcls))
				.filter((item) => !hasContext || item.activeKey !== 'voice-servers' || hasInspectedVoiceRegion)
				.map((item) => {
					if (!hasContext || item.activeKey !== 'voice-servers' || !inspectedVoiceRegionId) {
						return item;
					}

					const encodedRegionId = encodeURIComponent(inspectedVoiceRegionId);
					return {
						...item,
						path: `/voice-servers?region_id=${encodedRegionId}`,
					};
				}),
		}))
		.filter((section) => section.items.length > 0);
}

export function getFirstAccessiblePath(adminAcls: Array<string>, context?: NavigationContext): string | null {
	const sections = getAccessibleSections(adminAcls, context);
	const firstSection = sections[0];
	if (!firstSection || firstSection.items.length === 0) return null;
	const firstItem = firstSection.items[0];
	if (!firstItem) return null;
	return firstItem.path;
}
