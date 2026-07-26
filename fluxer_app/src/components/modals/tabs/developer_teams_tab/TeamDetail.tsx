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
import {Input} from '@app/components/form/Input';
import {Select, type SelectOption} from '@app/components/form/Select';
import {ConfirmModal} from '@app/components/modals/ConfirmModal';
import {StatusSlate} from '@app/components/modals/shared/StatusSlate';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import styles from '@app/components/modals/tabs/developer_teams_tab/DeveloperTeamsTab.module.css';
import DeveloperTeamsTabStore from '@app/components/modals/tabs/developer_teams_tab/DeveloperTeamsTabStore';
import {Button} from '@app/components/uikit/button/Button';
import {Endpoints} from '@app/Endpoints';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {DeveloperTeam, TeamMemberRole} from '@app/records/DeveloperTeamRecord';
import UserStore from '@app/stores/UserStore';
import {getApiErrorMessage} from '@app/utils/ApiErrorUtils';
import * as AvatarUtils from '@app/utils/AvatarUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowLeftIcon, CheckIcon, CopyIcon, TrashIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const logger = new Logger('TeamDetail');

interface TeamDetailProps {
	teamId: string;
	onBack: () => void;
	onDeleted: () => void;
}

const USER_ID_PATTERN = /^\d{5,}$/;

