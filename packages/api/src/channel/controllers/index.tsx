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

import {CallController} from '@fluxer/api/src/channel/controllers/CallController';
import {ChannelController} from '@fluxer/api/src/channel/controllers/ChannelController';
import {MessageController} from '@fluxer/api/src/channel/controllers/MessageController';
import {MessageInteractionController} from '@fluxer/api/src/channel/controllers/MessageInteractionController';
import {ScheduledMessageController} from '@fluxer/api/src/channel/controllers/ScheduledMessageController';
import {StreamController} from '@fluxer/api/src/channel/controllers/StreamController';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';

export function registerChannelControllers(app: HonoApp) {
	ChannelController(app);
	MessageInteractionController(app);
	MessageController(app);
	ScheduledMessageController(app);
	CallController(app);
	StreamController(app);
}
