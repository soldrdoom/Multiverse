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
import {initializeVault, loadPrivateKey} from '@app/services/vault/VaultService';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import VaultStore from '@app/stores/VaultStore';
import {AccountSelector} from '@app/components/accounts/AccountSelector';
import {AuthRouterLink} from '@app/components/auth/AuthRouterLink';
import AuthLoginEmailPasswordForm from '@app/components/auth/auth_login_core/AuthLoginEmailPasswordForm';
import AuthLoginPasskeyActions, {AuthLoginDivider} from '@app/components/auth/auth_login_core/AuthLoginPasskeyActions';
import {useDesktopHandoffFlow} from '@app/components/auth/auth_login_core/useDesktopHandoffFlow';
import DesktopHandoffAccountSelector from '@app/components/auth/DesktopHandoffAccountSelector';
import {HandoffCodeDisplay} from '@app/components/auth/HandoffCodeDisplay';
import IpAuthorizationScreen from '@app/components/auth/IpAuthorizationScreen';
import styles from '@app/components/pages/LoginPage.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {useLoginFormController} from '@app/hooks/useLoginFlow';
import {IS_DEV} from '@app/lib/Env';
import {type Account, SessionExpiredError} from '@app/lib/SessionManager';
import AccountManager from '@app/stores/AccountManager';
import RuntimeConfigStore from '@app/stores/RuntimeConfigStore';
import {isDesktop} from '@app/utils/NativeUtils';
import {Routes} from '@app/Routes';
import * as RouterUtils from '@app/utils/RouterUtils';
import {type IpAuthorizationChallenge, type LoginSuccessPayload, startSsoLogin} from '@app/viewmodels/auth/AuthFlow';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {type ReactElement, type ReactNode, useCallback, useEffect, useState} from 'react';

interface AuthLoginLayoutProps {
	redirectPath?: string;
	inviteCode?: string;
	desktopHandoff?: boolean;
	excludeCurrentUser?: boolean;
	extraTopContent?: ReactNode;
	showTitle?: boolean;
	title?: ReactNode;
	registerLink: ReactElement<Record<string, unknown>>;
	onLoginComplete?: (payload: LoginSuccessPayload) => Promise<void> | void;
	initialEmail?: string;
}

