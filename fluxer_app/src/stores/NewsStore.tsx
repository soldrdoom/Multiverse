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

import HttpClient from '@app/lib/HttpClient';
import RuntimeConfigStore from '@app/stores/RuntimeConfigStore';
import type {ListPublishedNewsResponse, NewsStoryResponse} from '@fluxer/schema/src/domains/news/NewsSchemas';
import {makeAutoObservable} from 'mobx';

class NewsStore {
	stories: Array<NewsStoryResponse> = [];
	isLoading = false;
	private _fetchedForEndpoint: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	async fetchPublished(): Promise<void> {
		const apiEndpoint = RuntimeConfigStore.apiEndpoint;
		if (!apiEndpoint || this.isLoading || this._fetchedForEndpoint === apiEndpoint) {
			return;
		}

		this.isLoading = true;
		try {
			// NOTE: unlike RuntimeConfigStore's well-known-config lookup, /news is mounted
			// under the API's normal /api prefix (see NewsController + ControllerRegistry),
			// not root-mounted — so this must go through HttpClient's standard path-based
			// request (which resolves against HttpClient's own baseUrl/apiVersion, kept in
			// sync with RuntimeConfigStore.apiEndpoint via setBaseUrl), not a hand-built
			// absolute URL that strips the /api prefix.
			const response = await HttpClient.get<ListPublishedNewsResponse>({
				url: '/news',
				skipAuth: true,
			});
			if (response.ok && Array.isArray(response.body?.stories)) {
				this.stories = response.body.stories;
				this._fetchedForEndpoint = apiEndpoint;
			}
		} catch {
			// News tiles are non-critical; silently leave the list empty on failure.
		} finally {
			this.isLoading = false;
		}
	}
}

export default new NewsStore();
