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

import * as React from 'react';

// Single shared lazy reference: every call site (and ModalActionCreators' own dedup/
// popByType checks) must import this same singleton rather than the real component, or
// referential-equality checks against the rendered element's `.type` silently stop matching.
export const LazyChannelSettingsModal = React.lazy(() =>
	import('@app/components/modals/ChannelSettingsModal').then((m) => ({default: m.ChannelSettingsModal})),
);
