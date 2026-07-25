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
import {FlashMessage} from '@fluxer/ui/src/components/Flash';
import type {FC} from 'hono/jsx';

export interface NewsDetailPageProps {
	config: Config;
	session: Session;
	currentAdmin: UserAdminResponse | undefined;
	flash: Flash | undefined;
	assetVersion: string;
	story: NewsStoryAdminResponse;
	csrfToken: string;
}

export async function NewsDetailPage({
	config,
	session,
	currentAdmin,
	flash,
	assetVersion,
	story,
	csrfToken,
}: NewsDetailPageProps) {
	const adminAcls = currentAdmin?.acls ?? [];
	const canManage = hasPermission(adminAcls, AdminACLs.NEWS_MANAGE);

	return (
		<Layout
			csrfToken={csrfToken}
			title={story.title}
			activePage="news"
			config={config}
			session={session}
			currentAdmin={currentAdmin}
			flash={flash}
			assetVersion={assetVersion}
		>
			<PageLayout maxWidth="7xl">
				<VStack gap={6}>
					{flash ? <FlashMessage flash={flash} /> : null}
					<RenderStoryMeta story={story} />
					{canManage ? (
						<>
							<RenderEditForm config={config} story={story} csrfToken={csrfToken} />
							<RenderStatusActions config={config} story={story} csrfToken={csrfToken} />
							<RenderDeleteAction config={config} story={story} csrfToken={csrfToken} />
						</>
					) : null}
				</VStack>
			</PageLayout>
		</Layout>
	);
}

const RenderStoryMeta: FC<{story: NewsStoryAdminResponse}> = ({story}) => {
	return (
		<Card padding="md">
			<VStack gap={2}>
				<HStack gap={2} align="center">
					<Heading level={1} size="2xl">
						{story.title}
					</Heading>
					<Badge variant={story.status === 'published' ? 'success' : 'neutral'} size="sm">
						{story.status === 'published' ? 'Published' : 'Draft'}
					</Badge>
				</HStack>
				<Text size="sm" color="muted">
					Created {story.created_at}
				</Text>
				{story.published_at ? (
					<Text size="sm" color="muted">
						Published {story.published_at}
					</Text>
				) : null}
				{story.image_url ? (
					<img
						src={story.image_url}
						alt=""
						class="mt-2 h-40 w-full max-w-md rounded-lg border border-neutral-200 object-cover"
					/>
				) : null}
			</VStack>
		</Card>
	);
};

const RenderEditForm: FC<{config: Config; story: NewsStoryAdminResponse; csrfToken: string}> = ({
	config,
	story,
	csrfToken,
}) => {
	return (
		<Card padding="md">
			<VStack gap={4}>
				<Heading level={2} size="xl">
					Edit Story
				</Heading>
				<form method="post" action={`${config.basePath}/news/${story.story_id}?action=update`} id="news-edit-form">
					<VStack gap={4}>
						<CsrfInput token={csrfToken} />
						<FormFieldGroup label="Title">
							<Input id="news-title" type="text" name="title" required value={story.title} />
						</FormFieldGroup>
						<FormFieldGroup label="Body">
							<Textarea id="news-body" name="body" required rows={10} value={story.body} fullWidth />
						</FormFieldGroup>
						<FormFieldGroup label="Image URL (optional)">
							<Input
								id="news-image-url"
								type="url"
								name="image_url"
								placeholder="https://example.com/image.jpg"
								value={story.image_url ?? ''}
							/>
						</FormFieldGroup>
						<FormFieldGroup label="Or upload an image">
							<input type="hidden" name="image_data" id="news-edit-image-data" />
							<input id="news-edit-image-file" type="file" accept="image/*" class="hidden" />
							<div class="flex items-center gap-2">
								<Button
									type="button"
									variant="secondary"
									size="small"
									onclick="document.getElementById('news-edit-image-file').click()"
								>
									Choose Image
								</Button>
								<span class="text-neutral-500 text-sm" id="news-edit-image-file-name">
									No file chosen
								</span>
							</div>
							<Text size="sm" color="muted">
								If you choose a file here, it's uploaded and replaces whatever is in the Image URL field above.
							</Text>
						</FormFieldGroup>
						<Button type="submit" variant="primary" id="news-edit-submit">
							Save Changes
						</Button>
					</VStack>
				</form>
				<NewsEditImageUploadScript />
			</VStack>
		</Card>
	);
};

const NEWS_EDIT_IMAGE_UPLOAD_SCRIPT = `
(function () {
	var form = document.getElementById('news-edit-form');
	if (!form) return;

	var file = document.getElementById('news-edit-image-file');
	var imageData = document.getElementById('news-edit-image-data');
	var submitButton = document.getElementById('news-edit-submit');
	var fileName = document.getElementById('news-edit-image-file-name');
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
			submitButton.querySelector('span').textContent = 'Save Changes';
			alert('Failed to read the image file. Please try again.');
		};
		reader.readAsDataURL(selected);
	});
})();
`;

const NewsEditImageUploadScript: FC = () => {
	return <script defer dangerouslySetInnerHTML={{__html: NEWS_EDIT_IMAGE_UPLOAD_SCRIPT}} />;
};

const RenderStatusActions: FC<{config: Config; story: NewsStoryAdminResponse; csrfToken: string}> = ({
	config,
	story,
	csrfToken,
}) => {
	const action = story.status === 'published' ? 'unpublish' : 'publish';
	const label = story.status === 'published' ? 'Unpublish' : 'Publish';

	return (
		<Card padding="md">
			<VStack gap={3}>
				<Heading level={2} size="xl">
					Visibility
				</Heading>
				<Text size="sm" color="muted">
					{story.status === 'published'
						? 'This story is live on the login page. Unpublish to hide it.'
						: 'This story is a draft and is not visible anywhere. Publish to show it on the login page.'}
				</Text>
				<form method="post" action={`${config.basePath}/news/${story.story_id}?action=${action}`}>
					<CsrfInput token={csrfToken} />
					<Button type="submit" variant={story.status === 'published' ? 'secondary' : 'primary'}>
						{label}
					</Button>
				</form>
			</VStack>
		</Card>
	);
};

const RenderDeleteAction: FC<{config: Config; story: NewsStoryAdminResponse; csrfToken: string}> = ({
	config,
	story,
	csrfToken,
}) => {
	return (
		<Card padding="md">
			<VStack gap={3}>
				<Heading level={2} size="xl">
					Delete Story
				</Heading>
				<Text size="sm" color="muted">
					This permanently deletes the story. This cannot be undone.
				</Text>
				<form method="post" action={`${config.basePath}/news/${story.story_id}?action=delete`}>
					<CsrfInput token={csrfToken} />
					<Button type="submit" variant="danger">
						Delete Story
					</Button>
				</form>
			</VStack>
		</Card>
	);
};
