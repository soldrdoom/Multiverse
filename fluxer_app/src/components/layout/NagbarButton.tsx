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

import styles from '@app/components/layout/NagbarButton.module.css';
import {Button} from '@app/components/uikit/button/Button';
import {clsx} from 'clsx';
import type React from 'react';

interface NagbarButtonProps {
	children: React.ReactNode;
	onClick: () => void;
	isMobile: boolean;
	className?: string;
	disabled?: boolean;
	submitting?: boolean;
}

export const NagbarButton = ({
	children,
	onClick,
	isMobile,
	className,
	disabled = false,
	submitting,
}: NagbarButtonProps) => {
	return (
		<Button
			variant="inverted"
			superCompact={!isMobile}
			compact={isMobile}
			fitContent
			className={clsx(styles.button, className)}
			onClick={onClick}
			disabled={disabled}
			submitting={submitting}
		>
			{children}
		</Button>
	);
};
