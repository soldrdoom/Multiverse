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

import crypto from 'node:crypto';
import type {AdminAuditService} from '@fluxer/api/src/admin/services/AdminAuditService';
import type {NewsStoryID, UserID} from '@fluxer/api/src/BrandedTypes';
import {createNewsStoryID} from '@fluxer/api/src/BrandedTypes';
import {Config} from '@fluxer/api/src/Config';
import {type NewsStoryRow, NewsStoryStatuses} from '@fluxer/api/src/database/types/NewsTypes';
import type {IMediaService} from '@fluxer/api/src/infrastructure/IMediaService';
import type {SnowflakeService} from '@fluxer/api/src/infrastructure/SnowflakeService';
import type {IStorageService} from '@fluxer/api/src/infrastructure/IStorageService';
import type {INewsRepository} from '@fluxer/api/src/news/INewsRepository';
import {AVATAR_EXTENSIONS, AVATAR_MAX_SIZE} from '@fluxer/constants/src/LimitConstants';
import type {NewsStoryAdminResponse} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';

interface AdminNewsServiceDeps {
	newsRepository: INewsRepository;
	snowflakeService: SnowflakeService;
	auditService: AdminAuditService;
	mediaService: IMediaService;
	storageService: IStorageService;
}

function toAdminResponse(row: NewsStoryRow): NewsStoryAdminResponse {
	return {
		story_id: row.story_id.toString(),
		title: row.title,
		body: row.body,
		image_url: row.image_url ?? null,
		status: row.status,
		created_by_user_id: row.created_by_user_id.toString(),
		created_at: row.created_at.toISOString(),
		updated_at: row.updated_at.toISOString(),
		published_at: row.published_at?.toISOString() ?? null,
	};
}

async function requireStory(newsRepository: INewsRepository, storyId: NewsStoryID): Promise<NewsStoryRow> {
	const row = await newsRepository.findById(storyId);
	if (!row) {
		throw new Error('News story not found');
	}
	return row;
}

export class AdminNewsService {
	constructor(private readonly deps: AdminNewsServiceDeps) {}

	// Uploads an admin-supplied image (base64 data URL from the news editor's file picker) to the
	// CDN bucket and returns its public URL. Reuses the avatar size/format limits since there's no
	// dedicated news-image limit and this is conceptually the same kind of upload.
	private async uploadImage(storyId: NewsStoryID, imageData: string): Promise<string> {
		const {mediaService, storageService} = this.deps;
		const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;

		let imageBuffer: Uint8Array;
		try {
			imageBuffer = new Uint8Array(Buffer.from(base64Data, 'base64'));
		} catch {
			throw new Error('Invalid image data');
		}

		if (imageBuffer.length > AVATAR_MAX_SIZE) {
			throw new Error(`Image exceeds maximum size of ${AVATAR_MAX_SIZE} bytes`);
		}

		const metadata = await mediaService.getMetadata({type: 'base64', base64: base64Data, isNSFWAllowed: false});
		if (metadata == null || !AVATAR_EXTENSIONS.has(metadata.format)) {
			throw new Error(`Unsupported image format; supported formats: ${[...AVATAR_EXTENSIONS].join(', ')}`);
		}

		const hash = crypto.createHash('md5').update(Buffer.from(imageBuffer)).digest('hex').slice(0, 8);
		const key = `news/${storyId}/${hash}`;
		await storageService.uploadObject({
			bucket: Config.s3.buckets.cdn,
			key,
			body: imageBuffer,
			contentType: metadata.content_type,
		});

		// The media proxy is a transcode-on-request service, not a raw passthrough: its image routes
		// require a `{hash}.{ext}` filename (see packages/media_proxy's ImageController/App.tsx route
		// registration) and always re-encode to that extension via sharp, regardless of the uploaded
		// format. Serving everything as .webp (with `animated=true` for GIFs/APNGs) matches the
		// existing emoji/sticker convention in AvatarUtils.tsx rather than trying to preserve the
		// original extension, which the proxy wouldn't accept unmodified anyway.
		const query = new URLSearchParams({size: '1024'});
		if (metadata.animated) {
			query.set('animated', 'true');
		}
		return `${Config.endpoints.media}/news/${storyId}/${hash}.webp?${query.toString()}`;
	}

	private async resolveImageUrl(
		storyId: NewsStoryID,
		imageUrl: string | null,
		imageData: string | null,
	): Promise<string | null> {
		if (imageData) {
			return this.uploadImage(storyId, imageData);
		}
		return imageUrl;
	}

