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

import styles from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetail.module.css';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {AvatarUploader} from '@app/components/modals/tabs/my_profile_tab/AvatarUploader';
import type {DeveloperApplication} from '@app/records/DeveloperApplicationRecord';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';

interface ApplicationIconSectionProps {
	application: DeveloperApplication;
	displayIconUrl: string | null;
	hasIcon: boolean;
	hasClearedIcon: boolean;
	onIconChange: (value: string) => void;
	onIconClear: () => void;
	errorMessage?: string;
	sectionId?: string;
}

export const ApplicationIconSection: React.FC<ApplicationIconSectionProps> = ({
	application,
	displayIconUrl,
	hasIcon,
	hasClearedIcon,
	onIconChange,
	onIconClear,
	errorMessage,
	sectionId,
}) => {
	const {t} = useLingui();
	return (
		<SectionCard
			id={sectionId}
			title={t`Application Icon`}
			subtitle={t`Shown on the authorization screen and in directories, independent of the bot's avatar.`}
		>
			<div className={styles.avatarRow}>
				{displayIconUrl ? (
					<img src={displayIconUrl} alt={t`Application icon`} className={styles.avatarPreview} />
				) : (
					<div className={styles.avatarPlaceholder}>{application.name.charAt(0).toUpperCase()}</div>
				)}
				<AvatarUploader
					hasAvatar={hasIcon && !hasClearedIcon}
					onAvatarChange={onIconChange}
					onAvatarClear={onIconClear}
					isPerGuildProfile={false}
					errorMessage={errorMessage}
				/>
			</div>
		</SectionCard>
	);
};
