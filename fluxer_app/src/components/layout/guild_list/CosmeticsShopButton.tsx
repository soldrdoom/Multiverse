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

import {modal} from '@app/actions/ModalActionCreators';
import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import guildStyles from '@app/components/layout/GuildsLayout.module.css';
import styles from '@app/components/layout/guild_list/CosmeticsShopButton.module.css';
import FocusRing from '@app/components/uikit/focus_ring/FocusRing';
import {Tooltip} from '@app/components/uikit/tooltip/Tooltip';
import {useHover} from '@app/hooks/useHover';
import {useMergeRefs} from '@app/hooks/useMergeRefs';
import AccessibilityStore from '@app/stores/AccessibilityStore';
import {useLingui} from '@lingui/react/macro';
import {StorefrontIcon} from '@phosphor-icons/react';
import {motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useRef} from 'react';

export const CosmeticsShopButton = observer(() => {
	const {t} = useLingui();
	const [hoverRef, isHovering] = useHover();
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const iconRef = useRef<HTMLDivElement | null>(null);
	const mergedButtonRef = useMergeRefs([hoverRef, buttonRef]);

	const handleClick = async () => {
		const {CosmeticsShopModal} = await import('@app/components/modals/CosmeticsShopModal');
		ModalActionCreators.push(modal(() => <CosmeticsShopModal />));
	};

	return (
		<div className={guildStyles.addGuildButton}>
			<Tooltip position="right" size="large" text={() => t`Cosmetics Shop`}>
				<FocusRing offset={-2} focusTarget={buttonRef} ringTarget={iconRef}>
					<button
						type="button"
						aria-label={t`Cosmetics Shop`}
						data-guild-list-focus-item="true"
						onClick={handleClick}
						className={styles.button}
						ref={mergedButtonRef}
					>
						<motion.div
							ref={iconRef}
							className={guildStyles.addGuildButtonIcon}
							animate={{borderRadius: isHovering ? '30%' : '50%'}}
							initial={{borderRadius: isHovering ? '30%' : '50%'}}
							transition={{duration: AccessibilityStore.useReducedMotion ? 0 : 0.07, ease: 'easeOut'}}
							whileHover={AccessibilityStore.useReducedMotion ? undefined : {borderRadius: '30%'}}
						>
							<StorefrontIcon weight="bold" className={styles.iconText} />
						</motion.div>
					</button>
				</FocusRing>
			</Tooltip>
		</div>
	);
});
