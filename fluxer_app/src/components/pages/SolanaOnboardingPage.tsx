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

import {AuthRouterLink} from '@app/components/auth/AuthRouterLink';
import FormField from '@app/components/auth/FormField';
import styles from '@app/components/pages/ForgotPasswordPage.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {useMultiverseDocumentTitle} from '@app/hooks/useMultiverseDocumentTitle';
import {useForm} from '@app/hooks/useForm';
import {completeLoginSession} from '@app/viewmodels/auth/AuthFlow';
import {initializeVault} from '@app/services/vault/VaultService';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import VaultStore from '@app/stores/VaultStore';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useEffect, useId, useState} from 'react';

type Step = 'details' | 'verify-email';

const SolanaOnboardingPage = observer(function SolanaOnboardingPage() {
	const {t} = useLingui();
	const usernameId = useId();
	const emailId = useId();
	const codeId = useId();

	const [tempToken, setTempToken] = useState<string | null>(null);
	const [tokenMissing, setTokenMissing] = useState(false);
	const [step, setStep] = useState<Step>('details');
	const [pendingToken, setPendingToken] = useState<string | null>(null);
	const [maskedEmail, setMaskedEmail] = useState('');

	useMultiverseDocumentTitle(t`Create your account`);

	useEffect(() => {
		const token = sessionStorage.getItem('solana_temp_token');
		if (!token) {
			setTokenMissing(true);
		} else {
			setTempToken(token);
		}
	}, []);

	// Step 1: username + email
	const detailsForm = useForm({
		initialValues: {username: '', email: ''},
		onSubmit: async (values) => {
			if (!tempToken) return;
			const res = await fetch('/api/auth/solana/finalize', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					tempToken,
					username: values.username.trim(),
					email: values.email.trim(),
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				const msg = data.error ?? 'Something went wrong';
				if (msg.toLowerCase().includes('email')) {
					detailsForm.setErrors({email: msg});
				} else {
					detailsForm.setErrors({username: msg});
				}
				return;
			}
			sessionStorage.removeItem('solana_temp_token');
			setPendingToken(data.pendingToken);
			setMaskedEmail(data.email);
			setStep('verify-email');
		},
	});

	// Step 2: email verification code
	const codeForm = useForm({
		initialValues: {code: ''},
		onSubmit: async (values) => {
			if (!pendingToken) return;
			const res = await fetch('/api/auth/solana/verify-email', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({pendingToken, code: values.code.trim()}),
			});
			const data = await res.json();
			if (!res.ok) {
				codeForm.setErrors({code: data.error ?? 'Verification failed'});
				return;
			}

			await completeLoginSession({token: data.token, userId: data.user_id});

			// Initialize E2EE vault — wallet is still connected from the sign-in step.
			const sol = (window as any).phantom?.solana ?? (window as any).solana;
			if (sol?.isConnected) {
				// SIWS talks to the injected provider directly and never otherwise touches
				// SolanaWalletStore — sync it now so UI that reads "wallet connected" state
				// from it (e.g. the Web3 & Identity side menu) reflects the new session.
				const connectedAddress: string | undefined = sol.publicKey?.toBase58?.();
				if (connectedAddress) SolanaWalletStore.setConnectedAddress(connectedAddress);

				const signFn = async (messageBytes: Uint8Array) => {
					const sig = await sol.signMessage(messageBytes);
					return {signature: new Uint8Array(sig.signature as ArrayLike<number>)};
				};
				const derived = await initializeVault(data.user_id, signFn).catch(() => null);
				if (derived) VaultStore.setKeyPair(derived);
			}
		},
	});

	if (tokenMissing) {
		return (
			<div className={styles.container}>
				<h1 className={styles.title}>
					<Trans>Session expired</Trans>
				</h1>
				<p className={styles.description}>
					<Trans>Your sign-in session has expired. Please try again.</Trans>
				</p>
				<div className={styles.footer}>
					<AuthRouterLink to="/login" className={styles.primaryLink}>
						<Trans>Back to login</Trans>
					</AuthRouterLink>
				</div>
			</div>
		);
	}

	if (step === 'verify-email') {
		return (
			<>
				<h1 className={styles.title}>
					<Trans>Verify your email</Trans>
				</h1>

				<p className={styles.description}>
					<Trans>
						We sent a 6-digit code to <strong>{maskedEmail}</strong>. Enter it below to activate your account.
					</Trans>
				</p>

				<form className={styles.form} onSubmit={codeForm.handleSubmit}>
					<FormField
						id={codeId}
						name="code"
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						required
						label={t`Verification code`}
						value={codeForm.getValue('code')}
						onChange={(value) => codeForm.setValue('code', value)}
						error={codeForm.getError('code')}
					/>

					<Button type="submit" fitContainer disabled={codeForm.isSubmitting}>
						<Trans>Verify and continue</Trans>
					</Button>
				</form>

				<div className={styles.footer}>
					<AuthRouterLink to="/login" className={styles.link}>
						<Trans>Back to login</Trans>
					</AuthRouterLink>
				</div>
			</>
		);
	}

	return (
		<>
			<h1 className={styles.title}>
				<Trans>Create your Multiverse account</Trans>
			</h1>

			<p className={styles.description}>
				<Trans>Choose a username and enter your email to complete setup.</Trans>
			</p>

			<form className={styles.form} onSubmit={detailsForm.handleSubmit}>
				<FormField
					id={usernameId}
					name="username"
					type="text"
					autoComplete="username"
					required
					label={t`Username`}
					value={detailsForm.getValue('username')}
					onChange={(value) => detailsForm.setValue('username', value)}
					error={detailsForm.getError('username')}
				/>

				<FormField
					id={emailId}
					name="email"
					type="email"
					autoComplete="email"
					required
					label={t`Email`}
					value={detailsForm.getValue('email')}
					onChange={(value) => detailsForm.setValue('email', value)}
					error={detailsForm.getError('email')}
				/>

				<Button type="submit" fitContainer disabled={detailsForm.isSubmitting}>
					<Trans>Continue</Trans>
				</Button>
			</form>

			<div className={styles.footer}>
				<AuthRouterLink to="/login" className={styles.link}>
					<Trans>Back to login</Trans>
				</AuthRouterLink>
			</div>
		</>
	);
});

export default SolanaOnboardingPage;
