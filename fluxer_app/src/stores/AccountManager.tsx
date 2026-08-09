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

import type {UserData} from '@app/lib/AccountStorage';
import SessionManager, {type Account, SessionExpiredError} from '@app/lib/SessionManager';
import {Routes} from '@app/Routes';
import * as PushSubscriptionService from '@app/services/push/PushSubscriptionService';
import GatewayConnectionStore from '@app/stores/gateway/GatewayConnectionStore';
import SolanaWalletStore from '@app/stores/SolanaWalletStore';
import * as NotificationUtils from '@app/utils/NotificationUtils';
import {isInstalledPwa} from '@app/utils/PwaUtils';
import * as RouterUtils from '@app/utils/RouterUtils';
import {computed, makeAutoObservable} from 'mobx';

class AccountManager {
	constructor() {
		makeAutoObservable(
			this,
			{
				currentUserId: computed,
				currentAccount: computed,
				orderedAccounts: computed,
				canSwitchAccounts: computed,
				isSwitching: computed,
				isLoading: computed,
			},
			{autoBind: true},
		);
	}

	private shouldManagePushSubscriptions(): boolean {
		return isInstalledPwa();
	}

	get currentUserId(): string | null {
		return SessionManager.userId;
	}

	get accounts(): Map<string, Account> {
		return new Map(SessionManager.accounts.map((a) => [a.userId, a]));
	}

	get isSwitching(): boolean {
		return SessionManager.isSwitching;
	}

	get isLoading(): boolean {
		return SessionManager.isLoggingOut || SessionManager.isSwitching;
	}

	get currentAccount(): Account | null {
		return SessionManager.currentAccount;
	}

	get orderedAccounts(): Array<Account> {
		return SessionManager.accounts;
	}

	get canSwitchAccounts(): boolean {
		return SessionManager.canSwitchAccount();
	}

	getAllAccounts(): Array<Account> {
		return this.orderedAccounts;
	}

	async bootstrap(): Promise<void> {
		await SessionManager.initialize();
	}

	async stashCurrentAccount(): Promise<void> {
		await SessionManager.stashCurrentAccount();
	}

	markAccountAsInvalid(userId: string): void {
		SessionManager.markAccountInvalid(userId);
	}

	async generateTokenForAccount(userId: string): Promise<{token: string; userId: string}> {
		await SessionManager.initialize();

		const account = SessionManager.accounts.find((a) => a.userId === userId);
		if (!account) {
			throw new Error(`No stored data found for account ${userId}`);
		}

		const ok = await SessionManager.validateToken(account.token, account.instance);
		if (!ok) {
			SessionManager.markAccountInvalid(userId);
			throw new SessionExpiredError();
		}

		return {token: account.token, userId};
	}

	async switchToAccount(userId: string): Promise<void> {
		if (this.shouldManagePushSubscriptions()) {
			await PushSubscriptionService.unregisterAllPushSubscriptions();
		}

		await SessionManager.switchAccount(userId);
		// Same reasoning as logout() below: this is an SPA route swap, not a full reload, so
		// SolanaWalletStore.walletAddress (an in-memory/persisted observable that is NOT scoped
		// to an account) would otherwise leak from the previous account into the new one. The
		// account's real wallet-link state comes from UserStore (part of the freshly-loaded
		// session data), not this store — see Web3Modal.tsx/WalletChip.tsx.
		SolanaWalletStore.disconnect();
		GatewayConnectionStore.startSession(SessionManager.token ?? undefined);
		RouterUtils.replaceWith(Routes.ME);

		if (this.shouldManagePushSubscriptions()) {
			void (async () => {
				if (await NotificationUtils.isGranted()) {
					await PushSubscriptionService.registerPushSubscription();
				}
			})();
		}
	}

	async switchToNewAccount(userId: string, token: string, userData?: UserData, skipReload = false): Promise<void> {
		await SessionManager.login(token, userId, userData);
		// See switchToAccount()/logout() above — clears any stale, account-unscoped wallet
		// address left over from whatever account (if any) was previously active in this tab.
		SolanaWalletStore.disconnect();
		GatewayConnectionStore.startSession(token);
		if (!skipReload) {
			RouterUtils.replaceWith(Routes.ME);
		}

		if (this.shouldManagePushSubscriptions()) {
			void (async () => {
				if (await NotificationUtils.isGranted()) {
					await PushSubscriptionService.registerPushSubscription();
				}
			})();
		}
	}

	async removeStoredAccount(userId: string): Promise<void> {
		await SessionManager.removeAccount(userId);
	}

	updateAccountUserData(userId: string, userData: UserData): void {
		SessionManager.updateAccountUserData(userId, userData);
	}

	async logout(): Promise<void> {
		await SessionManager.logout();
		// SessionManager.logout() wipes persisted storage, but this is an SPA route swap
		// (not a full reload), so in-memory observables like SolanaWalletStore.walletAddress
		// would otherwise survive and could be misread as "connected" for whichever account
		// logs in next in this tab.
		SolanaWalletStore.disconnect();
		// Full document navigation to the marketing front page. A router transition to '/login' left
		// the SPA mounted, and its own guards immediately re-appended a redirect_to pointing back at
		// the app the user had just signed out of.
		RouterUtils.redirectToMarketingSignIn();
	}
}

export default new AccountManager();
