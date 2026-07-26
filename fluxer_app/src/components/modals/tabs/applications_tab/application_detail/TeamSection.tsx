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

import * as ToastActionCreators from '@app/actions/ToastActionCreators';
import {Select, type SelectOption} from '@app/components/form/Select';
import ApplicationsTabStore from '@app/components/modals/tabs/applications_tab/ApplicationsTabStore';
import styles from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetail.module.css';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {Button} from '@app/components/uikit/button/Button';
import {Endpoints} from '@app/Endpoints';
import {useSudo} from '@app/hooks/useSudo';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {DeveloperApplication} from '@app/records/DeveloperApplicationRecord';
import type {DeveloperTeam} from '@app/records/DeveloperTeamRecord';
import UserStore from '@app/stores/UserStore';
import {getApiErrorMessage} from '@app/utils/ApiErrorUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';

const logger = new Logger('TeamSection');

const PERSONAL_OPTION_VALUE = '';

interface TeamSectionProps {
	application: DeveloperApplication;
	teams: Array<DeveloperTeam>;
	sectionId?: string;
}

export const TeamSection: React.FC<TeamSectionProps> = observer(({application, teams, sectionId}) => {
	const {t} = useLingui();
	const sudo = useSudo();
	const store = ApplicationsTabStore;
	const currentUserId = UserStore.currentUser?.id;

	const [selectedTeamId, setSelectedTeamId] = useState<string>(application.team_id ?? PERSONAL_OPTION_VALUE);
	const [isTransferring, setIsTransferring] = useState(false);

	useEffect(() => {
		setSelectedTeamId(application.team_id ?? PERSONAL_OPTION_VALUE);
	}, [application.team_id]);

	const owningTeam = useMemo(
		() => (application.team_id ? (teams.find((team) => team.id === application.team_id) ?? null) : null),
		[application.team_id, teams],
	);

	// An application with no team is only visible to its owner. With a team, the
	// effective owner is the team's owner (transfer rewrites owner_user_id).
	const isOwner = application.team_id === null || (owningTeam !== null && owningTeam.owner_user_id === currentUserId);

	const viewerRole: string | null = useMemo(() => {
		if (application.team_id === null) return 'owner';
		if (!owningTeam) return null;
		if (owningTeam.owner_user_id === currentUserId) return 'owner';
		return owningTeam.role ?? null;
	}, [application.team_id, owningTeam, currentUserId]);

	const roleLabel = useMemo(() => {
		switch (viewerRole) {
			case 'owner':
				return t`Owner`;
			case 'admin':
				return t`Admin`;
			case 'developer':
				return t`Developer`;
			case 'read_only':
				return t`Read-only`;
			default:
				return null;
		}
	}, [viewerRole, t]);

	// The server requires admin rights on the destination team.
	const destinationOptions = useMemo<Array<SelectOption>>(() => {
		const options: Array<SelectOption> = [{value: PERSONAL_OPTION_VALUE, label: t`Personal (no team)`}];
		for (const team of teams) {
			const isManager =
				team.owner_user_id === currentUserId || (team.membership_state === 'accepted' && team.role === 'admin');
			if (isManager) {
				options.push({value: team.id, label: team.name});
			}
		}
		return options;
	}, [teams, currentUserId, t]);

	const hasChange = selectedTeamId !== (application.team_id ?? PERSONAL_OPTION_VALUE);

	const handleTransfer = useCallback(async () => {
		if (!hasChange || isTransferring) return;
		setIsTransferring(true);
		try {
			const sudoPayload = await sudo.require();
			await HttpClient.patch(Endpoints.OAUTH_APPLICATION_TEAM(application.id), {
				team_id: selectedTeamId === PERSONAL_OPTION_VALUE ? null : selectedTeamId,
				...sudoPayload,
			});
			sudo.finalize();
			ToastActionCreators.createToast({type: 'success', children: t`Application transferred`});
			await store.fetchApplication(application.id);
		} catch (err) {
			logger.error('Failed to transfer application', err);
			ToastActionCreators.createToast({
				type: 'error',
				children: getApiErrorMessage(err) ?? t`Failed to transfer application. Please try again.`,
			});
		} finally {
			setIsTransferring(false);
		}
	}, [application.id, hasChange, isTransferring, selectedTeamId, store, sudo, t]);

	return (
		<SectionCard
			id={sectionId}
			title={t`Team`}
			subtitle={t`Developer teams share access to an application without sharing credentials.`}
		>
			<div className={styles.fieldStack}>
				<div className={styles.teamRow}>
					<span className={styles.teamName}>{owningTeam ? owningTeam.name : t`Personal`}</span>
					{roleLabel && <span className={styles.roleBadge}>{roleLabel}</span>}
				</div>

				{isOwner ? (
					<div className={styles.teamTransferRow}>
						<Select
							label={t`Transfer to`}
							value={selectedTeamId}
							options={destinationOptions}
							onChange={(value) => setSelectedTeamId(value ?? PERSONAL_OPTION_VALUE)}
						/>
						<div className={styles.secretActions}>
							<Button
								variant="primary"
								compact
								fitContent
								submitting={isTransferring}
								disabled={!hasChange}
								onClick={handleTransfer}
							>
								{t`Transfer`}
							</Button>
						</div>
					</div>
				) : (
					<p className={styles.helperText}>
						<Trans>Only the application's owner can transfer it to another team.</Trans>
					</p>
				)}
			</div>
		</SectionCard>
	);
});