	async listAll(): Promise<{stories: Array<NewsStoryAdminResponse>}> {
		const {newsRepository} = this.deps;
		const [drafts, published] = await Promise.all([
			newsRepository.listByStatus(NewsStoryStatuses.DRAFT, 500),
			newsRepository.listByStatus(NewsStoryStatuses.PUBLISHED, 500),
		]);
		const merged = [...drafts, ...published].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
		return {
			stories: merged.map((row) =>
				toAdminResponse({
					story_id: row.story_id,
					title: row.title,
					body: row.body,
					image_url: row.image_url,
					status: row.status,
					created_by_user_id: row.created_by_user_id,
					created_at: row.created_at,
					updated_at: row.updated_at,
					published_at: row.published_at,
				}),
			),
		};
	}

	async getStory(storyId: NewsStoryID): Promise<NewsStoryAdminResponse> {
		const row = await requireStory(this.deps.newsRepository, storyId);
		return toAdminResponse(row);
	}

	async createStory(
		title: string,
		body: string,
		imageUrl: string | null,
		imageData: string | null,
		adminUserId: UserID,
	): Promise<NewsStoryAdminResponse> {
		const {newsRepository, snowflakeService, auditService} = this.deps;
		const now = new Date();
		const storyId = createNewsStoryID(await snowflakeService.generate());
		const resolvedImageUrl = await this.resolveImageUrl(storyId, imageUrl, imageData);
		const row: NewsStoryRow = {
			story_id: storyId,
			title,
			body,
			image_url: resolvedImageUrl,
			status: NewsStoryStatuses.DRAFT,
			created_by_user_id: adminUserId,
			created_at: now,
			updated_at: now,
			published_at: null,
		};
		await newsRepository.create(row);

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'news_story',
			targetId: BigInt(row.story_id),
			action: 'create_news_story',
			auditLogReason: null,
			metadata: new Map([['title', row.title]]),
		});

		return toAdminResponse(row);
	}

	async updateStory(
		storyId: NewsStoryID,
		title: string,
		body: string,
		imageUrl: string | null,
		imageData: string | null,
		adminUserId: UserID,
	): Promise<NewsStoryAdminResponse> {
		const {newsRepository, auditService} = this.deps;
		const existing = await requireStory(newsRepository, storyId);
		const resolvedImageUrl = await this.resolveImageUrl(storyId, imageUrl, imageData);
		const updated: NewsStoryRow = {...existing, title, body, image_url: resolvedImageUrl, updated_at: new Date()};
		await newsRepository.update(updated);

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'news_story',
			targetId: BigInt(storyId),
			action: 'update_news_story',
			auditLogReason: null,
			metadata: new Map([['title', updated.title]]),
		});

		return toAdminResponse(updated);
	}

	async publishStory(storyId: NewsStoryID, adminUserId: UserID): Promise<NewsStoryAdminResponse> {
		const {newsRepository, auditService} = this.deps;
		const existing = await requireStory(newsRepository, storyId);
		const now = new Date();
		const updated: NewsStoryRow = {...existing, status: NewsStoryStatuses.PUBLISHED, published_at: now, updated_at: now};
		await newsRepository.setStatus(existing.status, existing.created_at, updated);

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'news_story',
			targetId: BigInt(storyId),
			action: 'publish_news_story',
			auditLogReason: null,
			metadata: new Map([['title', updated.title]]),
		});

		return toAdminResponse(updated);
	}

	async unpublishStory(storyId: NewsStoryID, adminUserId: UserID): Promise<NewsStoryAdminResponse> {
		const {newsRepository, auditService} = this.deps;
		const existing = await requireStory(newsRepository, storyId);
		const updated: NewsStoryRow = {...existing, status: NewsStoryStatuses.DRAFT, updated_at: new Date()};
		await newsRepository.setStatus(existing.status, existing.created_at, updated);

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'news_story',
			targetId: BigInt(storyId),
			action: 'unpublish_news_story',
			auditLogReason: null,
			metadata: new Map([['title', updated.title]]),
		});

		return toAdminResponse(updated);
	}

	async deleteStory(storyId: NewsStoryID, adminUserId: UserID): Promise<void> {
		const {newsRepository, auditService} = this.deps;
		const existing = await requireStory(newsRepository, storyId);
		await newsRepository.delete(storyId, existing.status, existing.created_at);

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'news_story',
			targetId: BigInt(storyId),
			action: 'delete_news_story',
			auditLogReason: null,
			metadata: new Map([['title', existing.title]]),
		});
	}
}
