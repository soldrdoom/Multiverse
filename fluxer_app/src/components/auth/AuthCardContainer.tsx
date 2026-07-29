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

import styles from '@app/components/auth/AuthCardContainer.module.css';
import authLayoutStyles from '@app/components/layout/AuthLayout.module.css';
import clsx from 'clsx';
import type {ReactNode} from 'react';
import multiverseOfficialLogo from '../../../assets/images/multiverse-official-logo.png';

interface AuthCardContainerProps {
	showLogoSide?: boolean;
	children: ReactNode;
	isInert?: boolean;
	className?: string;
}

export function AuthCardContainer({showLogoSide = true, children, isInert = false, className}: AuthCardContainerProps) {
	return (
		<div className={clsx(authLayoutStyles.cardContainer, className)}>
			<div className={clsx(authLayoutStyles.cardRing, !showLogoSide && authLayoutStyles.cardRingSingle)}>
				<div className={authLayoutStyles.card}>
					{showLogoSide && (
						<div className={authLayoutStyles.logoSide}>
							<img src={multiverseOfficialLogo} alt="Multiverse" className={authLayoutStyles.logo} />
							<span className={authLayoutStyles.wordmark}>Multiverse</span>
						</div>
					)}
					<div className={clsx(authLayoutStyles.formSide, !showLogoSide && authLayoutStyles.formSideSingle)}>
						{isInert ? <div className={styles.inertOverlay}>{children}</div> : children}
					</div>
				</div>
			</div>
		</div>
	);
}
