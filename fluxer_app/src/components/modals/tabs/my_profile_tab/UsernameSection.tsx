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

import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import {modal} from '@app/actions/ModalActionCreators';
import {MultiverseTagChangeModal} from '@app/components/modals/MultiverseTagChangeModal';
import styles from '@app/components/modals/tabs/my_profile_tab/UsernameSection.module.css';
import {Button} from '@app/components/uikit/button/Button';
import type {UserRecord} from '@app/records/UserRecord';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

interface UsernameSectionProps {
	isClaimed: boolean;
	user: UserRecord;
}

export const UsernameSection = observer(({isClaimed, user}: UsernameSectionProps) => {
	const {t} = useLingui();

	const handleChangeTag = () => {
		ModalActionCreators.push(modal(() => <MultiverseTagChangeModal user={user} />));
	};

	return (
		<div>
			<div className={styles.label}>
				<Trans>Username</Trans>
			</div>

			<div className={styles.actions}>
				<Button variant="primary" small disabled={!isClaimed} onClick={handleChangeTag} aria-label={t`Change MultiverseTag`}>
					<Trans>Change MultiverseTag</Trans>
				</Button>
			</div>

			<div className={styles.description}>
				<Trans>Change your username and 4-digit tag</Trans>
			</div>
		</div>
	);
});
