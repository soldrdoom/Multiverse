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

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {hasPermission} from '@fluxer/admin/src/AccessControlList';
import {listNewsStories} from '@fluxer/admin/src/api/News';
import {Layout} from '@fluxer/admin/src/components/Layout';
import {Badge} from '@fluxer/admin/src/components/ui/Badge';
import {FormFieldGroup} from '@fluxer/admin/src/components/ui/Form/FormFieldGroup';
import {Input} from '@fluxer/admin/src/components/ui/Input';
import {HStack} from '@fluxer/admin/src/components/ui/Layout/HStack';
import {PageLayout} from '@fluxer/admin/src/components/ui/Layout/PageLayout';
import {VStack} from '@fluxer/admin/src/components/ui/Layout/VStack';
import {Textarea} from '@fluxer/admin/src/components/ui/Textarea';
import {Heading, Text} from '@fluxer/admin/src/components/ui/Typography';
import type {Session} from '@fluxer/admin/src/types/App';
import type {AdminConfig as Config} from '@fluxer/admin/src/types/Config';
import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import type {Flash} from '@fluxer/hono/src/Flash';
import type {NewsStoryAdminResponse} from '@fluxer/schema/src/domains/admin/AdminNewsSchemas';
import type {UserAdminResponse} from '@fluxer/schema/src/domains/admin/AdminUserSchemas';
import {Button} from '@fluxer/ui/src/components/Button';
import {Card} from '@fluxer/ui/src/components/Card';
import {CsrfInput} from '@fluxer/ui/src/components/CsrfInput';
import {EmptyState} from '@fluxer/ui/src/components/EmptyState';
import {FlashMessage} from '@fluxer/ui/src/components/Flash';
import type {FC} from 'hono/jsx';

export interface NewsPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	assetVersion: string;
	csrfToken: string;
}

export async function NewsPage({config, session, currentAdmin, flash, assetVersion, csrfToken}: NewsPageProps) {
	const adminAcls = currentAdmin?.acls ?? [];
	const canView = hasPermission(adminAcls, AdminACLs.NEWS_VIEW);
	const canManage = hasPermission(adminAcls, AdminACLs.NEWS_MANAGE);

	if (!canView) {
		return (
			<Layout
				csrfToken={csrfToken}
				title="News"
				activePage="news"
				config={config}
				session={session}
				currentAdmin={currentAdmin}
				flash={flash}
				assetVersion={assetVersion}
			>
				<RenderAccessDenied />
			</Layout>
		);
	}

	const storiesResult = await listNewsStories(config, session);
	const stories = storiesResult.ok ? storiesResult.data.stories : undefined;

	return (
		<Layout
			csrfToken={csrfToken}
			title="News"
			activePage="news"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			<PageLayout maxWidth="7xl">
				<VStack gap={6}>
					{canManage ? <RenderCreateForm config={config} csrfToken={csrfToken} /> : null}
					{flash ? <FlashMessage flash={flash} /> : null}
					<RenderStoryListSection config={config} stories={stories} canManage={canManage} />
				</VStack>
			</PageLayout>
		</Layout>
	);
}

const RenderCreateForm: FC<{config: Config; csrfToken: string}> = ({config, csrfToken}) => {
	return (
		<Card padding="md">
			<VStack gap={4}>
				<Heading level={1} size="2xl">
					Create News Story
				</Heading>
				<Text size="sm" color="muted">
					Drafts are saved but not shown to users until you publish them from the story's detail page.
				</Text>
				<form method="post" action={`${config.basePath}/news?action=create`} id="news-create-form">
					<VStack gap={4}>
						<CsrfInput token={csrfToken} />
						<FormFieldGroup label="Title">
							<Input id="news-title" type="text" name="title" required placeholder="Story title" />
						</FormFieldGroup>
						<FormFieldGroup label="Body">
							<Textarea id="news-body" name="body" required rows={6} placeholder="Story content" fullWidth />
						</FormFieldGroup>
						<FormFieldGroup label="Image URL (optional)">
							<Input
								id="news-image-url"
								type="url"
								name="image_url"
								placeholder="https://example.com/image.jpg"
							/>
						</FormFieldGroup>
						<FormFieldGroup label="Or upload an image">
							<input type="hidden" name="image_data" id="news-create-image-data" />
							<input id="news-create-image-file" type="file" accept="image/*" class="hidden" />
							<div class="flex items-center gap-2">
								<Button
									type="button"
									variant="secondary"
									size="small"
									onclick="document.getElementById('news-create-image-file').click()"
								>
									Choose Image
								</Button>
								<span class="text-neutral-500 text-sm" id="news-create-image-file-name">
									No file chosen
								</span>
							</div>
							<Text size="sm" color="muted">
								If you choose a file here, it's uploaded and replaces whatever is in the Image URL field above.
							</Text>
						</FormFieldGroup>
						<Button type="submit" variant="primary" id="news-create-submit">
							Create Draft
						</Button>
					</VStack>
				</form>
				<NewsCreateImageUploadScript />
			</VStack>
		</Card>
	);
};

