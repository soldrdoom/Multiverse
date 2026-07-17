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

import {
	SettingsTabContainer,
	SettingsTabContent,
	SettingsTabHeader,
} from '@app/components/modals/shared/SettingsTabLayout';
import styles from '@app/components/modals/tabs/VaultTab.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {Spinner} from '@app/components/uikit/Spinner';
import {useVault} from '@app/hooks/useVault';
import {Trans} from '@lingui/react/macro';
import {CheckCircleIcon, LockKeyIcon, ShieldWarningIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const VaultTab: React.FC<Record<string, unknown>> = observer(() => {
	const {status, error, unlock} = useVault();

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={<Trans>Identity Vault</Trans>}
				description={
					<Trans>
						Your Identity Vault derives an end-to-end encryption keypair from your wallet. All direct
						messages on Multiverse are encrypted by default — this is set up automatically when you sign in.
					</Trans>
				}
			/>
			<SettingsTabContent>
				<div className={styles.vaultCard}>
					<div className={styles.vaultCardIcon}>
						{status === 'idle' && <LockKeyIcon size={32} weight="duotone" className={styles.iconInactive} />}
						{status === 'pending' && <Spinner />}
						{status === 'unlocked' && <CheckCircleIcon size={32} weight="duotone" className={styles.iconActive} />}
						{status === 'error' && <ShieldWarningIcon size={32} weight="duotone" className={styles.iconError} />}
					</div>

					<div className={styles.vaultCardBody}>
						{status === 'idle' && (
							<>
								<p className={styles.statusLabel}>
									<Trans>Vault not initialized</Trans>
								</p>
								<p className={styles.statusDescription}>
									<Trans>
										Link a Solana wallet to set up end-to-end encryption for your direct messages.
										Your encryption key is derived from your wallet — the same key works on any
										device where you sign in with the same wallet.
									</Trans>
								</p>
								<Button onClick={unlock} variant="primary">
									<Trans>Link Wallet &amp; Enable E2EE</Trans>
								</Button>
							</>
						)}

						{status === 'pending' && (
							<p className={styles.statusLabel}>
								<Trans>Setting up encryption — approve the signature in your wallet…</Trans>
							</p>
						)}

						{status === 'unlocked' && (
							<>
								<p className={styles.statusLabel}>
									<Trans>End-to-end encryption active</Trans>
								</p>
								<p className={styles.statusDescription}>
									<Trans>
										Your keypair is active. All direct messages are encrypted end-to-end — only you
										and your recipient can read them.
									</Trans>
								</p>
							</>
						)}

						{status === 'error' && (
							<>
								<p className={styles.statusLabel}>
									<Trans>Vault setup failed</Trans>
								</p>
								{error && (
									<p className={styles.errorMessage}>
										{error}
									</p>
								)}
								<p className={styles.statusDescription}>
									<Trans>
										Direct messages cannot be sent until end-to-end encryption is set up. Please
										reconnect your wallet and try again.
									</Trans>
								</p>
								<Button onClick={unlock} variant="danger-primary">
									<Trans>Retry</Trans>
								</Button>
							</>
						)}
					</div>
				</div>

				<div className={styles.infoSection}>
					<h3 className={styles.infoTitle}>
						<Trans>How it works</Trans>
					</h3>
					<ol className={styles.infoList}>
						<li>
							<Trans>Your wallet signs a unique challenge string that identifies your account.</Trans>
						</li>
						<li>
							<Trans>The signature is hashed locally to derive a deterministic X25519 keypair.</Trans>
						</li>
						<li>
							<Trans>Your public key is registered with Multiverse so others can encrypt messages to you.</Trans>
						</li>
						<li>
							<Trans>
								Your private key is encrypted with AES-256-GCM and stored locally in an isolated IndexedDB
								store. It is never transmitted.
							</Trans>
						</li>
					</ol>
				</div>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default VaultTab;
