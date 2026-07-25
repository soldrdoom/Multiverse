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

import {Form} from '@app/components/form/Form';
import {Input} from '@app/components/form/Input';
import * as Modal from '@app/components/modals/Modal';
import styles from '@app/components/modals/SudoVerificationModal.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {Endpoints} from '@app/Endpoints';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import SudoPromptStore, {SudoVerificationMethod} from '@app/stores/SudoPromptStore';
import type {SudoVerificationPayload} from '@app/types/Sudo';
import * as FormUtils from '@app/utils/FormUtils';
import * as WebAuthnUtils from '@app/utils/WebAuthnUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useForm} from 'react-hook-form';

const logger = new Logger('SudoVerificationModal');

interface FormInputs {
	password: string;
	totpCode: string;
	smsCode: string;
}

enum SmsStatus {
	IDLE = 'idle',
	SENDING = 'sending',
	SENT = 'sent',
}

interface SolanaPayload {
	address: string;
	signature: string;
	nonce: string;
	signedMessage?: string;
}

const isMacAppIdentifierError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : '';
	return message.toLowerCase().includes('application identifier');
};

// Prefer window.phantom.solana for Phantom mobile in-app browser; fall back to other known providers,
// then to the Wallet Standard registry to support Jupiter and any other standard-compliant wallet.
// Mirrors the detection in AuthLoginLayout.handleSolanaLogin, since anything that can sign in via
// Solana here must also be usable for sudo re-verification.
const getWalletStandardProvider = (): any => {
	try {
		const registered: any[] = [];
		window.dispatchEvent(
			new CustomEvent('wallet-standard:app-ready', {
				bubbles: false,
				cancelable: false,
				composed: false,
				detail: Object.freeze({register: (w: any) => registered.push(w)}),
			}),
		);
		const wallet =
			registered.find((w) => w.name === 'Jupiter' && w.chains?.some((c: string) => c.startsWith('solana:'))) ??
			registered.find((w) => w.chains?.some((c: string) => c.startsWith('solana:')));
		if (!wallet) return null;

		let account: any = null;
		const provider: any = {
			isConnected: false,
			connect: async () => {
				const {accounts} = await wallet.features['standard:connect'].connect();
				account = accounts[0];
				if (!account) throw new Error('No accounts returned from wallet');
				provider.isConnected = true;
			},
			signMessage: async (messageBytes: Uint8Array) => {
				const [result] = await wallet.features['solana:signMessage'].signMessage({
					account,
					message: messageBytes,
				});
				return {signature: result.signature};
			},
		};
		Object.defineProperty(provider, 'publicKey', {
			get: () => (account ? {toString: () => account.address, toBase58: () => account.address} : null),
		});
		return provider;
	} catch {
		return null;
	}
};

const getSolanaProvider = (): any =>
	(window as any).phantom?.solana ??
	(window as any).solana ??
	(window as any).solflare ??
	(window as any).coinbaseSolana ??
	(window as any).backpack?.solana ??
	(window as any).magicEden?.solana ??
	(window as any).station ??
	getWalletStandardProvider();

const getMethodAvailable = (
	method: SudoVerificationMethod,
	available: {password: boolean; totp: boolean; sms: boolean; webauthn: boolean; solana: boolean},
): boolean => {
	switch (method) {
		case SudoVerificationMethod.PASSWORD:
			return available.password;
		case SudoVerificationMethod.TOTP:
			return available.totp;
		case SudoVerificationMethod.SMS:
			return available.sms;
		case SudoVerificationMethod.WEBAUTHN:
			return available.webauthn;
		case SudoVerificationMethod.SOLANA:
			return available.solana;
		default:
			return false;
	}
};

const getDefaultMethod = (
	available: {password: boolean; totp: boolean; sms: boolean; webauthn: boolean; solana: boolean},
	lastUsed: SudoVerificationPayload['mfa_method'] | null,
): SudoVerificationMethod | null => {
	if (lastUsed && getMethodAvailable(lastUsed as SudoVerificationMethod, available)) {
		return lastUsed as SudoVerificationMethod;
	}

	const preference = [
		SudoVerificationMethod.SOLANA,
		SudoVerificationMethod.WEBAUTHN,
		SudoVerificationMethod.TOTP,
		SudoVerificationMethod.SMS,
		SudoVerificationMethod.PASSWORD,
	];

	return preference.find((method) => getMethodAvailable(method, available)) ?? null;
};

const getDefaultFieldForMethod = (method: SudoVerificationMethod | null): keyof FormInputs => {
	switch (method) {
		case SudoVerificationMethod.TOTP:
			return 'totpCode';
		case SudoVerificationMethod.SMS:
			return 'smsCode';
		case SudoVerificationMethod.WEBAUTHN:
			return 'password';
		case SudoVerificationMethod.SOLANA:
			return 'password';
		default:
			return 'password';
	}
};

