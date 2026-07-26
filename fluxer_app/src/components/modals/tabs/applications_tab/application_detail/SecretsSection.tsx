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
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {Button} from '@app/components/uikit/button/Button';
import {Logger} from '@app/lib/Logger';
import {useLingui} from '@lingui/react/macro';
import {CopyIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useCallback} from 'react';

const logger = new Logger('SecretsSection');

interface SecretsSectionProps {
	clientSecret: string | null;
	onRegenerateClientSecret: () => void;
	isRotatingClient: boolean;
	clientSecretInputId: string;
	sectionId?: string;
}

export const SecretsSection: React.FC<SecretsSectionProps> = ({
	clientSecret,
	onRegenerateClientSecret,
	isRotatingClient,
	clientSecretInputId,
	sectionId,
}) => {
	const {t} = useLingui();

	const handleCopy = useCallback(async () => {
		if (!clientSecret) return;
		try {
			await navigator.clipboard.writeText(clientSecret);
			ToastActionCreators.createToast({type: 'success', children: t`Copied client secret to clipboard`});
		} catch (err) {
			logger.error('Failed to copy client secret', err);
		}
	}, [clientSecret, t]);

	return (
		<SectionCard
			id={sectionId}
			title={t`Client Secret`}
			subtitle={t`Keep this safe. Regenerating will break existing integrations.`}
		>
			<div className={styles.fieldStack}>
				<div className={styles.secretRow}>
					<Input
						id={clientSecretInputId}
						label={t`Client secret`}
						type="password"
						value={clientSecret ?? ''}
						readOnly
						placeholder={'•'.repeat(64)}
					/>
					<div className={styles.secretActions}>
						<Button
							variant="secondary"
							compact
							onClick={handleCopy}
							disabled={!clientSecret}
							leftIcon={<CopyIcon size={14} />}
						>
							{t`Copy`}
						</Button>
						<Button variant="primary" compact submitting={isRotatingClient} onClick={onRegenerateClientSecret}>
							{t`Regenerate`}
						</Button>
					</div>
				</div>
			</div>
		</SectionCard>
	);
};
