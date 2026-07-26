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

export interface BotToken {
	id: string;
	name: string;
	preview: string;
	created_at: string;
	created_by_user_id: string;
	last_used_at: string | null;
	/** Present only in the create response; never returned again. */
	token?: string;
}

export class BotTokenRecord implements BotToken {
	readonly id: string;
	readonly name: string;
	readonly preview: string;
	readonly created_at: string;
	readonly created_by_user_id: string;
	readonly last_used_at: string | null;
	readonly token?: string;

	constructor(token: BotToken) {
		this.id = token.id;
		this.name = token.name;
		this.preview = token.preview;
		this.created_at = token.created_at;
		this.created_by_user_id = token.created_by_user_id;
		this.last_used_at = token.last_used_at ?? null;
		if ('token' in token) {
			this.token = token.token;
		}
	}

	static from(token: BotToken): BotTokenRecord {
		return new BotTokenRecord(token);
	}

	toObject(): BotToken {
		return {
			id: this.id,
			name: this.name,
			preview: this.preview,
			created_at: this.created_at,
			created_by_user_id: this.created_by_user_id,
			last_used_at: this.last_used_at,
			token: this.token,
		};
	}
}
