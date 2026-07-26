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
import {Input} from '@app/components/form/Input';
import styles from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetail.module.css';
import {
	BOT_INVITE_SCOPES,
	buildAuthorizeUrl,
} from '@app/components/modals/tabs/applications_tab/application_detail/AuthorizeUrlUtils';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {Button} from '@app/components/uikit/button/Button';
import {Logger} from '@app/lib/Logger';
import {Trans, useLingui} from '@lingui/react/macro';
import {CopyIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useCallback, useId, useMemo, useState} from 'react';

const logger = new Logger('BotInviteSection');

interface BotInviteSectionProps {
	applicationId: string;
	/** `bot_public` — when false, only people with access to the application may use the link. */
	botIsPublic: boolean;
	/** `bot_require_code_grant` — when true, a bot-scope-only URL is rejected without a redirect URI. */
	botRequireCodeGrant: boolean;
	sectionId?: string;
}

export const BotInviteSection: React.FC<BotInviteSectionProps> = ({
	applicationId,
	botIsPublic,
	botRequireCodeGrant,
	sectionId,
}) => {
	const {t} = useLingui();
	const inviteUrlInputId = useId();
	const [copied, setCopied] = useState(false);

	// Deliberately the simplest possible invite: client_id + scope=bot, no
	// permissions and no redirect URI. Anything richer is the URL Builder's job.
	const inviteUrl = useMemo(
		() => buildAuthorizeUrl({clientId: applicationId, scopes: BOT_INVITE_SCOPES}),
		[applicationId],
	);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			ToastActionCreators.createToast({type: 'success', children: t`Copied invite link to clipboard`});
		} catch (err) {
			logger.error('Failed to copy invite link', err);
		}
	}, [inviteUrl, t]);

	return (
		<SectionCard id={sectionId} title={t`Bot Invite Link`} subtitle={t`Share this link to add your bot to a server.`}>
			<div className={styles.fieldStack}>
				<div className={styles.secretRow}>
					<Input id={inviteUrlInputId} label={t`Invite link`} type="text" value={inviteUrl} readOnly />
					<div className={styles.secretActions}>
						<Button variant="primary" compact fitContent onClick={handleCopy} leftIcon={<CopyIcon size={14} />}>
							{copied ? t`Copied` : t`Copy`}
						</Button>
					</div>
				</div>

				<p className={styles.helperText}>
					<Trans>
						Hand this link to anyone who wants your bot in their server. They pick a server they can manage, confirm,
						and the bot joins — the link grants no permissions on its own.
					</Trans>
				</p>

				{!botIsPublic && (
					<p className={styles.helperText}>
						<Trans>
							<strong>This bot is private.</strong> Only you and team members with the developer or admin role can use
							this link. Turn on <strong>Public Bot</strong> in Application Information if you want anyone else to be
							able to add it.
						</Trans>
					</p>
				)}

				{botRequireCodeGrant && (
					<p className={styles.helperText}>
						<Trans>
							<strong>This bot requires OAuth2 code grant.</strong> This link will be rejected on its own — use the
							OAuth2 URL Builder to add a redirect URI.
						</Trans>
					</p>
				)}

				<p className={styles.helperText}>
					<Trans>
						Need specific permissions or extra scopes? Build a custom link with the OAuth2 URL Builder on this page.
					</Trans>
				</p>
			</div>
		</SectionCard>
	);
};