const NEWS_CREATE_IMAGE_UPLOAD_SCRIPT = `
(function () {
	var form = document.getElementById('news-create-form');
	if (!form) return;

	var file = document.getElementById('news-create-image-file');
	var imageData = document.getElementById('news-create-image-data');
	var submitButton = document.getElementById('news-create-submit');
	var fileName = document.getElementById('news-create-image-file-name');
	if (!file || !imageData || !submitButton) return;

	file.addEventListener('change', function () {
		if (fileName) {
			fileName.textContent = file.files && file.files[0] ? file.files[0].name : 'No file chosen';
		}
	});

	var processing = false;

	form.addEventListener('submit', function (event) {
		if (processing) {
			event.preventDefault();
			return;
		}

		var selected = file.files && file.files[0];
		if (!selected) {
			return;
		}

		event.preventDefault();
		processing = true;
		submitButton.disabled = true;
		submitButton.querySelector('span').textContent = 'Uploading...';

		var reader = new FileReader();
		reader.onload = function () {
			imageData.value = reader.result || '';
			form.submit();
		};
		reader.onerror = function () {
			processing = false;
			submitButton.disabled = false;
			submitButton.querySelector('span').textContent = 'Create Draft';
			alert('Failed to read the image file. Please try again.');
		};
		reader.readAsDataURL(selected);
	});
})();
`;

const NewsCreateImageUploadScript: FC = () => {
	return <script defer dangerouslySetInnerHTML={{__html: NEWS_CREATE_IMAGE_UPLOAD_SCRIPT}} />;
};

const RenderStoryListSection: FC<{
	config: Config;
	stories: Array<NewsStoryAdminResponse> | undefined;
	canManage: boolean;
}> = ({config, stories, canManage}) => {
	if (stories === undefined) {
		return (
			<VStack gap={3}>
				<EmptyState title="Failed to load news stories." />
			</VStack>
		);
	}

	if (stories.length === 0) {
		return (
			<Card padding="md">
				<VStack gap={4}>
					<Heading level={2} size="xl">
						Existing Stories
					</Heading>
					<EmptyState title="No news stories yet. Create one above to get started." />
				</VStack>
			</Card>
		);
	}

	return (
		<Card padding="md">
			<VStack gap={4}>
				<Heading level={2} size="xl">
					Existing Stories
				</Heading>
				<VStack gap={3}>
					{stories.map((story) => (
						<RenderStoryItem config={config} story={story} canManage={canManage} />
					))}
				</VStack>
			</VStack>
		</Card>
	);
};

const RenderStoryItem: FC<{config: Config; story: NewsStoryAdminResponse; canManage: boolean}> = ({
	config,
	story,
	canManage,
}) => {
	return (
		<Card padding="sm" class="border border-neutral-200">
			<HStack justify="between" align="start">
				<VStack gap={1} class="flex-1">
					<HStack gap={2} align="center">
						<a href={`${config.basePath}/news/${story.story_id}`} class="font-semibold text-base hover:underline">
							{story.title}
						</a>
						<Badge variant={story.status === 'published' ? 'success' : 'neutral'} size="sm">
							{story.status === 'published' ? 'Published' : 'Draft'}
						</Badge>
					</HStack>
					<Text size="sm" color="muted">
						Created: {story.created_at}
					</Text>
					{story.published_at ? (
						<Text size="sm" color="muted">
							Published: {story.published_at}
						</Text>
					) : null}
				</VStack>
				{canManage ? (
					<a href={`${config.basePath}/news/${story.story_id}`}>
						<Button type="button" variant="secondary" size="small">
							Manage
						</Button>
					</a>
				) : null}
			</HStack>
		</Card>
	);
};

const RenderAccessDenied: FC = () => {
	return (
		<Card padding="md">
			<VStack gap={2}>
				<Heading level={1} size="2xl">
					News
				</Heading>
				<Text size="sm" color="muted">
					You do not have permission to view news stories.
				</Text>
			</VStack>
		</Card>
	);
};
