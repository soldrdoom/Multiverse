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

import type {ApplicationCommandID, ApplicationID, UserID} from '@fluxer/api/src/BrandedTypes';
import type {
	ApplicationCommandOptionDefinition,
	ApplicationCommandRow,
} from '@fluxer/api/src/database/types/ApplicationCommandTypes';

export class ApplicationCommand {
	readonly id: ApplicationCommandID;
	readonly botUserId: UserID;
	readonly name: string;
	readonly applicationId: ApplicationID;
	readonly description: string;
	readonly options: Array<ApplicationCommandOptionDefinition>;
	readonly createdAt: Date;
	readonly updatedAt: Date;

	constructor(row: ApplicationCommandRow) {
		this.id = row.id;
		this.botUserId = row.bot_user_id;
		this.name = row.name;
		this.applicationId = row.application_id;
		this.description = row.description;
		this.options = parseOptions(row.options);
		this.createdAt = row.created_at;
		this.updatedAt = row.updated_at;
	}

	toRow(): ApplicationCommandRow {
		return {
			id: this.id,
			bot_user_id: this.botUserId,
			name: this.name,
			application_id: this.applicationId,
			description: this.description,
			options: JSON.stringify(this.options),
			created_at: this.createdAt,
			updated_at: this.updatedAt,
		};
	}

	toResponse(): {
		id: string;
		application_id: string;
		name: string;
		description: string;
		options: Array<ApplicationCommandOptionDefinition>;
	} {
		return {
			id: this.id.toString(),
			application_id: this.applicationId.toString(),
			name: this.name,
			description: this.description,
			options: this.options,
		};
	}
}

function parseOptions(value: string): Array<ApplicationCommandOptionDefinition> {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as Array<ApplicationCommandOptionDefinition>) : [];
	} catch {
		return [];
	}
}
