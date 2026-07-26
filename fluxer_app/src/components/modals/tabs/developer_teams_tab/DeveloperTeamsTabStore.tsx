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

import {Endpoints} from '@app/Endpoints';
import i18n from '@app/I18n';
import HttpClient from '@app/lib/HttpClient';
import {Logger} from '@app/lib/Logger';
import type {DeveloperTeam, DeveloperTeamMember} from '@app/records/DeveloperTeamRecord';
import {DeveloperTeamRecord} from '@app/records/DeveloperTeamRecord';
import {msg} from '@lingui/core/macro';
import {action, makeAutoObservable, runInAction} from 'mobx';

const logger = new Logger('DeveloperTeamsTabStore');

enum NavigationState {
	LOADING_LIST = 'LOADING_LIST',
	LIST = 'LIST',
	LOADING_DETAIL = 'LOADING_DETAIL',
	DETAIL = 'DETAIL',
	ERROR = 'ERROR',
}

class DeveloperTeamsTabStore {
	navigationState: NavigationState = NavigationState.LOADING_LIST;
	teamOrder: Array<string> = [];
	teamsById: Record<string, DeveloperTeamRecord> = {};
	membersByTeamId: Record<string, Array<DeveloperTeamMember>> = {};
	selectedTeamId: string | null = null;
	error: string | null = null;
	membersError: string | null = null;
	isLoading: boolean = false;
	isLoadingMembers: boolean = false;

	private listAbortController: AbortController | null = null;
	private membersAbortController: AbortController | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get contentKey(): string {
		if (this.navigationState === NavigationState.DETAIL && this.selectedTeamId) {
			return `developer-teams-detail-${this.selectedTeamId}`;
		}
		return 'developer-teams-main';
	}

	get isDetailView(): boolean {
		return this.navigationState === NavigationState.DETAIL || this.navigationState === NavigationState.LOADING_DETAIL;
	}

	get isListView(): boolean {
		return this.navigationState === NavigationState.LIST || this.navigationState === NavigationState.LOADING_LIST;
	}

	get teams(): ReadonlyArray<DeveloperTeamRecord> {
		const records: Array<DeveloperTeamRecord> = [];
		for (const id of this.teamOrder) {
			const record = this.teamsById[id];
			if (record) {
				records.push(record);
			}
		}
		return records;
	}

	get selectedTeam(): DeveloperTeamRecord | null {
		if (!this.selectedTeamId) {
			return null;
		}
		return this.teamsById[this.selectedTeamId] ?? null;
	}

	get hasTeams(): boolean {
		return this.teamOrder.length > 0;
	}

	getMembersForTeam(teamId: string): ReadonlyArray<DeveloperTeamMember> {
		return this.membersByTeamId[teamId] ?? [];
	}

	async fetchTeams(options?: {showLoading?: boolean}): Promise<void> {
		if (this.listAbortController) {
			this.listAbortController.abort();
		}

		this.listAbortController = new AbortController();

		const shouldShowLoading = options?.showLoading ?? (!this.hasTeams && !this.isDetailView);

		runInAction(() => {
			if (shouldShowLoading) {
				this.navigationState = NavigationState.LOADING_LIST;
			}
			this.isLoading = shouldShowLoading;
			this.error = null;
		});

		try {
			const response = await HttpClient.get<Array<DeveloperTeam>>({
				url: Endpoints.TEAMS,
				signal: this.listAbortController.signal,
			});

			runInAction(() => {
				this.mergeTeams(response.body);
				if (!this.isDetailView) {
					this.navigationState = NavigationState.LIST;
				}
			});
		} catch (err) {
			if ((err as DOMException).name === 'AbortError') {
				return;
			}

			logger.error('Failed to fetch teams', err);

			runInAction(() => {
				this.error = i18n._(msg`Failed to load teams`);
				if (!this.isDetailView) {
					this.navigationState = NavigationState.ERROR;
				}
			});
		} finally {
			runInAction(() => {
				this.isLoading = false;
				this.listAbortController = null;
			});
		}
	}

	async fetchMembers(teamId: string): Promise<void> {
		if (this.membersAbortController) {
			this.membersAbortController.abort();
		}

		this.membersAbortController = new AbortController();

		runInAction(() => {
			this.isLoadingMembers = true;
			this.membersError = null;
		});

		try {
			const response = await HttpClient.get<Array<DeveloperTeamMember>>({
				url: Endpoints.TEAM_MEMBERS(teamId),
				signal: this.membersAbortController.signal,
			});

			runInAction(() => {
				this.membersByTeamId = {...this.membersByTeamId, [teamId]: response.body};
			});
		} catch (err) {
			if ((err as DOMException).name === 'AbortError') {
				return;
			}

			logger.error('Failed to fetch team members', err);
			runInAction(() => {
				this.membersError = i18n._(msg`Failed to load team members`);
			});
		} finally {
			runInAction(() => {
				this.isLoadingMembers = false;
				this.membersAbortController = null;
			});
		}
	}

	async navigateToDetail(teamId: string): Promise<void> {
		if (
			this.selectedTeamId === teamId &&
			(this.navigationState === NavigationState.DETAIL || this.navigationState === NavigationState.LOADING_DETAIL)
		) {
			return;
		}

		const cacheHit = Boolean(this.teamsById[teamId]);

		runInAction(() => {
			this.selectedTeamId = teamId;
			this.error = null;
			this.navigationState = cacheHit ? NavigationState.DETAIL : NavigationState.LOADING_DETAIL;
		});

		if (!cacheHit) {
			await this.fetchTeams({showLoading: false});
			runInAction(() => {
				this.navigationState = this.teamsById[teamId] ? NavigationState.DETAIL : NavigationState.ERROR;
			});
		}

		await this.fetchMembers(teamId);
	}

	async navigateToList(): Promise<void> {
		if (this.membersAbortController) {
			this.membersAbortController.abort();
			this.membersAbortController = null;
		}

		runInAction(() => {
			this.selectedTeamId = null;
			this.error = null;
			if (this.hasTeams) {
				this.navigationState = NavigationState.LIST;
			} else {
				this.navigationState = NavigationState.LOADING_LIST;
				this.isLoading = true;
			}
		});

		await this.fetchTeams({showLoading: !this.hasTeams});
	}

	@action
	clearError(): void {
		this.error = null;
		if (this.navigationState === NavigationState.ERROR) {
			if (this.isDetailView) {
				this.navigationState = NavigationState.LOADING_DETAIL;
			} else if (this.hasTeams) {
				this.navigationState = NavigationState.LIST;
			} else {
				this.navigationState = NavigationState.LOADING_LIST;
			}
		}
	}

	@action
	cacheTeam(team: DeveloperTeam): DeveloperTeamRecord {
		const record = DeveloperTeamRecord.from(team);
		this.teamsById = {...this.teamsById, [record.id]: record};
		if (!this.teamOrder.includes(record.id)) {
			this.teamOrder = [...this.teamOrder, record.id];
		}
		return record;
	}

	private mergeTeams(teams: Array<DeveloperTeam>): void {
		const nextById: Record<string, DeveloperTeamRecord> = {...this.teamsById};
		const nextOrder: Array<string> = [];

		for (const team of teams) {
			const record = DeveloperTeamRecord.from(team);
			nextById[record.id] = record;
			nextOrder.push(record.id);
		}

		this.teamOrder = nextOrder;
		this.teamsById = nextById;
	}
}

export default new DeveloperTeamsTabStore();
