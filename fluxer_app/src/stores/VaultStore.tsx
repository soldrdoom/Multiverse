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

import type {VaultKeyPair} from '@app/services/vault/VaultService';
import {makeAutoObservable} from 'mobx';

/**
 * VaultStore — global singleton holding the derived X25519 keypair once the
 * Identity Vault is unlocked.  Written by useVault when unlock() succeeds or
 * a silent restore from IndexedDB completes.  Read by the message send and
 * receive pipelines.
 */
class VaultStore {
	keyPair: VaultKeyPair | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setKeyPair(keyPair: VaultKeyPair | null): void {
		this.keyPair = keyPair;
	}

	get isUnlocked(): boolean {
		return this.keyPair !== null && this.keyPair.privateKeyB64.length > 0;
	}
}

export default new VaultStore();
