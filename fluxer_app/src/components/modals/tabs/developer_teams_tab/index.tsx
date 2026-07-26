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
import * as ToastActionCreators from '@app/actions/ToastActionCreators';
import {useSettingsContentKey} from '@app/components/modals/hooks/useSettingsContentKey';
import {
	SettingsTabContainer,
	SettingsTabContent,
	SettingsTabSection,
} from '@app/components/modals/shared/SettingsTabLayout';
import {StatusSlate} from '@app/components/modals/shared/StatusSlate';
import styles from '@app/components/modals/tabs/developer_teams_tab/DeveloperTeamsTab.module.css';
import DeveloperTeamsTabStore from '@app/components/modals/tabs/developer_teams_tab/DeveloperTeamsTabStore';
import {TeamCreateModal} from '@app/components/modals/tabs/developer_teams_tab/TeamCreateModal';
import {TeamDetail} from '@app/components/modals/tabs/developer_teams_tab/TeamDetail';
import {TeamsList} from '@app/components/modals/tabs/developer_teams_tab/TeamsList';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {Tooltip} from '@app/components/uikit/tooltip/Tooltip';
import {Endpoints} from '@app/Endpoints';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {DeveloperTeam} from '@app/records/DeveloperTeamRecord';
import UserStore from '@app/stores/UserStore';
import {getApiErrorMessage} from '@app/utils/ApiErrorUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {WarningCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useState} from 'react';

const logger = new Logger('DeveloperTeamsTab');

const DeveloperTeamsTab: React.FC = observer(() => {
	const {t} = useLingui();
	const {setContentKey} = useSettingsContentKey();
	const store = DeveloperTeamsTabStore;
	const currentUserId = UserStore.currentUser?.id;
	const isUnclaimed = !(UserStore.currentUser?.isClaimed() ?? false);
	const [pendingInviteActionTeamId, setPendingInviteActionTeamId] = useState<string | null>(null);

	useLayoutEffect(() => {
		setContentKey(store.contentKey);
	}, [store.contentKey, setContentKey]);

	useEffect(() => {
		void store.fetchTeams({showLoading: store.teams.length === 0});
	}, [store]);

	const handleSelectTeam = useCallback(
		(teamId: string) => {
			void store.navigateToDetail(teamId);
		},
		[store],
	);

	const openCreateModal = useCallback(() => {
		ModalActionCreators.push(
			modal(() => (
				<TeamCreateModal
					onCreated={(team: DeveloperTeam) => {
						store.cacheTeam(team);
						void store.navigateToDetail(team.id);
						void store.fetchTeams({showLoading: false});
					}}
				/>
			)),
		);
	}, [store]);

	const handleBackToList = useCallback(() => {
		void store.navigateToList();
	}, [store]);

	const handleAcceptInvite = useCallback(
		async (teamId: string) => {
			setPendingInviteActionTeamId(teamId);
			try {
				await HttpClient.post(Endpoints.TEAM_INVITE_ACCEPT(teamId), {});
				ToastActionCreators.createToast({type: 'success', children: t`Invite accepted`});
				await store.fetchTeams({showLoading: false});
			} catch (err) {
				logger.error('Failed to accept invite', err);
				ToastActionCreators.createToast({
					type: 'error',
					children: getApiErrorMessage(err) ?? t`Failed to accept invite. Please try again.`,
				});
			} finally {
				setPendingInviteActionTeamId(null);
			}
		},
		[store, t],
	);

	const handleDeclineInvite = useCallback(
		async (teamId: string) => {
			if (!currentUserId) return;
			setPendingInviteActionTeamId(teamId);
			try {
				// Removing yourself while invited declines the invite.
				await HttpClient.delete({url: Endpoints.TEAM_MEMBER(teamId, currentUserId), body: {}});
				ToastActionCreators.createToast({type: 'success', children: t`Invite declined`});
				await store.fetchTeams({showLoading: false});
			} catch (err) {
				logger.error('Failed to decline invite', err);
				ToastActionCreators.createToast({
					type: 'error',
					children: getApiErrorMessage(err) ?? t`Failed to decline invite. Please try again.`,
				});
			} finally {
				setPendingInviteActionTeamId(null);
			}
		},
		[store, currentUserId, t],
	);

	if (store.navigationState === 'LOADING_LIST' || (store.isLoading && store.isListView)) {
		return (
			<SettingsTabContainer>
				<SettingsTabContent>
					<div className={styles.spinnerContainer}>
						<Spinner />
					</div>
				</SettingsTabContent>
			</SettingsTabContainer>
		);
	}

	if (store.navigationState === 'ERROR' && store.isListView) {
		return (
			<SettingsTabContainer>
				<SettingsTabContent>
					<SettingsTabSection
						title={<Trans>Developer Teams</Trans>}
						description={<Trans>Share access to your applications with other developers.</Trans>}
					>
						<StatusSlate
							Icon={WarningCircleIcon}
							title={<Trans>Unable to load teams</Trans>}
							description={<Trans>Check your connection and try again.</Trans>}
							actions={[
								{
									text: <Trans>Retry</Trans>,
									onClick: () => store.fetchTeams({showLoading: true}),
								},
							]}
						/>
					</SettingsTabSection>
				</SettingsTabContent>
			</SettingsTabContainer>
		);
	}

	if (store.isDetailView && store.selectedTeamId) {
		return (
			<SettingsTabContainer>
				<SettingsTabContent>
					<TeamDetail teamId={store.selectedTeamId} onBack={handleBackToList} onDeleted={handleBackToList} />
				</SettingsTabContent>
			</SettingsTabContainer>
		);
	}

	return (
		<SettingsTabContainer>
			<SettingsTabContent>
				<SettingsTabSection
					title={<Trans>Developer Teams</Trans>}
					description={<Trans>Teams share access to applications without sharing credentials.</Trans>}
				>
					<div className={styles.buttonContainer}>
						{isUnclaimed ? (
							<Tooltip text={t`Claim your account to create teams.`}>
								<div>
									<Button variant="primary" fitContainer={false} fitContent onClick={openCreateModal} disabled>
										<Trans>Create Team</Trans>
									</Button>
								</div>
							</Tooltip>
						) : (
							<Button variant="primary" fitContainer={false} fitContent onClick={openCreateModal}>
								<Trans>Create Team</Trans>
							</Button>
						)}
					</div>
					<TeamsList
						teams={store.teams}
						onSelectTeam={handleSelectTeam}
						onAcceptInvite={handleAcceptInvite}
						onDeclineInvite={handleDeclineInvite}
						pendingInviteActionTeamId={pendingInviteActionTeamId}
					/>
				</SettingsTabSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default DeveloperTeamsTab;