export const AuthLoginLayout = observer(function AuthLoginLayout({
	redirectPath,
	inviteCode,
	desktopHandoff = false,
	excludeCurrentUser = false,
	extraTopContent,
	showTitle = true,
	title,
	onLoginComplete,
	initialEmail,
}: AuthLoginLayoutProps) {
	const {t} = useLingui();
	const currentUserId = AccountManager.currentUserId;
	const accounts = AccountManager.orderedAccounts;
	const hasStoredAccounts = accounts.length > 0;
	const ssoConfig = RuntimeConfigStore.sso;
	const isSsoEnforced = Boolean(ssoConfig?.enforced);
	const ssoDisplayName = ssoConfig?.display_name ?? 'Single Sign-On';
	const [isStartingSso, setIsStartingSso] = useState(false);

	const handoffAccounts =
		desktopHandoff && excludeCurrentUser ? accounts.filter((a) => a.userId !== currentUserId) : accounts;
	const hasHandoffAccounts = handoffAccounts.length > 0;

	const handoff = useDesktopHandoffFlow({
		enabled: desktopHandoff,
		hasStoredAccounts: hasHandoffAccounts,
		initialMode: desktopHandoff && hasHandoffAccounts ? 'selecting' : 'login',
	});

	const [ipAuthChallenge, setIpAuthChallenge] = useState<IpAuthorizationChallenge | null>(null);
	const [showAccountSelector, setShowAccountSelector] = useState(!desktopHandoff && hasStoredAccounts && !initialEmail);
	const [isSwitching, setIsSwitching] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);
	const [prefillEmail, setPrefillEmail] = useState<string | null>(() => initialEmail ?? null);

	const showLoginFormForAccount = useCallback((account: Account, message?: string | null) => {
		setShowAccountSelector(false);
		setSwitchError(message ?? null);
		setPrefillEmail(account.userData?.email ?? null);
	}, []);

	const handleLoginSuccess = useCallback(
		async ({token, userId}: LoginSuccessPayload) => {
			if (desktopHandoff) {
				await handoff.start({token, userId});
				return;
			}
			await AuthenticationActionCreators.completeLogin({token, userId});
			await onLoginComplete?.({token, userId});
		},
		[desktopHandoff, handoff, onLoginComplete],
	);

	const {form, isLoading, fieldErrors, handlePasskeyLogin, handlePasskeyBrowserLogin, isPasskeyLoading} =
		useLoginFormController({
			redirectPath,
			inviteCode,
			onLoginSuccess: handleLoginSuccess,
			onRequireMfa: (challenge) => {
				AuthenticationActionCreators.setMfaTicket(challenge);
			},
			onRequireIpAuthorization: (challenge) => {
				setIpAuthChallenge(challenge);
			},
		});

	const showBrowserPasskey = IS_DEV || isDesktop();
	const passkeyControlsDisabled = isLoading || Boolean(form.isSubmitting) || isPasskeyLoading;

	const handleIpAuthorizationComplete = useCallback(
		async ({token, userId}: LoginSuccessPayload) => {
			await handleLoginSuccess({token, userId});
			if (redirectPath) {
				RouterUtils.replaceWith(redirectPath);
			}
			setIpAuthChallenge(null);
		},
		[handleLoginSuccess, redirectPath],
	);

	useEffect(() => {
		setPrefillEmail(initialEmail ?? null);
		if (initialEmail) {
			setShowAccountSelector(false);
		}
	}, [initialEmail]);

	useEffect(() => {
		if (prefillEmail !== null) {
			form.setValue('email', prefillEmail);
		}
	}, [form, prefillEmail]);

	const handleSelectExistingAccount = useCallback(
		async (account: Account) => {
			const identifier = account.userData?.email ?? account.userData?.username ?? account.userId;
			const expiredMessage = t`Session expired for ${identifier}. Please log in again.`;

			if (account.isValid === false || !AccountManager.canSwitchAccounts) {
				showLoginFormForAccount(account, expiredMessage);
				return;
			}

			setIsSwitching(true);
			setSwitchError(null);
			try {
				await AccountManager.switchToAccount(account.userId);
			} catch (error) {
				const updatedAccount = AccountManager.accounts.get(account.userId);
				if (error instanceof SessionExpiredError || updatedAccount?.isValid === false) {
					showLoginFormForAccount(updatedAccount ?? account, expiredMessage);
					return;
				}

				setSwitchError(error instanceof Error ? error.message : t`Failed to switch account`);
			} finally {
				setIsSwitching(false);
			}
		},
		[showLoginFormForAccount],
	);

	const handleAddAnotherAccount = useCallback(() => {
		setShowAccountSelector(false);
		setSwitchError(null);
		setPrefillEmail(null);
	}, []);

	const handleStartSso = useCallback(async () => {
		if (!ssoConfig?.enabled) return;
		try {
			setIsStartingSso(true);
			const {authorizationUrl} = await startSsoLogin({
				redirectTo: redirectPath,
			});
			window.location.assign(authorizationUrl);
		} catch (error) {
			setSwitchError(error instanceof Error ? error.message : t`Failed to start SSO`);
		} finally {
			setIsStartingSso(false);
		}
	}, [ssoConfig?.enabled, redirectPath, t]);

	const [isSolanaLoading, setIsSolanaLoading] = useState(false);

	const handleSolanaLogin = useCallback(async () => {
		// Prefer window.phantom.solana for Phantom mobile in-app browser; fall back to other known providers.
		// Final fallback uses the Wallet Standard registry to support Jupiter and any other standard-compliant wallet.
		const getWalletStandardProvider = (): any => {
			try {
				const registered: any[] = [];
				// Apps dispatch wallet-standard:app-ready; wallets that are already initialized respond by calling register()
				window.dispatchEvent(
					new CustomEvent('wallet-standard:app-ready', {
						bubbles: false,
						cancelable: false,
						composed: false,
						detail: Object.freeze({ register: (w: any) => registered.push(w) }),
					})
				);
				// Prefer Jupiter by name; fall back to the first registered Solana wallet
				const wallet =
					registered.find(w => w.name === 'Jupiter' && w.chains?.some((c: string) => c.startsWith('solana:'))) ??
					registered.find(w => w.chains?.some((c: string) => c.startsWith('solana:')));
				if (!wallet) return null;

				let account: any = null;
				const provider: any = {
					connect: async () => {
						const { accounts } = await wallet.features['standard:connect'].connect();
						account = accounts[0];
						if (!account) throw new Error('No accounts returned from wallet');
					},
					signIn: wallet.features['standard:signIn']
						? async (input: any) => {
							const [result] = await wallet.features['standard:signIn'].signIn(input);
							return result;
						}
						: undefined,
					signMessage: async (messageBytes: Uint8Array) => {
						const [result] = await wallet.features['solana:signMessage'].signMessage({
							account,
							message: messageBytes,
						});
						// signedMessage contains the exact bytes the wallet signed (may include prefix)
						return { signature: result.signature, signedMessage: result.signedMessage };
					},
				};
				Object.defineProperty(provider, 'publicKey', {
					get: () => account ? { toBase58: () => account.address } : null,
				});
				return provider;
			} catch {
				return null;
			}
		};

		const sol =
			(window as any).phantom?.solana ??
			(window as any).solana ??
			(window as any).solflare ??
			(window as any).coinbaseSolana ??
			(window as any).backpack?.solana ??
			(window as any).magicEden?.solana ??
			(window as any).station ??         // Jupiter Station mobile in-app browser
			getWalletStandardProvider();
		if (!sol) {
			setSwitchError(t`No Solana wallet detected. Please use Phantom, Solflare, Backpack, Coinbase Wallet, Magic Eden, or Jupiter, or open this page inside one of those apps.`);
			return;
		}
		setIsSolanaLoading(true);
		setSwitchError(null);

		// Safe Uint8Array → base64: avoids spread-operator call-stack limits on mobile WebKit
		const u8ToBase64 = (bytes: Uint8Array): string => {
			let binary = '';
			const len = bytes.length;
			for (let i = 0; i < len; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			return btoa(binary);
		};

		try {
			await sol.connect();
			const address: string = sol.publicKey.toBase58();
			const nonceRes = await fetch('/api/auth/solana/nonce', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({address}),
			});
			const {nonce, message} = await nonceRes.json();

			let sig64: string;
			let signedMessageB64: string | undefined;

			if (typeof sol.signIn === 'function') {
				// Modern wallet-standard path: wallet constructs canonical SIWS, shows our icon
				const signInInput = {
					domain: window.location.host,
					address,
					statement: 'Sign in to Multiverse',
					uri: window.location.origin,
					version: '1',
					nonce,
					issuedAt: new Date().toISOString(),
					icon: 'https://multiverse.forum/web/logo.png',
				};
				const result = await sol.signIn(signInInput);
				// Normalize to plain Uint8Array — Phantom mobile may return array-like objects across the JS bridge
				sig64 = u8ToBase64(new Uint8Array(result.signature as ArrayLike<number>));
				signedMessageB64 = u8ToBase64(new Uint8Array(result.signedMessage as ArrayLike<number>));
			} else {
				// Legacy signMessage() fallback — sign the SIWS text the backend built.
				// Do NOT pass the 'utf8' display hint: on Phantom mobile it can alter how bytes
				// are presented/signed, causing backend verification to fail.
				const msgBytes = new Uint8Array(new TextEncoder().encode(message));
				const result = await sol.signMessage(msgBytes);
				sig64 = u8ToBase64(new Uint8Array(result.signature as ArrayLike<number>));
				// Wallet Standard wallets return signedMessage = exact bytes signed (may include prefix).
				// Pass it to the backend so verification uses what was actually signed.
				if (result.signedMessage) {
					signedMessageB64 = u8ToBase64(new Uint8Array(result.signedMessage as ArrayLike<number>));
				}
			}

			const verifyRes = await fetch('/api/auth/solana/verify', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({address, signature: sig64, nonce, signedMessage: signedMessageB64}),
			});
			const result = await verifyRes.json();
			if (!verifyRes.ok) throw new Error(result.error ?? 'Verification failed');
			if (result.needsOnboarding) {
				// Store sol reference for vault init after onboarding completes.
				sessionStorage.setItem('solana_temp_token', result.tempToken);
				RouterUtils.replaceWith(Routes.SOLANA_ONBOARDING);
				return;
			}
			await handleLoginSuccess({token: result.token, userId: result.user_id});

			// Reflect the now-authenticated wallet in the reactive wallet store so UI that
			// derives "connected wallet" state from it (e.g. the Web3 & Identity side menu)
			// picks it up immediately — SIWS itself talks to the injected provider directly
			// and never otherwise touches this store.
			SolanaWalletStore.setConnectedAddress(address);

			// Derive the E2EE vault key from the wallet — deterministic, cross-device.
			// Skip if already initialized on this device (IDB has the key).
			const userId = result.user_id;
			const existingKey = await loadPrivateKey(userId).catch(() => null);
			if (!existingKey) {
				const signFn = async (messageBytes: Uint8Array) => {
					const sig = await sol.signMessage(messageBytes);
					return {signature: new Uint8Array(sig.signature as ArrayLike<number>)};
				};
				const derived = await initializeVault(userId, signFn);
				VaultStore.setKeyPair(derived);
			}
		} catch (error) {
			setSwitchError(error instanceof Error ? error.message : t`Solana login failed`);
		} finally {
			setIsSolanaLoading(false);
		}
	}, [handleLoginSuccess, t]);

	if (desktopHandoff && handoff.mode === 'selecting') {
		return (
			<DesktopHandoffAccountSelector
				excludeCurrentUser={excludeCurrentUser}
				onSelectNewAccount={handoff.switchToLogin}
			/>
		);
	}

	if (isSsoEnforced) {
		return (
			<div className={styles.loginContainer}>
				<h1 className={styles.title}>{ssoDisplayName}</h1>
				<p className={styles.ssoSubtitle}>
					<Trans>Sign in with your organization's single sign-on provider.</Trans>
				</p>
				<Button fitContainer onClick={handleStartSso} submitting={isStartingSso} type="button">
					<Trans>Continue with SSO</Trans>
				</Button>
				{switchError && <div className={styles.loginNotice}>{switchError}</div>}
			</div>
		);
	}

	if (showAccountSelector && hasStoredAccounts && !desktopHandoff) {
		return (
			<AccountSelector
				accounts={accounts}
				currentAccountId={currentUserId}
				error={switchError}
				disabled={isSwitching}
				showInstance
				clickableRows
				onSelectAccount={handleSelectExistingAccount}
				onAddAccount={handleAddAnotherAccount}
			/>
		);
	}

	if (desktopHandoff && (handoff.mode === 'generating' || handoff.mode === 'displaying' || handoff.mode === 'error')) {
		return (
			<HandoffCodeDisplay
				code={handoff.code}
				isGenerating={handoff.mode === 'generating'}
				error={handoff.mode === 'error' ? handoff.error : null}
				onRetry={handoff.retry}
			/>
		);
	}

	if (ipAuthChallenge) {
		return (
			<IpAuthorizationScreen
				challenge={ipAuthChallenge}
				onAuthorized={handleIpAuthorizationComplete}
				onBack={() => setIpAuthChallenge(null)}
			/>
		);
	}

	return (
		<>
			{extraTopContent}

			{showTitle ? <h1 className={styles.title}>{title ?? <Trans>Welcome back</Trans>}</h1> : null}

			{!showAccountSelector && switchError ? <div className={styles.loginNotice}>{switchError}</div> : null}

			{ssoConfig?.enabled ? (
				<div className={styles.ssoBlock}>
					<Button fitContainer onClick={handleStartSso} submitting={isStartingSso} type="button">
						<Trans>Continue with SSO</Trans>
					</Button>
					<div className={styles.ssoSubtitle}>
						{ssoConfig.enforced ? (
							<Trans>SSO is required to access this workspace.</Trans>
						) : (
							<Trans>Prefer using SSO? Continue with {ssoDisplayName}.</Trans>
						)}
					</div>
				</div>
			) : null}

			<div className={styles.solanaButtonWrapper}>
			<Button fitContainer onClick={handleSolanaLogin} submitting={isSolanaLoading} type="button">
				<Trans>Sign In with Solana</Trans>
			</Button>
			</div>

			{IS_DEV ? (
				<>
					<AuthLoginEmailPasswordForm
						form={form}
						isLoading={isLoading}
						fieldErrors={fieldErrors}
						submitLabel={<Trans>Log in</Trans>}
						classes={{form: styles.form}}
						linksWrapperClassName={styles.formLinks}
						links={
							<AuthRouterLink to="/forgot" className={styles.link}>
								<Trans>Forgot your password?</Trans>
							</AuthRouterLink>
						}
						disableSubmit={isPasskeyLoading}
					/>

					<AuthLoginDivider
						classes={{
							divider: styles.divider,
							dividerLine: styles.dividerLine,
							dividerText: styles.dividerText,
						}}
					/>

					<AuthLoginPasskeyActions
						classes={{
							wrapper: styles.passkeyActions,
						}}
						disabled={passkeyControlsDisabled}
						onPasskeyLogin={handlePasskeyLogin}
						showBrowserOption={showBrowserPasskey}
						onBrowserLogin={handlePasskeyBrowserLogin}
						browserLabel={<Trans>Log in via browser</Trans>}
					/>
				</>
			) : null}
		</>
	);
});
