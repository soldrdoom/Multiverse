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

import {useVault} from '@app/hooks/useVault';
import {Button} from '@app/components/uikit/button/Button';
import {Trans} from '@lingui/react/macro';
import {ShieldWarningIcon} from '@phosphor-icons/react';
import type React from 'react';

/**
 * VaultBootstrap — mounts globally inside the authenticated layout.
 *
 * Drives the useVault hook, which silently restores the private key from
 * IndexedDB on mount.  Under normal operation (vault was initialized during
 * login) this renders nothing.  A non-dismissible error banner is shown only
 * if vault initialization failed (e.g. the user rejected the wallet prompt
 * during login) — offering a one-click retry.
 */
export const VaultBootstrap: React.FC = () => {
	const {status, error, unlock} = useVault();

	if (status !== 'error') return null;

	const bannerStyle: React.CSSProperties = {
		position: 'fixed',
		bottom: 0,
		left: 0,
		right: 0,
		zIndex: 9999,
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		padding: '10px 20px',
		background: 'var(--bg-mod-faint, #2b2d31)',
		borderTop: '1px solid var(--status-danger, #ed4245)',
		color: 'var(--text-normal)',
		fontSize: 13,
	};

	return (
		<div style={bannerStyle}>
			<ShieldWarningIcon size={18} weight="fill" style={{flexShrink: 0, color: 'var(--status-danger, #ed4245)'}} />
			<span style={{flex: 1}}>
				<Trans>Encryption setup failed</Trans>
				{error ? `: ${error}` : '.'}
				{' '}
				<Trans>Direct messages are disabled until this is resolved.</Trans>
			</span>
			<Button variant="danger-primary" small onClick={unlock}>
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
};
