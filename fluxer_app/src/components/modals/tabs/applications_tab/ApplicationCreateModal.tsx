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
import * as ToastActionCreators from '@app/actions/ToastActionCreators';
import {Form} from '@app/components/form/Form';
import {Input, Textarea} from '@app/components/form/Input';
import {Select, type SelectOption} from '@app/components/form/Select';
import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/tabs/applications_tab/ApplicationsTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Endpoints} from '@app/Endpoints';
import {useFormSubmit} from '@app/hooks/useFormSubmit';
import {useSudo} from '@app/hooks/useSudo';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {DeveloperApplication} from '@app/records/DeveloperApplicationRecord';
import type {DeveloperTeam} from '@app/records/DeveloperTeamRecord';
import UserStore from '@app/stores/UserStore';
import {APPLICATION_DESCRIPTION_MAX_LENGTH} from '@fluxer/constants/src/BotConstants';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Controller, useForm} from 'react-hook-form';

const logger = new Logger('ApplicationCreateModal');

const PERSONAL_OPTION_VALUE = '';

interface ApplicationCreateModalProps {
	onCreated: (application: DeveloperApplication) => void;
}

interface CreateFormValues {
	name: string;
	description: string;
	teamId: string;
}

export const ApplicationCreateModal: React.FC<ApplicationCreateModalProps> = observer(({onCreated}) => {
	const {t} = useLingui();
	const sudo = useSudo();
	const currentUserId = UserStore.currentUser?.id;
	const form = useForm<CreateFormValues>({
		defaultValues: {
			name: '',
			description: '',
			teamId: PERSONAL_OPTION_VALUE,
		},
	});
	const nameField = form.register('name', {required: true, maxLength: 100});
	const nameInputRef = useRef<HTMLInputElement | null>(null);
	const [teams, setTeams] = useState<Array<DeveloperTeam>>([]);

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			try {
				const response = await HttpClient.get<Array<DeveloperTeam>>({
					url: Endpoints.TEAMS,
					signal: controller.signal,
				});
				setTeams(response.body);
			} catch (err) {
				if ((err as DOMException).name === 'AbortError') return;
				logger.error('Failed to fetch teams', err);
			}
		})();
		return () => controller.abort();
	}, []);

	// Transferring to a team requires admin rights on the destination.
	const teamOptions = useMemo<Array<SelectOption>>(() => {
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

	const handleCancel = useCallback(() => {
		form.reset();
		form.clearErrors();
		ModalActionCreators.pop();
	}, [form]);

	const onSubmit = useCallback(
		async (data: CreateFormValues) => {
			const description = data.description.trim();
			const response = await HttpClient.post<DeveloperApplication>(Endpoints.OAUTH_APPLICATIONS, {
				name: data.name.trim(),
				description: description.length > 0 ? description : null,
				redirect_uris: [],
			});

			let created = response.body;

			// Creation has no team_id field; ownership starts personal and moves
			// via the transfer endpoint.
			if (data.teamId !== PERSONAL_OPTION_VALUE) {
				try {
					const sudoPayload = await sudo.require();
					const transferred = await HttpClient.patch<DeveloperApplication>(
						Endpoints.OAUTH_APPLICATION_TEAM(created.id),
						{team_id: data.teamId, ...sudoPayload},
					);
					sudo.finalize();
					created = {
						...transferred.body,
						client_secret: created.client_secret,
						bot: created.bot ?? transferred.body.bot,
					};
				} catch (err) {
					logger.error('Failed to transfer new application to team', err);
					ToastActionCreators.createToast({
						type: 'error',
						children: t`Application created, but transferring it to the team failed. You can transfer it from its Team section.`,
					});
				}
			}

			onCreated(created);
			form.reset();
			ModalActionCreators.pop();
		},
		[form, onCreated, sudo, t],
	);

	const {handleSubmit, isSubmitting} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
	});

	return (
		<Modal.Root size="small" centered initialFocusRef={nameInputRef}>
			<Form form={form} onSubmit={handleSubmit}>
				<Modal.Header title={t`Create Application`} />
				<Modal.Content className={styles.createForm}>
					<Input
						type="text"
						label={t`Application Name`}
						{...nameField}
						ref={(el) => {
							nameField.ref(el);
							nameInputRef.current = el;
						}}
						placeholder={t`My Application`}
						maxLength={100}
						required
						disabled={isSubmitting}
						autoFocus
						error={form.formState.errors.name?.message}
					/>
					<Controller
						name="description"
						control={form.control}
						render={({field}) => (
							<Textarea
								ref={field.ref}
								name={field.name}
								onBlur={field.onBlur}
								label={t`Description`}
								value={field.value ?? ''}
								onChange={(event) => field.onChange(event.target.value)}
								placeholder={t`What does your application do?`}
								minRows={2}
								maxRows={4}
								maxLength={APPLICATION_DESCRIPTION_MAX_LENGTH}
								disabled={isSubmitting}
								error={form.formState.errors.description?.message}
							/>
						)}
					/>
					{teamOptions.length > 1 && (
						<Controller
							name="teamId"
							control={form.control}
							render={({field}) => (
								<Select
									label={t`Team`}
									value={field.value}
									options={teamOptions}
									onChange={(value) => field.onChange(value ?? PERSONAL_OPTION_VALUE)}
									disabled={isSubmitting}
								/>
							)}
						/>
					)}
				</Modal.Content>
				<Modal.Footer>
					<Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
						{t`Cancel`}
					</Button>
					<Button type="submit" variant="primary" submitting={isSubmitting}>
						{t`Create`}
					</Button>
				</Modal.Footer>
			</Form>
		</Modal.Root>
	);
});
