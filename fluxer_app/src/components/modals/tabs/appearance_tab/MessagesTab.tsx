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

import * as AccessibilityActionCreators from '@app/actions/AccessibilityActionCreators';
import {Message} from '@app/components/channel/Message';
import {SettingsTabSection} from '@app/components/modals/shared/SettingsTabLayout';
import appearanceTabStyles from '@app/components/modals/tabs/AppearanceTab.module.css';
import {Slider} from '@app/components/uikit/Slider';
import {ChannelRecord} from '@app/records/ChannelRecord';
import {MessageRecord} from '@app/records/MessageRecord';
import AccessibilityStore from '@app/stores/AccessibilityStore';
import ChannelStore from '@app/stores/ChannelStore';
import MobileLayoutStore from '@app/stores/MobileLayoutStore';
import UserStore from '@app/stores/UserStore';
import {isNewMessageGroup} from '@app/utils/MessageGroupingUtils';
import {MessagePreviewContext, MessageStates, MessageTypes} from '@fluxer/constants/src/ChannelConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo} from 'react';

const MessagesPreview: React.FC = observer(() => {
	const {t} = useLingui();
	const currentUser = UserStore.getCurrentUser();
	const author = currentUser?.toJSON() || {
		id: '1000000000000000030',
		username: 'PreviewUser',
		discriminator: '0000',
		global_name: 'Preview User',
		avatar: null,
		avatar_color: null,
		bot: false,
		system: false,
		flags: 0,
	};

	const fakeChannel = useMemo(
		() =>
			new ChannelRecord({
				id: '1000000000000000031',
				type: 0,
				name: 'fake-channel',
				position: 0,
				parent_id: null,
				topic: null,
				url: null,
				nsfw: false,
				last_message_id: null,
				last_pin_timestamp: null,
				bitrate: null,
				user_limit: null,
				permission_overwrites: [],
			}),
		[],
	);

	useEffect(() => {
		ChannelStore.handleChannelCreate({channel: fakeChannel.toJSON()});
		return () => {
			ChannelStore.handleChannelDelete({channel: fakeChannel.toJSON()});
		};
	}, [fakeChannel]);

	const baseTime = new Date();
	const messageContents = [
		{content: t`This is how messages appear in Comfy mode`, offsetMinutes: 0},
		{content: t`Consecutive messages from the same person are grouped`, offsetMinutes: 1},
		{content: t`Adjust the spacing between groups below`, offsetMinutes: 2},
	];
	const fakeMessages = messageContents.map(({content, offsetMinutes}, index) => {
		const timestamp = new Date(baseTime.getTime() + offsetMinutes * 60 * 1000);
		return new MessageRecord(
			{
				id: `100000000000000004${index}`,
				channel_id: '1000000000000000031',
				author,
				type: MessageTypes.DEFAULT,
				flags: 0,
				pinned: false,
				mention_everyone: false,
				content,
				timestamp: timestamp.toISOString(),
				state: MessageStates.SENT,
			},
			{skipUserCache: true},
		);
	});

	return (
		<div className={appearanceTabStyles.previewWrapper}>
			<div className={clsx(appearanceTabStyles.previewContainer, appearanceTabStyles.previewContainerCozy)}>
				<div className={appearanceTabStyles.previewMessagesContainer} key="appearance-messages-preview-scroller">
					{fakeMessages.map((message, index) => {
						const prevMessage = index > 0 ? fakeMessages[index - 1] : undefined;
						const isNewGroup = isNewMessageGroup(fakeChannel, prevMessage, message);
						return (
							<Message
								key={message.id}
								channel={fakeChannel}
								message={message}
								prevMessage={prevMessage}
								previewContext={MessagePreviewContext.SETTINGS}
								shouldGroup={!isNewGroup}
							/>
						);
					})}
				</div>
				<div className={appearanceTabStyles.previewOverlay} />
			</div>
		</div>
	);
});

export const AppearanceTabPreview = MessagesPreview;

export const MessagesTabContent: React.FC = observer(() => {
	const {t} = useLingui();
	const messageGroupSpacing = AccessibilityStore.messageGroupSpacing;
	const mobileLayout = MobileLayoutStore;

	if (mobileLayout.enabled) {
		return <Trans>Message display settings are only available on desktop.</Trans>;
	}

	return (
		<>
			<SettingsTabSection
				title={t`Space between message groups`}
				description={t`Adjust the spacing between groups of messages.`}
			>
				<Slider
					defaultValue={messageGroupSpacing}
					factoryDefaultValue={8}
					markers={[0, 4, 8, 16, 24]}
					stickToMarkers={true}
					onValueChange={(value) => AccessibilityActionCreators.update({messageGroupSpacing: value})}
					onMarkerRender={(value) => `${value}px`}
				/>
			</SettingsTabSection>
		</>
	);
});
