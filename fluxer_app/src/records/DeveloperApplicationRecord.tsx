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

export interface DeveloperApplicationBot {
	id: string;
	username: string;
	discriminator: string;
	avatar: string | null;
	bio?: string | null;
	token?: string;
	banner?: string | null;
	flags?: number;
}

export interface DeveloperApplication {
	id: string;
	name: string;
	description: string | null;
	icon: string | null;
	tags: Array<string>;
	privacy_policy_url: string | null;
	terms_of_service_url: string | null;
	redirect_uris: Array<string>;
	bot_public: boolean;
	bot_require_code_grant: boolean;
	client_secret?: string;
	bot?: DeveloperApplicationBot;
}

export class DeveloperApplicationRecord implements DeveloperApplication {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly icon: string | null;
	readonly tags: Array<string>;
	readonly privacy_policy_url: string | null;
	readonly terms_of_service_url: string | null;
	readonly redirect_uris: Array<string>;
	readonly bot_public: boolean;
	readonly bot_require_code_grant: boolean;
	readonly client_secret?: string;
	readonly bot?: DeveloperApplicationBot;

	constructor(application: DeveloperApplication) {
		this.id = application.id;
		this.name = application.name;
		this.description = application.description ?? null;
		this.icon = application.icon ?? null;
		this.tags = application.tags ? [...application.tags] : [];
		this.privacy_policy_url = application.privacy_policy_url ?? null;
		this.terms_of_service_url = application.terms_of_service_url ?? null;
		this.redirect_uris = application.redirect_uris ? [...application.redirect_uris] : [];
		this.bot_public = application.bot_public;
		this.bot_require_code_grant = application.bot_require_code_grant;
		if ('client_secret' in application) {
			this.client_secret = application.client_secret;
		}
		if (application.bot) {
			this.bot = {
				id: application.bot.id,
				username: application.bot.username,
				discriminator: application.bot.discriminator,
				avatar: application.bot.avatar,
				bio: application.bot.bio ?? null,
				token: application.bot.token,
				banner: application.bot.banner ?? null,
				flags: application.bot.flags,
			};
		}
	}

	static from(application: DeveloperApplication): DeveloperApplicationRecord {
		return new DeveloperApplicationRecord(application);
	}

	withUpdates(updates: Partial<DeveloperApplication>): DeveloperApplicationRecord {
		return new DeveloperApplicationRecord({
			...this.toObject(),
			...updates,
			redirect_uris: updates.redirect_uris ?? this.redirect_uris,
			bot: updates.bot ?? this.bot,
		});
	}

	toObject(): DeveloperApplication {
		return {
			id: this.id,
			name: this.name,
			description: this.description,
			icon: this.icon,
			tags: [...this.tags],
			privacy_policy_url: this.privacy_policy_url,
			terms_of_service_url: this.terms_of_service_url,
			redirect_uris: [...this.redirect_uris],
			bot_public: this.bot_public,
			bot_require_code_grant: this.bot_require_code_grant,
			client_secret: this.client_secret,
			bot: this.bot
				? {
						...this.bot,
						flags: this.bot.flags,
					}
				: undefined,
		};
	}
}
