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

import {StatusSlate} from '@app/components/modals/shared/StatusSlate';
import styles from '@app/components/modals/tabs/developer_teams_tab/DeveloperTeamsTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import FocusRing from '@app/components/uikit/focus_ring/FocusRing';
import type {DeveloperTeamRecord} from '@app/records/DeveloperTeamRecord';
import UserStore from '@app/stores/UserStore';
import * as DateUtils from '@app/utils/DateUtils';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {CaretRightIcon, UsersThreeIcon} from '@phosphor-icons/react';
import clsx from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface TeamsListProps {
	teams: ReadonlyArray<DeveloperTeamRecord>;
	onSelectTeam: (teamId: string) => void;
	onAcceptInvite: (teamId: string) => void;
	onDeclineInvite: (teamId: string) => void;
	pendingInviteActionTeamId: string | null;
}

export const TeamsList: React.FC<TeamsListProps> = observer(
	({teams, onSelectTeam, onAcceptInvite, onDeclineInvite, pendingInviteActionTeamId}) => {
		const {t} = useLingui();
		const currentUserId = UserStore.currentUser?.id;

		if (teams.length === 0) {
			return (
				<div className={styles.emptyState}>
					<StatusSlate
						Icon={UsersThreeIcon}
						title={<Trans>No teams yet</Trans>}
						description={<Trans>Create a team to share access to your applications with other developers.</Trans>}
					/>
				</div>
			);
		}

		return (
			<div className={styles.listContainer}>
				{teams.map((team) => {
					const createdAt = DateUtils.getFormattedShortDate(SnowflakeUtils.extractTimestamp(team.id));
					const isPending = team.isPendingInvite();
					const isOwner = team.isOwnedBy(currentUserId);
					const roleLabel = isOwner
						? t`Owner`
						: team.role === 'admin'
							? t`Admin`
							: team.role === 'read_only'
								? t`Read-only`
								: t`Developer`;

					if (isPending) {
						return (
							<div key={team.id} className={styles.itemContainer}>
								<div className={styles.inviteRowContainer}>
									<div className={styles.itemLeft}>
										<div className={styles.itemAvatarPlaceholder} aria-hidden>
											{team.name.charAt(0).toUpperCase()}
										</div>
										<div className={styles.itemTextBlock}>
											<div className={styles.itemTitleRow}>
												<span className={styles.itemName}>{team.name}</span>
												<span className={clsx(styles.roleBadge, styles.inviteBadge)}>{t`Invited`}</span>
											</div>
											<div className={styles.itemMetaRow}>
												<span>
													<Trans>You've been invited as {roleLabel}</Trans>
												</span>
											</div>
										</div>
									</div>
									<div className={styles.itemActions}>
										<Button
											variant="primary"
											compact
											fitContent
											submitting={pendingInviteActionTeamId === team.id}
											onClick={() => onAcceptInvite(team.id)}
										>
											{t`Accept`}
										</Button>
										<Button
											variant="secondary"
											compact
											fitContent
											disabled={pendingInviteActionTeamId === team.id}
											onClick={() => onDeclineInvite(team.id)}
										>
											{t`Decline`}
										</Button>
									</div>
								</div>
							</div>
						);
					}

					return (
						<div key={team.id} className={styles.itemContainer}>
							<FocusRing offset={-2}>
								<button type="button" className={styles.itemButton} onClick={() => onSelectTeam(team.id)}>
									<div className={styles.itemLeft}>
										<div className={styles.itemAvatarPlaceholder} aria-hidden>
											{team.name.charAt(0).toUpperCase()}
										</div>
										<div className={styles.itemTextBlock}>
											<div className={styles.itemTitleRow}>
												<span className={styles.itemName}>{team.name}</span>
												<span className={styles.roleBadge}>{roleLabel}</span>
											</div>
											<div className={styles.itemMetaRow}>
												<span>
													<Trans>Created {createdAt}</Trans>
												</span>
											</div>
										</div>
									</div>
									<CaretRightIcon className={styles.itemChevron} weight="bold" />
								</button>
							</FocusRing>
						</div>
					);
				})}
			</div>
		);
	},
);
