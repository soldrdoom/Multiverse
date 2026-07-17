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

import type {DonorMagicLinkTokenRow} from '@fluxer/api/src/database/types/DonationTypes';

export class DonorMagicLinkToken {
	readonly token: string;
	readonly donorEmail: string;
	readonly expiresAt: Date;
	readonly usedAt: Date | null;

	constructor(row: DonorMagicLinkTokenRow) {
		this.token = row.token_;
		this.donorEmail = row.donor_email;
		this.expiresAt = row.expires_at;
		this.usedAt = row.used_at ?? null;
	}

	toRow(): DonorMagicLinkTokenRow {
		return {
			token_: this.token,
			donor_email: this.donorEmail,
			expires_at: this.expiresAt,
			used_at: this.usedAt,
		};
	}

	isExpired(): boolean {
		return new Date() > this.expiresAt;
	}

	isUsed(): boolean {
		return this.usedAt !== null;
	}

	isValid(): boolean {
		return !this.isExpired() && !this.isUsed();
	}
}