const SudoVerificationModal: React.FC = observer(() => {
	const {t, i18n} = useLingui();
	const {isOpen, availableMethods, isLoadingMethods, isVerifying, verificationError, rawError, lastUsedMfaMethod} =
		SudoPromptStore;

	const form = useForm<FormInputs>({
		defaultValues: {password: '', totpCode: '', smsCode: ''},
	});

	const [selectedMethod, setSelectedMethod] = useState<SudoVerificationMethod | null>(null);
	const [smsStatus, setSmsStatus] = useState<SmsStatus>(SmsStatus.IDLE);
	const [webAuthnPayload, setWebAuthnPayload] = useState<{challenge: string; response: unknown} | null>(null);
	const [solanaPayload, setSolanaPayload] = useState<SolanaPayload | null>(null);
	const [solanaError, setSolanaError] = useState<string | null>(null);
	// Guards against double-submission: state updates (e.g. isVerifying flipping back to false on
	// failure) can retrigger these effects while `solanaPayload`/`webAuthnPayload` still hold the
	// same stale object from this render (the `setXPayload(null)` reset elsewhere only takes effect
	// next render), so a plain `!isVerifying` check alone isn't enough to prevent resubmitting it.
	const submittedWebAuthnPayloadRef = useRef<{challenge: string; response: unknown} | null>(null);
	const submittedSolanaPayloadRef = useRef<SolanaPayload | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		setSelectedMethod(null);
		setSmsStatus(SmsStatus.IDLE);
		setWebAuthnPayload(null);
		setSolanaPayload(null);
		setSolanaError(null);
		form.reset({password: '', totpCode: '', smsCode: ''});

		SudoPromptStore.loadAvailableMethods().catch(() => {});
	}, [isOpen, form]);

	useEffect(() => {
		if (isLoadingMethods || !isOpen) return;

		const currentMethodAvailable = selectedMethod !== null && getMethodAvailable(selectedMethod, availableMethods);
		if (currentMethodAvailable) return;

		const next = getDefaultMethod(availableMethods, lastUsedMfaMethod);
		if (next) {
			setSelectedMethod(next);
		}
	}, [isLoadingMethods, isOpen, availableMethods, selectedMethod, lastUsedMfaMethod]);

	useEffect(() => {
		if (!verificationError && !rawError) return;

		if (selectedMethod === SudoVerificationMethod.SOLANA) {
			setSolanaError(verificationError ?? 'Verification failed');
			setSolanaPayload(null);
			return;
		}

		const fallbackField = getDefaultFieldForMethod(selectedMethod);
		if (rawError) {
			FormUtils.handleError(i18n, form, rawError, fallbackField);
			return;
		}

		if (verificationError) {
			form.setError(fallbackField, {type: 'server', message: verificationError});
		}
	}, [form, verificationError, rawError, selectedMethod, i18n]);

	useEffect(() => {
		if (selectedMethod !== SudoVerificationMethod.WEBAUTHN) return;
		if (!webAuthnPayload || isVerifying) return;
		if (submittedWebAuthnPayloadRef.current === webAuthnPayload) return;
		submittedWebAuthnPayloadRef.current = webAuthnPayload;

		SudoPromptStore.submit({
			mfa_method: SudoVerificationMethod.WEBAUTHN,
			webauthn_challenge: webAuthnPayload.challenge,
			webauthn_response: webAuthnPayload.response,
		});
	}, [selectedMethod, webAuthnPayload, isVerifying]);

	useEffect(() => {
		if (selectedMethod !== SudoVerificationMethod.SOLANA) return;
		if (!solanaPayload || isVerifying) return;
		if (submittedSolanaPayloadRef.current === solanaPayload) return;
		submittedSolanaPayloadRef.current = solanaPayload;

		SudoPromptStore.submit({
			solana_address: solanaPayload.address,
			solana_signature: solanaPayload.signature,
			solana_nonce: solanaPayload.nonce,
			solana_signed_message: solanaPayload.signedMessage,
		});
	}, [selectedMethod, solanaPayload, isVerifying]);

	const methodButtons = (Object.values(SudoVerificationMethod) as Array<SudoVerificationMethod>).filter((method) =>
		getMethodAvailable(method, availableMethods),
	);

	const methodLabels = useMemo<Record<SudoVerificationMethod, string>>(
		() => ({
			[SudoVerificationMethod.PASSWORD]: t`Password`,
			[SudoVerificationMethod.TOTP]: t`Authenticator app`,
			[SudoVerificationMethod.SMS]: t`SMS code`,
			[SudoVerificationMethod.WEBAUTHN]: t`Security key / Passkey`,
			[SudoVerificationMethod.SOLANA]: t`Solana wallet`,
		}),
		[t],
	);

	const setFieldError = (message: string) => {
		const fallbackField = getDefaultFieldForMethod(selectedMethod);
		form.setError(fallbackField, {type: 'manual', message});
	};

	const handleSendSms = async () => {
		setSmsStatus(SmsStatus.SENDING);
		form.clearErrors();

		try {
			await HttpClient.post({url: Endpoints.SUDO_SMS_SEND});
			setSmsStatus(SmsStatus.SENT);
		} catch (err) {
			logger.error('Failed to send SMS code', err);
			setSmsStatus(SmsStatus.IDLE);
			setFieldError(t`Failed to send SMS code. Please try again.`);
		}
	};

	const handleWebAuthn = async () => {
		form.clearErrors();

		try {
			await WebAuthnUtils.assertWebAuthnSupported();
		} catch (error) {
			logger.error('WebAuthn unavailable', error);
			setFieldError(t`Passkeys are not available on this device.`);
			return;
		}

		try {
			const optionsResponse = await HttpClient.post<{challenge: string}>({url: Endpoints.SUDO_WEBAUTHN_OPTIONS});
			const credential = await WebAuthnUtils.performAuthentication(optionsResponse.body);
			setWebAuthnPayload({challenge: optionsResponse.body.challenge, response: credential});
		} catch (err) {
			logger.error('WebAuthn verification failed', err);
			if (isMacAppIdentifierError(err)) {
				setFieldError(
					t`Passkeys require a signed macOS bundle with a valid application identifier. Please install the signed desktop client and retry.`,
				);
				return;
			}

			setFieldError(t`Security key verification failed. Please try again.`);
		}
	};

	const handleSolanaSign = async () => {
		setSolanaError(null);
		setSolanaPayload(null);

		const sol = getSolanaProvider();
		if (!sol) {
			setSolanaError(
				t`No Solana wallet detected. Please use Phantom, Solflare, Backpack, Coinbase Wallet, Magic Eden, or Jupiter.`,
			);
			return;
		}

		try {
			if (!sol.isConnected) {
				await sol.connect();
			}

			const address: string = sol.publicKey?.toString();
			if (!address) {
				setSolanaError(t`Could not get wallet address.`);
				return;
			}

			const nonceRes = await HttpClient.post<{nonce: string}>({
				url: Endpoints.SUDO_SOLANA_NONCE,
				body: {address},
			});
			const nonce = nonceRes.body.nonce;

			const message = `Sign in to Multiverse\nNonce: ${nonce}`;
			const messageBytes = new TextEncoder().encode(message);
			const signResult = await sol.signMessage(messageBytes);
			const sigBytes = new Uint8Array(signResult.signature as ArrayLike<number>);
			const signature = btoa(String.fromCharCode(...sigBytes));

			// Wallet Standard wallets report the exact bytes they signed, which may not match
			// `messageBytes` verbatim (e.g. an off-chain-message prefix). Send those back so the
			// server verifies against what was actually signed instead of guessing the framing.
			let signedMessage: string | undefined;
			if (signResult.signedMessage) {
				const signedMessageBytes = new Uint8Array(signResult.signedMessage as ArrayLike<number>);
				signedMessage = btoa(String.fromCharCode(...signedMessageBytes));
			}

			setSolanaPayload({address, signature, nonce, signedMessage});
		} catch (err) {
			logger.error('Solana sudo signing failed', err);
			setSolanaError(t`Wallet signing failed. Please try again.`);
		}
	};

	const handleClose = () => {
		SudoPromptStore.reject(new DOMException('User cancelled verification', 'AbortError'));
	};

	const renderMethodInput = () => {
		switch (selectedMethod) {
			case SudoVerificationMethod.PASSWORD:
				return (
					<Input
						{...form.register('password')}
						label={t`Password`}
						type="password"
						autoFocus
						required
						error={form.formState.errors.password?.message}
					/>
				);
			case SudoVerificationMethod.TOTP:
				return (
					<Input
						{...form.register('totpCode')}
						label={t`Authenticator Code`}
						autoFocus
						autoComplete="one-time-code"
						required
						error={form.formState.errors.totpCode?.message}
					/>
				);
			case SudoVerificationMethod.SMS:
				return (
					<div className={styles.smsSection}>
						<Button
							type="button"
							onClick={handleSendSms}
							disabled={smsStatus === SmsStatus.SENDING}
							variant={smsStatus === SmsStatus.SENT ? 'secondary' : 'primary'}
							fitContainer
						>
							{smsStatus === SmsStatus.SENT ? <Trans>Code sent</Trans> : <Trans>Send SMS code</Trans>}
						</Button>
						{smsStatus === SmsStatus.SENT && (
							<Input
								{...form.register('smsCode')}
								label={t`SMS Code`}
								autoFocus
								autoComplete="one-time-code"
								required
								error={form.formState.errors.smsCode?.message}
							/>
						)}
					</div>
				);
			case SudoVerificationMethod.WEBAUTHN:
				return webAuthnPayload ? (
					<div className={styles.webauthnReady}>
						<Spinner />
						<span className={styles.srOnly}>
							<Trans>Verifying...</Trans>
						</span>
					</div>
				) : (
					<Button type="button" onClick={handleWebAuthn} fitContainer>
						<Trans>Use security key</Trans>
					</Button>
				);
			case SudoVerificationMethod.SOLANA:
				return solanaPayload ? (
					<div className={styles.webauthnReady}>
						<Spinner />
						<span className={styles.srOnly}>
							<Trans>Verifying...</Trans>
						</span>
					</div>
				) : (
					<div>
						<Button type="button" onClick={handleSolanaSign} fitContainer disabled={isVerifying}>
							<Trans>Sign with Solana wallet</Trans>
						</Button>
						{solanaError && <p className={styles.solanaError}>{solanaError}</p>}
					</div>
				);
			default:
				return null;
		}
	};

	const onSubmit = (values: FormInputs) => {
		form.clearErrors();

		if (!selectedMethod) {
			setFieldError(t`Select a verification method.`);
			return;
		}

		let payload: SudoVerificationPayload | null = null;

		switch (selectedMethod) {
			case SudoVerificationMethod.PASSWORD:
				if (!values.password) {
					setFieldError(t`Enter your password.`);
					return;
				}
				payload = {password: values.password};
				break;
			case SudoVerificationMethod.TOTP:
				if (!values.totpCode) {
					setFieldError(t`Enter the code from your authenticator app.`);
					return;
				}
				payload = {mfa_method: SudoVerificationMethod.TOTP, mfa_code: values.totpCode};
				break;
			case SudoVerificationMethod.SMS:
				if (smsStatus !== SmsStatus.SENT) {
					setFieldError(t`Send an SMS code first.`);
					return;
				}
				if (!values.smsCode) {
					setFieldError(t`Enter the SMS code you received.`);
					return;
				}
				payload = {mfa_method: SudoVerificationMethod.SMS, mfa_code: values.smsCode};
				break;
			case SudoVerificationMethod.WEBAUTHN:
				if (!webAuthnPayload) {
					setFieldError(t`Complete the security key prompt first.`);
					return;
				}
				payload = {
					mfa_method: SudoVerificationMethod.WEBAUTHN,
					webauthn_challenge: webAuthnPayload.challenge,
					webauthn_response: webAuthnPayload.response,
				};
				break;
			default:
				payload = null;
		}

		if (payload) {
			SudoPromptStore.submit(payload);
		}
	};

	const shouldShowSubmit =
		selectedMethod !== SudoVerificationMethod.WEBAUTHN &&
		selectedMethod !== SudoVerificationMethod.SOLANA &&
		!(selectedMethod === SudoVerificationMethod.SMS && smsStatus !== SmsStatus.SENT);

	return (
		<Modal.Root size="small" centered onClose={handleClose}>
			<Form form={form} onSubmit={onSubmit} aria-label={t`Verify identity form`}>
				<Modal.Header title={t`Verify Your Identity`} onClose={handleClose} />
				<Modal.Content>
					<div className={styles.container}>
						<p className={styles.description}>
							<Trans>This action requires verification to continue.</Trans>
						</p>

						{isLoadingMethods ? (
							<div className={styles.loading}>
								<Spinner />
								<span className={styles.srOnly}>
									<Trans>Loading verification methods...</Trans>
								</span>
							</div>
						) : (
							<>
								{methodButtons.length > 1 && (
									<div className={styles.methodSelector}>
										{methodButtons.map((method) => (
											<Button
												key={method}
												type="button"
												variant={selectedMethod === method ? 'primary' : 'secondary'}
												onClick={() => {
													setSelectedMethod(method);
													form.clearErrors();
													setSolanaError(null);
													setSolanaPayload(null);
													if (method !== SudoVerificationMethod.SMS) {
														setSmsStatus(SmsStatus.IDLE);
													}
												}}
												compact
											>
												{methodLabels[method]}
											</Button>
										))}
									</div>
								)}
								{renderMethodInput()}
							</>
						)}
					</div>
				</Modal.Content>
				<Modal.Footer>
					<Button type="button" variant="secondary" onClick={handleClose} disabled={isVerifying}>
						<Trans>Cancel</Trans>
					</Button>
					{shouldShowSubmit && (
						<Button type="submit" submitting={isVerifying} disabled={isVerifying}>
							<Trans>Continue</Trans>
						</Button>
					)}
				</Modal.Footer>
			</Form>
		</Modal.Root>
	);
});

export default SudoVerificationModal;
