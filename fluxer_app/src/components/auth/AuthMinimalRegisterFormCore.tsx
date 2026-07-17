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

import * as AuthenticationActionCreators from '@app/actions/AuthenticationActionCreators';
import styles from '@app/components/auth/AuthPageStyles.module.css';
import FormField from '@app/components/auth/FormField';
import {type MissingField, SubmitTooltip, shouldDisableSubmit} from '@app/components/auth/SubmitTooltip';
import {ExternalLink} from '@app/components/common/ExternalLink';
import {Button} from '@app/components/uikit/button/Button';
import {Checkbox} from '@app/components/uikit/checkbox/Checkbox';
import {
	type AuthRegisterFormDraft,
	EMPTY_AUTH_REGISTER_FORM_DRAFT,
	useAuthRegisterDraftContext,
} from '@app/contexts/AuthRegisterDraftContext';
import {useAuthForm} from '@app/hooks/useAuthForm';
import {useLocation} from '@app/lib/router/React';
import {Routes} from '@app/Routes';
import {Trans, useLingui} from '@lingui/react/macro';
import {useCallback, useId, useMemo, useRef, useState} from 'react';

interface AuthMinimalRegisterFormCoreProps {
	submitLabel: React.ReactNode;
	redirectPath: string;
	onRegister?: (response: {token: string; user_id: string}) => Promise<void>;
	inviteCode?: string;
	extraContent?: React.ReactNode;
}

export function AuthMinimalRegisterFormCore({
	submitLabel,
	redirectPath,
	onRegister,
	inviteCode,
	extraContent,
}: AuthMinimalRegisterFormCoreProps) {
	const {t} = useLingui();
	const location = useLocation();
	const draftKey = `register:${location.pathname}${location.search}`;
	const {getRegisterFormDraft, setRegisterFormDraft, clearRegisterFormDraft} = useAuthRegisterDraftContext();

	const globalNameId = useId();
	const usernameId = useId();
	const emailId = useId();
	const passwordId = useId();

	const initialDraft = useMemo<AuthRegisterFormDraft>(() => {
		const persistedDraft = getRegisterFormDraft(draftKey);
		if (!persistedDraft) {
			return EMPTY_AUTH_REGISTER_FORM_DRAFT;
		}
		return {
			...persistedDraft,
			formValues: {...persistedDraft.formValues},
		};
	}, [draftKey, getRegisterFormDraft]);
	const draftRef = useRef<AuthRegisterFormDraft>({
		...initialDraft,
		formValues: {...initialDraft.formValues},
	});

	const [consent, setConsentState] = useState(initialDraft.consent);

	const initialValues: Record<string, string> = {
		global_name: initialDraft.formValues.global_name ?? '',
		username: initialDraft.formValues.username ?? '',
		email: initialDraft.formValues.email ?? '',
		password: initialDraft.formValues.password ?? '',
	};

	const persistDraft = useCallback(
		(partialDraft: Partial<AuthRegisterFormDraft>) => {
			const currentDraft = draftRef.current;
			const nextDraft: AuthRegisterFormDraft = {
				...currentDraft,
				...partialDraft,
				formValues: partialDraft.formValues ? {...partialDraft.formValues} : currentDraft.formValues,
			};
			draftRef.current = nextDraft;
			setRegisterFormDraft(draftKey, nextDraft);
		},
		[draftKey, setRegisterFormDraft],
	);

	const handleConsentChange = useCallback(
		(nextConsent: boolean) => {
			setConsentState(nextConsent);
			persistDraft({consent: nextConsent});
		},
		[persistDraft],
	);

	const handleRegisterSubmit = async (values: Record<string, string>) => {
		const response = await AuthenticationActionCreators.register({
			global_name: values.global_name || undefined,
			username: values.username || undefined,
			email: values.email,
			password: values.password,
			consent,
			invite_code: inviteCode,
		});

		if (onRegister) {
			await onRegister(response);
		} else {
			await AuthenticationActionCreators.completeLogin({
				token: response.token,
				userId: response.user_id,
			});
		}
		clearRegisterFormDraft(draftKey);
	};

	const {form, isLoading, fieldErrors} = useAuthForm({
		initialValues,
		onSubmit: handleRegisterSubmit,
		redirectPath,
		firstFieldName: 'global_name',
	});

	const setDraftedFormValue = useCallback(
		(fieldName: string, value: string) => {
			form.setValue(fieldName, value);
			const nextFormValues = {
				...draftRef.current.formValues,
				[fieldName]: value,
			};
			persistDraft({formValues: nextFormValues});
		},
		[form, persistDraft],
	);

	const missingFields = useMemo(() => {
		const missing: Array<MissingField> = [];
		if (!form.getValue('global_name')) {
			missing.push({key: 'global_name', label: t`Display Name`});
		}
		if (!form.getValue('username')) {
			missing.push({key: 'username', label: t`Username`});
		}
		if (!form.getValue('email')) {
			missing.push({key: 'email', label: t`Email`});
		}
		if (!form.getValue('password')) {
			missing.push({key: 'password', label: t`Password`});
		}
		return missing;
	}, [form, t]);

	return (
		<form className={styles.form} onSubmit={form.handleSubmit}>
			<FormField
				id={globalNameId}
				name="global_name"
				type="text"
				required
				label={t`Display Name`}
				placeholder={t`What should people call you?`}
				value={form.getValue('global_name')}
				onChange={(value) => setDraftedFormValue('global_name', value)}
				error={form.getError('global_name') || fieldErrors?.global_name}
			/>

			<FormField
				id={usernameId}
				name="username"
				type="text"
				autoComplete="username"
				required
				label={t`Username`}
				value={form.getValue('username')}
				onChange={(value) => setDraftedFormValue('username', value)}
				error={form.getError('username') || fieldErrors?.username}
			/>

			<FormField
				id={emailId}
				name="email"
				type="email"
				autoComplete="email"
				required
				label={t`Email`}
				value={form.getValue('email')}
				onChange={(value) => setDraftedFormValue('email', value)}
				error={form.getError('email') || fieldErrors?.email}
			/>

			<FormField
				id={passwordId}
				name="password"
				type="password"
				autoComplete="new-password"
				required
				label={t`Password`}
				value={form.getValue('password')}
				onChange={(value) => setDraftedFormValue('password', value)}
				error={form.getError('password') || fieldErrors?.password}
			/>

			{extraContent}

			<div className={styles.consentRow}>
				<Checkbox checked={consent} onChange={handleConsentChange}>
					<span className={styles.consentLabel}>
						<Trans>I agree to the</Trans>{' '}
						<ExternalLink href={Routes.terms()} className={styles.policyLink}>
							<Trans>Terms of Service</Trans>
						</ExternalLink>{' '}
						<Trans>and</Trans>{' '}
						<ExternalLink href={Routes.privacy()} className={styles.policyLink}>
							<Trans>Privacy Policy</Trans>
						</ExternalLink>
					</span>
				</Checkbox>
			</div>

			<SubmitTooltip consent={consent} missingFields={missingFields}>
				<Button
					type="submit"
					fitContainer
					disabled={isLoading || form.isSubmitting || shouldDisableSubmit(consent, missingFields)}
				>
					{submitLabel}
				</Button>
			</SubmitTooltip>
		</form>
	);
}
