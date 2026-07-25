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

import styles from '@app/components/auth/AuthTopNav.module.css';
import {ExternalLink} from '@app/components/common/ExternalLink';
import {Routes} from '@app/Routes';
import {Trans} from '@lingui/react/macro';
import multiverseOfficialLogo from '../../../assets/images/multiverse-official-logo.png';

export function AuthTopNav() {
	return (
		<nav className={styles.nav} aria-label="Primary">
			<div className={styles.navInner}>
				<div className={styles.brand}>
					<img src={multiverseOfficialLogo} alt="" className={styles.brandIcon} />
					<span className={styles.brandText}>Multiverse</span>
				</div>
				<div className={styles.links}>
					<ExternalLink href={Routes.home()} className={styles.link}>
						<Trans>Home</Trans>
					</ExternalLink>
					<ExternalLink href={Routes.support()} className={styles.link}>
						<Trans>Support</Trans>
					</ExternalLink>
					<ExternalLink href={Routes.roadmap()} className={styles.link}>
						<Trans>Roadmap</Trans>
					</ExternalLink>
					<ExternalLink href={Routes.whitepaper()} className={styles.link}>
						<Trans>Whitepaper</Trans>
					</ExternalLink>
				</div>
			</div>
		</nav>
	);
}
