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

import styles from '@app/components/auth/AuthLoginNewsTiles.module.css';
import NewsStore from '@app/stores/NewsStore';
import {MegaphoneIcon} from '@phosphor-icons/react';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const EXCERPT_LENGTH = 110;

function toExcerpt(body: string): string {
	const trimmed = body.trim();
	if (trimmed.length <= EXCERPT_LENGTH) {
		return trimmed;
	}
	return `${trimmed.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

function formatPublishedDate(publishedAt: string): string {
	const date = new Date(publishedAt);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', year: 'numeric'}).format(date);
}

export const AuthLoginNewsTiles = observer(function AuthLoginNewsTiles() {
	const {stories} = NewsStore;

	if (!Array.isArray(stories) || stories.length === 0) {
		return null;
	}

	return (
		<div className={styles.wrapper}>
			<div className={styles.header}>
				<MegaphoneIcon size={16} weight="bold" className={styles.headerIcon} />
				<span className={styles.headerLabel}>
					<Trans>What's new</Trans>
				</span>
			</div>
			<div className={styles.grid}>
				{stories.slice(0, 3).map((story) => (
					<article className={styles.tile} key={story.story_id}>
						<div className={styles.thumb}>
							{story.image_url ? (
								<img className={styles.thumbImage} src={story.image_url} alt="" loading="lazy" />
							) : (
								<div className={styles.thumbFallback} />
							)}
						</div>
						<div className={styles.tileContent}>
							<span className={styles.date}>{formatPublishedDate(story.published_at)}</span>
							<h3 className={styles.title}>{story.title}</h3>
							<p className={styles.excerpt}>{toExcerpt(story.body)}</p>
						</div>
					</article>
				))}
			</div>
		</div>
	);
});