export const TeamDetail: React.FC<TeamDetailProps> = observer(({teamId, onBack, onDeleted}) => {
	const {t} = useLingui();
	const store = DeveloperTeamsTabStore;
	const currentUserId = UserStore.currentUser?.id;

	const team = store.selectedTeam;
	const members = store.getMembersForTeam(teamId);

	const [idCopied, setIdCopied] = useState(false);
	const [nameInput, setNameInput] = useState(team?.name ?? '');
	const [isRenaming, setIsRenaming] = useState(false);
	const [inviteInput, setInviteInput] = useState('');
	const [inviteRole, setInviteRole] = useState<TeamMemberRole>('developer');
	const [isInviting, setIsInviting] = useState(false);
	const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		setNameInput(team?.name ?? '');
	}, [team?.name]);

	const isOwner = Boolean(team?.isOwnedBy(currentUserId));
	const isManager = isOwner || (team?.membership_state === 'accepted' && team?.role === 'admin');

	const roleOptions: Array<SelectOption<TeamMemberRole>> = [
		{value: 'admin', label: t`Admin`},
		{value: 'developer', label: t`Developer`},
		{value: 'read_only', label: t`Read-only`},
	];

	const handleCopyId = useCallback(async () => {
		if (!team) return;
		try {
			await navigator.clipboard.writeText(team.id);
			setIdCopied(true);
			setTimeout(() => setIdCopied(false), 2000);
		} catch (err) {
			logger.error('Failed to copy ID', err);
		}
	}, [team]);

	const handleRename = useCallback(async () => {
		if (!team) return;
		const name = nameInput.trim();
		if (!name || name === team.name || isRenaming) return;

		setIsRenaming(true);
		try {
			const response = await HttpClient.patch<DeveloperTeam>(Endpoints.TEAM(team.id), {name});
			store.cacheTeam({...team.toObject(), ...response.body});
			ToastActionCreators.createToast({type: 'success', children: t`Team renamed`});
		} catch (err) {
			logger.error('Failed to rename team', err);
			ToastActionCreators.createToast({
				type: 'error',
				children: getApiErrorMessage(err) ?? t`Failed to rename team. Please try again.`,
			});
		} finally {
			setIsRenaming(false);
		}
	}, [team, nameInput, isRenaming, store, t]);

	const handleInvite = useCallback(async () => {
		if (!team) return;
		const input = inviteInput.trim();
		if (!input || isInviting) return;

		let body: Record<string, unknown>;
		if (USER_ID_PATTERN.test(input)) {
			body = {user_id: input, role: inviteRole};
		} else {
			const hashIndex = input.lastIndexOf('#');
			if (hashIndex <= 0 || hashIndex === input.length - 1) {
				ToastActionCreators.createToast({
					type: 'error',
					children: t`Enter a user ID or a full tag like username#0001.`,
				});
				return;
			}
			body = {
				username: input.slice(0, hashIndex),
				discriminator: input.slice(hashIndex + 1),
				role: inviteRole,
			};
		}

		setIsInviting(true);
		try {
			await HttpClient.post(Endpoints.TEAM_MEMBERS(team.id), body);
			setInviteInput('');
			ToastActionCreators.createToast({type: 'success', children: t`Invite sent`});
			await store.fetchMembers(team.id);
		} catch (err) {
			logger.error('Failed to invite member', err);
			ToastActionCreators.createToast({
				type: 'error',
				children: getApiErrorMessage(err) ?? t`Failed to send invite. Please try again.`,
			});
		} finally {
			setIsInviting(false);
		}
	}, [team, inviteInput, inviteRole, isInviting, store, t]);

	const handleRoleChange = useCallback(
		async (memberUserId: string, role: string | null) => {
			if (!team || !role) return;
			setBusyMemberId(memberUserId);
			try {
				await HttpClient.patch(Endpoints.TEAM_MEMBER(team.id, memberUserId), {role});
				ToastActionCreators.createToast({type: 'success', children: t`Member role updated`});
				await store.fetchMembers(team.id);
			} catch (err) {
				logger.error('Failed to update member role', err);
				ToastActionCreators.createToast({
					type: 'error',
					children: getApiErrorMessage(err) ?? t`Failed to update role. Please try again.`,
				});
			} finally {
				setBusyMemberId(null);
			}
		},
		[team, store, t],
	);

	const removeMember = useCallback(
		async (memberUserId: string, isSelf: boolean) => {
			if (!team) return;
			setBusyMemberId(memberUserId);
			try {
				await HttpClient.delete({url: Endpoints.TEAM_MEMBER(team.id, memberUserId), body: {}});
				if (isSelf) {
					ToastActionCreators.createToast({type: 'success', children: t`You left the team`});
					onDeleted();
				} else {
					ToastActionCreators.createToast({type: 'success', children: t`Member removed`});
					await store.fetchMembers(team.id);
				}
			} catch (err) {
				logger.error('Failed to remove member', err);
				ToastActionCreators.createToast({
					type: 'error',
					children: getApiErrorMessage(err) ?? t`Failed to remove member. Please try again.`,
				});
			} finally {
				setBusyMemberId(null);
			}
		},
		[team, store, onDeleted, t],
	);

	const confirmRemoveMember = useCallback(
		(memberUserId: string, displayName: string) => {
			const isSelf = memberUserId === currentUserId;
			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={isSelf ? t`Leave team?` : t`Remove member?`}
						description={
							isSelf ? (
								<Trans>You will lose access to every application this team owns.</Trans>
							) : (
								<Trans>
									<strong>{displayName}</strong> will lose access to every application this team owns.
								</Trans>
							)
						}
						primaryText={isSelf ? t`Leave` : t`Remove`}
						primaryVariant="danger-primary"
						onPrimary={() => removeMember(memberUserId, isSelf)}
					/>
				)),
			);
		},
		[currentUserId, removeMember, t],
	);

	const handleDelete = useCallback(() => {
		if (!team) return;
		ModalActionCreators.push(
			modal(() => (
				<ConfirmModal
					title={t`Delete Team`}
					description={
						<Trans>
							Are you sure you want to delete <strong>{team.name}</strong>? A team that still owns applications cannot
							be deleted — transfer them away first.
						</Trans>
					}
					primaryText={t`Delete Team`}
					primaryVariant="danger-primary"
					onPrimary={async () => {
						try {
							setIsDeleting(true);
							await HttpClient.delete({url: Endpoints.TEAM(team.id), body: {}});
							onDeleted();
						} catch (err) {
							logger.error('Failed to delete team', err);
							// Surfaces TeamStillOwnsApplicationsError's message verbatim.
							ToastActionCreators.createToast({
								type: 'error',
								children: getApiErrorMessage(err) ?? t`Failed to delete team. Please try again.`,
							});
							setIsDeleting(false);
						}
					}}
				/>
			)),
		);
	}, [team, onDeleted, t]);

	if (!team) {
		return (
			<div className={styles.page}>
				<StatusSlate
					Icon={WarningCircleIcon}
					title={<Trans>We couldn't load this team</Trans>}
					description={<Trans>Please retry or go back to the teams list.</Trans>}
					fullHeight={true}
					actions={[
						{
							text: <Trans>Retry</Trans>,
							onClick: () => store.fetchTeams({showLoading: false}),
						},
						{
							text: <Trans>Back to list</Trans>,
							onClick: onBack,
							variant: 'secondary',
						},
					]}
				/>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.pageHeader}>
				<div className={styles.breadcrumbRow}>
					<Button variant="secondary" onClick={onBack} leftIcon={<ArrowLeftIcon size={16} weight="bold" />} fitContent>
						{t`Back to Teams`}
					</Button>
				</div>

				<h2 className={styles.heroTitle}>{team.name}</h2>
				<Input
					label={t`Team ID`}
					value={team.id}
					readOnly
					className={styles.metaInput}
					rightElement={
						<Button
							variant="secondary"
							compact
							fitContent
							onClick={handleCopyId}
							leftIcon={idCopied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
						>
							{idCopied ? t`Copied` : t`Copy ID`}
						</Button>
					}
				/>
			</div>

			{isManager && (
				<>
					<SectionCard id="team-profile" title={t`Team Profile`} subtitle={t`Rename your team.`}>
						<div className={styles.renameRow}>
							<Input
								label={t`Team Name`}
								value={nameInput}
								onChange={(e) => setNameInput(e.target.value)}
								maxLength={100}
							/>
							<Button
								variant="primary"
								compact
								fitContent
								submitting={isRenaming}
								disabled={!nameInput.trim() || nameInput.trim() === team.name}
								onClick={handleRename}
							>
								{t`Save`}
							</Button>
						</div>
					</SectionCard>
					<div className={styles.sectionSpacer} aria-hidden="true" />
				</>
			)}

			<SectionCard
				id="team-members"
				title={t`Members`}
				subtitle={t`People with access to this team's applications. Invites confer no access until accepted.`}
			>
				<div className={styles.fieldStack}>
					{store.membersError ? (
						<div className={styles.errorRow}>
							<WarningCircleIcon size={18} weight="fill" />
							<span>{store.membersError}</span>
							<Button variant="secondary" compact fitContent onClick={() => store.fetchMembers(teamId)}>
								{t`Retry`}
							</Button>
						</div>
					) : (
						<div className={styles.memberList}>
							{members.map((member) => {
								const memberIsOwner = member.user.id === team.owner_user_id;
								const isSelf = member.user.id === currentUserId;
								const displayName = member.user.global_name || member.user.username;
								const avatarUrl = AvatarUtils.getUserAvatarURL({id: member.user.id, avatar: member.user.avatar});
								const canEditRow = isManager && !memberIsOwner && !isSelf;
								const showRemove = canEditRow || (isSelf && !memberIsOwner);

								return (
									<div key={member.user.id} className={styles.memberRow}>
										<div className={styles.memberInfo}>
											{avatarUrl ? (
												<img src={avatarUrl} alt="" className={styles.memberAvatar} aria-hidden />
											) : (
												<div className={styles.memberAvatar} aria-hidden />
											)}
											<div className={styles.memberText}>
												<span className={styles.memberName}>
													{displayName}
													{'  '}
													<span className={styles.memberMeta}>
														{member.user.username}#{member.user.discriminator}
													</span>
												</span>
												<span className={styles.memberMeta}>
													{memberIsOwner ? (
														<span className={styles.roleBadge}>{t`Owner`}</span>
													) : member.membership_state === 'invited' ? (
														<Trans>Invited — pending</Trans>
													) : member.role === 'admin' ? (
														t`Admin`
													) : member.role === 'read_only' ? (
														t`Read-only`
													) : (
														t`Developer`
													)}
												</span>
											</div>
										</div>
										<div className={styles.memberActions}>
											{canEditRow && (
												<div className={styles.memberRoleSelect}>
													<Select
														value={member.role}
														options={roleOptions}
														onChange={(value) => handleRoleChange(member.user.id, value)}
														disabled={busyMemberId === member.user.id}
													/>
												</div>
											)}
											{showRemove && (
												<Button
													variant="danger-primary"
													compact
													fitContent
													submitting={busyMemberId === member.user.id}
													onClick={() =>
														confirmRemoveMember(member.user.id, `${member.user.username}#${member.user.discriminator}`)
													}
												>
													{isSelf ? t`Leave` : t`Remove`}
												</Button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}

					{isManager && (
						<div className={styles.inviteRow}>
							<Input
								label={t`Invite a developer`}
								value={inviteInput}
								onChange={(e) => setInviteInput(e.target.value)}
								placeholder={t`username#0001 or user ID`}
							/>
							<div className={styles.inviteRoleSelect}>
								<Select
									label={t`Role`}
									value={inviteRole}
									options={roleOptions}
									onChange={(value) => setInviteRole((value as TeamMemberRole | null) ?? 'developer')}
								/>
							</div>
							<Button
								variant="primary"
								compact
								fitContent
								submitting={isInviting}
								disabled={!inviteInput.trim()}
								onClick={handleInvite}
							>
								{t`Invite`}
							</Button>
						</div>
					)}
				</div>
			</SectionCard>

			{isOwner && (
				<>
					<div className={styles.sectionSpacer} aria-hidden="true" />
					<SectionCard
						id="team-danger"
						tone="danger"
						title={<Trans>Danger Zone</Trans>}
						subtitle={<Trans>A team that still owns applications cannot be deleted.</Trans>}
					>
						<div className={styles.dangerContent}>
							<p className={styles.helperText}>
								<Trans>Transfer this team's applications away first, then delete the team.</Trans>
							</p>
							<div className={styles.dangerActions}>
								<Button
									variant="danger-primary"
									onClick={handleDelete}
									submitting={isDeleting}
									leftIcon={<TrashIcon size={16} weight="fill" />}
									fitContent
								>
									<Trans>Delete Team</Trans>
								</Button>
							</div>
						</div>
					</SectionCard>
				</>
			)}
		</div>
	);
});
