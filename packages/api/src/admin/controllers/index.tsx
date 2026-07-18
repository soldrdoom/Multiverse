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

import {AdminApiKeyAdminController} from '@fluxer/api/src/admin/controllers/AdminApiKeyAdminController';
import {ArchiveAdminController} from '@fluxer/api/src/admin/controllers/ArchiveAdminController';
import {AssetAdminController} from '@fluxer/api/src/admin/controllers/AssetAdminController';
import {AuditLogAdminController} from '@fluxer/api/src/admin/controllers/AuditLogAdminController';
import {BanAdminController} from '@fluxer/api/src/admin/controllers/BanAdminController';
import {BulkAdminController} from '@fluxer/api/src/admin/controllers/BulkAdminController';
import {ChildSafetyAdminController} from '@fluxer/api/src/admin/controllers/ChildSafetyAdminController';
import {DiscoveryAdminController} from '@fluxer/api/src/admin/controllers/DiscoveryAdminController';
import {GatewayAdminController} from '@fluxer/api/src/admin/controllers/GatewayAdminController';
import {GuildAdminController} from '@fluxer/api/src/admin/controllers/GuildAdminController';
import {InstanceConfigAdminController} from '@fluxer/api/src/admin/controllers/InstanceConfigAdminController';
import {LimitConfigAdminController} from '@fluxer/api/src/admin/controllers/LimitConfigAdminController';
import {MessageAdminController} from '@fluxer/api/src/admin/controllers/MessageAdminController';
import {ReportAdminController} from '@fluxer/api/src/admin/controllers/ReportAdminController';
import {SearchAdminController} from '@fluxer/api/src/admin/controllers/SearchAdminController';
import {SnowflakeReservationAdminController} from '@fluxer/api/src/admin/controllers/SnowflakeReservationAdminController';
import {SystemDmAdminController} from '@fluxer/api/src/admin/controllers/SystemDmAdminController';
import {UserAdminController} from '@fluxer/api/src/admin/controllers/UserAdminController';
import {VoiceAdminController} from '@fluxer/api/src/admin/controllers/VoiceAdminController';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';

export function registerAdminControllers(app: HonoApp) {
	AdminApiKeyAdminController(app);
	UserAdminController(app);
	GuildAdminController(app);
	AssetAdminController(app);
	BanAdminController(app);
	InstanceConfigAdminController(app);
	LimitConfigAdminController(app);
	SnowflakeReservationAdminController(app);
	MessageAdminController(app);
	BulkAdminController(app);
	AuditLogAdminController(app);
	ArchiveAdminController(app);
	ReportAdminController(app);
	ChildSafetyAdminController(app);
	VoiceAdminController(app);
	GatewayAdminController(app);
	SearchAdminController(app);
	DiscoveryAdminController(app);
	SystemDmAdminController(app);
}
