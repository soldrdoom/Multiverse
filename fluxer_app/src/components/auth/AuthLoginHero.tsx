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

import styles from '@app/components/auth/AuthLoginHero.module.css';
import {Trans, useLingui} from '@lingui/react/macro';
import {type Icon, VaultIcon, VideoCameraIcon, WalletIcon} from '@phosphor-icons/react';

interface FeatureItem {
	icon: Icon;
	label: string;
	description: string;
}

export function AuthLoginHero() {
	const {t} = useLingui();

	const features: FeatureItem[] = [
		{
			icon: VaultIcon,
			label: t`Your keys, your messages`,
			description: t`The Identity Vault encrypts your DMs end-to-end with keys derived from your wallet.`,
		},
		{
			icon: VideoCameraIcon,
			label: t`Voice & video, built in`,
			description: t`Crystal-clear calls and screen share, no third-party plugins needed.`,
		},
		{
			icon: WalletIcon,
			label: t`Sign in with Solana`,
			description: t`Skip the password — connect your wallet for instant, secure access.`,
		},
	];

	return (
		<div className={styles.column}>
			<h1 className={styles.headline}>
				<Trans>A chat app that puts you first</Trans>
			</h1>
			<p className={styles.subhead}>
				<Trans>Free, open source, and built to last. Message, call, and connect.</Trans>
			</p>
			<div className={styles.featureList}>
				{features.map(({icon: FeatureIcon, label, description}) => (
					<div className={styles.featureItem} key={label}>
						<div className={styles.featureIcon}>
							<FeatureIcon size={20} weight="bold" />
						</div>
						<div className={styles.featureText}>
							<span className={styles.featureLabel}>{label}</span>
							<span className={styles.featureDescription}>{description}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
