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

import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import {modal} from '@app/actions/ModalActionCreators';
import type {PriceIds} from '@app/actions/PremiumActionCreators';
import * as ToastActionCreators from '@app/actions/ToastActionCreators';
import {SolanaCheckoutModal} from '@app/components/modals/SolanaCheckoutModal';
import {Logger} from '@app/lib/Logger';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useState} from 'react';

const logger = new Logger('useCheckoutActions');

type Plan = 'monthly' | 'yearly' | 'gift_1_month' | 'gift_1_year';

export const useCheckoutActions = (priceIds: PriceIds | null, isGiftSubscription: boolean, _mobileEnabled: boolean) => {
	const {t} = useLingui();
	const [loadingCheckout, setLoadingCheckout] = useState(false);

	const handleSelectPlan = useCallback(
		async (plan: Plan) => {
			if (loadingCheckout) return;

			logger.info('Plan selected', {plan, isGiftSubscription});

			if (plan === 'gift_1_month' || plan === 'gift_1_year') {
				ToastActionCreators.error(t`Gift subscriptions are not yet available with Solana payments.`);
				return;
			}

			if (isGiftSubscription && (plan === 'monthly' || plan === 'yearly')) {
				ToastActionCreators.error(
					t`You're currently on a gift subscription. It won't renew. You can redeem more gift codes to extend it. Recurring subscriptions can be started after your gift time ends.`,
				);
				return;
			}

			const solanaPlan = plan as 'monthly' | 'yearly';

			setLoadingCheckout(true);
			try {
				ModalActionCreators.push(
					modal(() => (
						<SolanaCheckoutModal
							plan={solanaPlan}
							onSuccess={() => {
								ToastActionCreators.success(t`Plutonium activated! Welcome to the next level.`);
							}}
						/>
					)),
				);
			} catch (error) {
				logger.error('Failed to open Solana checkout', error);
				ToastActionCreators.error(t`Failed to start checkout. Please try again.`);
			} finally {
				setLoadingCheckout(false);
			}
		},
		[loadingCheckout, isGiftSubscription, t],
	);

	return {
		loadingCheckout,
		handleSelectPlan,
	};
};
