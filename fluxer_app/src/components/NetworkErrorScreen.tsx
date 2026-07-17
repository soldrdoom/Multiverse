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

import styles from '@app/components/ErrorFallback.module.css';
import {MultiverseIcon} from '@app/components/icons/MultiverseIcon';
import {Button} from '@app/components/uikit/button/Button';
import {Trans} from '@lingui/react/macro';
import {useCallback} from 'react';

export const NetworkErrorScreen = () => {
	const handleRetry = useCallback(() => {
		window.location.reload();
	}, []);

	return (
		<div className={styles.errorFallbackContainer}>
			<MultiverseIcon className={styles.errorFallbackIcon} />
			<div className={styles.errorFallbackContent}>
				<h1 className={styles.errorFallbackTitle}>
					<Trans>Connection Issue</Trans>
				</h1>
				<p className={styles.errorFallbackDescription}>
					<Trans>
						We're having trouble connecting to Multiverse's servers. This could be a temporary network issue or scheduled
						maintenance.
					</Trans>
				</p>
				<p className={styles.errorFallbackDescription}>
					<Trans>
						Check{' '}
						<a href="https://multiverse.forum" target="_blank" rel="noopener noreferrer">
							multiverse.forum
						</a>{' '}
						for status updates.
					</Trans>
				</p>
			</div>
			<div className={styles.errorFallbackActions}>
				<Button onClick={handleRetry}>
					<Trans>Try Again</Trans>
				</Button>
			</div>
		</div>
	);
};
