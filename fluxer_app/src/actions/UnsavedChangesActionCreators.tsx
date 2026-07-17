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

import UnsavedChangesStore from '@app/stores/UnsavedChangesStore';

export function setUnsavedChanges(tabId: string, hasChanges: boolean): void {
	UnsavedChangesStore.setUnsavedChanges(tabId, hasChanges);
}

export function triggerFlashEffect(tabId: string): void {
	UnsavedChangesStore.triggerFlash(tabId);
}

export function clearUnsavedChanges(tabId: string): void {
	UnsavedChangesStore.clearUnsavedChanges(tabId);
}

export function setTabData(
	tabId: string,
	data: {onReset?: () => void; onSave?: () => void; isSubmitting?: boolean},
): void {
	UnsavedChangesStore.setTabData(tabId, data);
}
