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
import {ConfirmModal} from '@app/components/modals/ConfirmModal';
import ApplicationsTabStore from '@app/components/modals/tabs/applications_tab/ApplicationsTabStore';
import styles from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetail.module.css';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {Button} from '@app/components/uikit/button/Button';
import {Endpoints} from '@app/Endpoints';
import {useSudo} from '@app/hooks/useSudo';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {BotToken} from '@app/records/BotTokenRecord';
import * as DateUtils from '@app/utils/DateUtils';
import {Trans, useLingui} from '@lingui/react/macro';
import {CopyIcon, TrashIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const logger = new Logger('BotTokensSection');

interface BotTokensSectionProps {
	applicationId: string;
	canManage: boolean;
	sectionId?: string;
}

export const BotTokensSection: React.FC<BotTokensSectionProps> = observer(({applicationId, canManage, sectionId}) => {
	const {t} = useLingui();
	const store = ApplicationsTabStore;
	const sudo = useSudo();

	const [newTokenName, setNewTokenName] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
	const [mintedToken, setMintedToken] = useState<{name: string; token: string} | null>(null);
	const [mintedTokenCopied, setMintedTokenCopied] = useState(false);

	const tokens = store.getTokensForApp(applicationId);

	useEffect(() => {
		void store.fetchBotTokens(applicationId);
	}, [store, applicationId]);

	const handleCreate = useCallback(async () => {
		const name = newTokenName.trim();
		if (!name || isCreating) return;

		setIsCreating(true);
		try {
			const sudoPayload = await sudo.require();
			const response = await HttpClient.post<BotToken>(Endpoints.OAUTH_APPLICATION_BOT_TOKENS(applicationId), {
				name,
				...sudoPayload,
			});
			sudo.finalize();
			setMintedToken(response.body.token ? {name: response.body.name, token: response.body.token} : null);
			setMintedTokenCopied(false);
			setNewTokenName('');
			ToastActionCreators.createToast({type: 'success', children: t`Bot token created`});
			await store.fetchBotTokens(applicationId);
		} catch (err) {
			logger.error('Failed to create bot token', err);
			ToastActionCreators.createToast({type: 'error', children: t`Failed to create bot token. Please try again.`});
		} finally {
			setIsCreating(false);
		}
	}, [applicationId, isCreating, newTokenName, store, sudo, t]);

	const revokeToken = useCallback(
		async (tokenId: string) => {
			setRevokingTokenId(tokenId);
			try {
				const sudoPayload = await sudo.require();
				await HttpClient.delete({
					url: Endpoints.OAUTH_APPLICATION_BOT_TOKEN(applicationId, tokenId),
					body: sudoPayload,
				});
				sudo.finalize();
				ToastActionCreators.createToast({type: 'success', children: t`Bot token revoked`});
				await store.fetchBotTokens(applicationId);
			} catch (err) {
				logger.error('Failed to revoke bot token', err);
				ToastActionCreators.createToast({type: 'error', children: t`Failed to revoke bot token. Please try again.`});
			} finally {
				setRevokingTokenId(null);
			}
		},
		[applicationId, store, sudo, t],
	);

	const confirmRevoke = useCallback(
		(tokenId: string, tokenName: string) => {
			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Revoke bot token?`}
						description={
							<Trans>
								<strong>{tokenName}</strong> will stop working immediately for API requests. If the bot has a live
								gateway connection opened with this token, it stays connected until it next disconnects — restart
								the bot to drop it sooner.
							</Trans>
						}
						primaryText={t`Revoke`}
						primaryVariant="danger-primary"
						onPrimary={() => revokeToken(tokenId)}
					/>
				)),
			);
		},
		[revokeToken, t],
	);

	const handleCopyMintedToken = useCallback(async () => {
		if (!mintedToken) return;
		try {
			await navigator.clipboard.writeText(mintedToken.token);
			setMintedTokenCopied(true);
			setTimeout(() => setMintedTokenCopied(false), 2000);
		} catch (err) {
			logger.error('Failed to copy token', err);
		}
	}, [mintedToken]);

	return (
		<SectionCard
			id={sectionId}
			title={t`Bot Tokens`}
			subtitle={t`Named credentials for this bot. Each token can be revoked on its own.`}
		>
			<div className={styles.fieldStack}>
				{mintedToken && (
					<div className={styles.mintedTokenBanner}>
						<p className={styles.mintedTokenTitle}>
							<Trans>Copy your new token "{mintedToken.name}" now — you won't see it again.</Trans>
						</p>
						<div className={styles.mintedTokenRow}>
							<code className={styles.mintedTokenValue}>{mintedToken.token}</code>
							<div className={styles.secretActions}>
								<Button
									variant="primary"
									compact
									fitContent
									onClick={handleCopyMintedToken}
									leftIcon={<CopyIcon size={14} />}
								>
									{mintedTokenCopied ? t`Copied` : t`Copy`}
								</Button>
								<Button variant="secondary" compact fitContent onClick={() => setMintedToken(null)}>
									{t`Dismiss`}
								</Button>
							</div>
						</div>
					</div>
				)}

				{store.tokensError ? (
					<div className={styles.tokenErrorRow}>
						<WarningCircleIcon size={18} weight="fill" />
						<span>{store.tokensError}</span>
						<Button variant="secondary" compact fitContent onClick={() => store.fetchBotTokens(applicationId)}>
							{t`Retry`}
						</Button>
					</div>
				) : tokens.length === 0 && !store.isLoadingTokens ? (
					<p className={styles.helperText}>
						<Trans>No tokens yet. Create one to let your bot authenticate.</Trans>
					</p>
				) : (
					<div className={styles.tokenList}>
						{tokens.map((token) => (
							<div key={token.id} className={styles.tokenRow}>
								<div className={styles.tokenInfo}>
									<span className={styles.tokenName}>{token.name}</span>
									<code className={styles.tokenPreview}>{token.preview}…</code>
									<span className={styles.tokenMeta}>
										<Trans>Created {DateUtils.getFormattedShortDate(token.created_at)}</Trans>
										{' · '}
										{token.last_used_at ? (
											<Trans>Last used {DateUtils.getFormattedShortDate(token.last_used_at)}</Trans>
										) : (
											<Trans>Never used</Trans>
										)}
									</span>
								</div>
								{canManage && (
									<Button
										variant="danger-primary"
										compact
										fitContent
										submitting={revokingTokenId === token.id}
										onClick={() => confirmRevoke(token.id, token.name)}
										leftIcon={<TrashIcon size={14} weight="fill" />}
									>
										{t`Revoke`}
									</Button>
								)}
							</div>
						))}
					</div>
				)}

				{canManage && (
					<div className={styles.tokenCreateRow}>
						<Input
							label={t`New token name`}
							value={newTokenName}
							onChange={(e) => setNewTokenName(e.target.value)}
							placeholder={t`e.g. production, ci`}
							maxLength={64}
						/>
						<div className={styles.secretActions}>
							<Button
								variant="primary"
								compact
								fitContent
								submitting={isCreating}
								disabled={!newTokenName.trim()}
								onClick={handleCreate}
							>
								{t`Create token`}
							</Button>
						</div>
					</div>
				)}
			</div>
		</SectionCard>
	);
});
