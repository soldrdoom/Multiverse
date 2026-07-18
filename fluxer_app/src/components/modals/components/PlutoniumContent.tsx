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

import {FeatureComparisonTable} from '@app/components/modals/components/FeatureComparisonTable';
import styles from '@app/components/modals/components/PlutoniumContent.module.css';
import {SectionHeader} from '@app/components/modals/components/plutonium/SectionHeader';
import {Trans} from '@lingui/react/macro';
import {CrownIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

export const PlutoniumContent = observer(() => {
	return (
		<div className={styles.mainContainer}>
			<div className={styles.header}>
				<div className={styles.iconContainer}>
					<CrownIcon className={styles.icon} weight="fill" />
				</div>
				<h1 className={styles.title}>
					<Trans>Multiverse Plutonium</Trans>
				</h1>
				<p className={styles.description}>
					<Trans>Every Plutonium perk is included free for everyone — no subscription required.</Trans>
				</p>
			</div>

			<section className={styles.perksSection}>
				<SectionHeader title={<Trans>What's included</Trans>} />
				<div className={styles.comparisonTableContainer}>
					<FeatureComparisonTable />
				</div>
			</section>
		</div>
	);
});
