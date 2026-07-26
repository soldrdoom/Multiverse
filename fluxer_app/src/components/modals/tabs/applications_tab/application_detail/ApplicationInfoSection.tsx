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

import {Input, Textarea} from '@app/components/form/Input';
import {Switch} from '@app/components/form/Switch';
import styles from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetail.module.css';
import type {ApplicationDetailForm} from '@app/components/modals/tabs/applications_tab/application_detail/ApplicationDetailTypes';
import {SectionCard} from '@app/components/modals/tabs/applications_tab/application_detail/SectionCard';
import {Button} from '@app/components/uikit/button/Button';
import {Checkbox} from '@app/components/uikit/checkbox/Checkbox';
import {
	APPLICATION_DESCRIPTION_MAX_LENGTH,
	APPLICATION_MAX_TAGS,
	ApplicationTags,
} from '@fluxer/constants/src/BotConstants';
import {useLingui} from '@lingui/react/macro';
import {XIcon} from '@phosphor-icons/react';
import type React from 'react';
import {Controller} from 'react-hook-form';

interface ApplicationInfoSectionProps {
	form: ApplicationDetailForm;
	redirectInputs: Array<string>;
	onAddRedirect: () => void;
	onRemoveRedirect: (index: number) => void;
	onUpdateRedirect: (index: number, value: string) => void;
	sectionId?: string;
}

const URL_PATTERN = /^https?:\/\/.+/;

export const ApplicationInfoSection: React.FC<ApplicationInfoSectionProps> = ({
	form,
	redirectInputs,
	onAddRedirect,
	onRemoveRedirect,
	onUpdateRedirect,
	sectionId,
}) => {
	const {t} = useLingui();
	const redirectList = redirectInputs ?? [];
	const selectedTags = form.watch('tags') ?? {};
	const selectedTagCount = Object.values(selectedTags).filter(Boolean).length;

	return (
		<SectionCard
			id={sectionId}
			title={t`Application Information`}
			subtitle={t`Basic settings and allowed redirect URIs.`}
		>
			<div className={styles.fieldStack}>
				<Input
					{...form.register('name', {required: t`Application name is required`})}
					label={t`Application Name`}
					value={form.watch('name')}
					placeholder={t`My Application`}
					maxLength={100}
					error={form.formState.errors.name?.message}
				/>

				<Controller
					name="description"
					control={form.control}
					render={({field}) => (
						<Textarea
							ref={field.ref}
							name={field.name}
							onBlur={field.onBlur}
							label={t`Description`}
							value={field.value ?? ''}
							onChange={(event) => field.onChange(event.target.value)}
							placeholder={t`What does your application do?`}
							minRows={2}
							maxRows={5}
							maxLength={APPLICATION_DESCRIPTION_MAX_LENGTH}
							error={form.formState.errors.description?.message}
						/>
					)}
				/>

				<div className={styles.scopeGrid}>
					<p className={styles.fieldLabel}>{t`Tags (up to ${APPLICATION_MAX_TAGS})`}</p>
					<div className={styles.scopeList}>
						{ApplicationTags.map((tag) => (
							<div key={tag} className={styles.scopeItem}>
								<Controller
									name={`tags.${tag}` as const}
									control={form.control}
									render={({field}) => (
										<Checkbox
											checked={!!field.value}
											onChange={(checked) => field.onChange(checked)}
											disabled={!field.value && selectedTagCount >= APPLICATION_MAX_TAGS}
											size="small"
										>
											<span className={styles.scopeLabel}>{tag}</span>
										</Checkbox>
									)}
								/>
							</div>
						))}
					</div>
				</div>

				<Input
					{...form.register('privacyPolicyUrl', {
						validate: (value) => !value || URL_PATTERN.test(value.trim()) || t`Must be a valid http(s) URL`,
					})}
					label={t`Privacy Policy URL`}
					value={form.watch('privacyPolicyUrl')}
					placeholder={t`https://example.com/privacy`}
					error={form.formState.errors.privacyPolicyUrl?.message}
				/>

				<Input
					{...form.register('termsOfServiceUrl', {
						validate: (value) => !value || URL_PATTERN.test(value.trim()) || t`Must be a valid http(s) URL`,
					})}
					label={t`Terms of Service URL`}
					value={form.watch('termsOfServiceUrl')}
					placeholder={t`https://example.com/terms`}
					error={form.formState.errors.termsOfServiceUrl?.message}
				/>

				<Switch
					label={t`Public Bot`}
					description={t`Allow anyone to invite this bot to their communities.`}
					value={form.watch('botPublic')}
					onChange={(checked) => form.setValue('botPublic', checked, {shouldDirty: true})}
				/>

				<Switch
					label={t`Require OAuth2 code grant`}
					description={t`When enabled, inviting this bot requires a redirect URI and an authorization code.`}
					value={form.watch('botRequireCodeGrant')}
					onChange={(checked) => form.setValue('botRequireCodeGrant', checked, {shouldDirty: true})}
				/>

				<div className={styles.redirectList}>
					{redirectList.map((value, idx) => (
						<div key={idx} className={styles.redirectRow} data-first={idx === 0 ? 'true' : undefined}>
							<Input
								label={idx === 0 ? t`Redirect URIs` : undefined}
								value={value}
								onChange={(e) => onUpdateRedirect(idx, e.target.value)}
								placeholder={t`https://example.com/callback`}
							/>
							<div className={styles.redirectActions}>
								<button
									type="button"
									className={styles.redirectRemoveButton}
									onClick={() => onRemoveRedirect(idx)}
									disabled={idx === 0}
									aria-label={t`Remove redirect URI`}
								>
									<XIcon size={18} weight="bold" />
								</button>
							</div>
						</div>
					))}
					<Button variant="primary" fitContent className={styles.addRedirectButton} onClick={onAddRedirect}>
						{t`Add redirect`}
					</Button>
				</div>
			</div>
		</SectionCard>
	);
};
