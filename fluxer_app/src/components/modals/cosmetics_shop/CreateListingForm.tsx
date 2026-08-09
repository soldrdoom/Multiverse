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

import styles from '@app/components/modals/CosmeticsShopModal.module.css';
import {uploadListingImage} from '@app/services/cosmetics/CosmeticsService';
import CosmeticsStore from '@app/stores/CosmeticsStore';
import {
	PROFILE_SLOT_TYPES,
	RARITY_DEFAULT_MAX_SUPPLY,
	RARITY_LABELS,
	RARITY_ORDER,
	type Rarity,
	SLOT_LABELS,
} from '@app/utils/cosmetics/rarity';
import {Trans, useLingui} from '@lingui/react/macro';
import {ImageIcon, XIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useId, useRef, useState} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_COSMETIC_TYPES = [
	'avatar_frame',
	'profile_banner',
	'profile_effect',
	'badge',
	'name_effect',
	'chat_background',
	'channel_list_background',
] as const;

interface CreateListingFormProps {
	onCreated: () => void;
	onCancel: () => void;
}

export const CreateListingForm: React.FC<CreateListingFormProps> = ({onCreated, onCancel}) => {
	const {t} = useLingui();
	const idPrefix = useId();
	const nameId = `${idPrefix}-name`;
	const descriptionId = `${idPrefix}-description`;
	const typeId = `${idPrefix}-type`;
	const rarityId = `${idPrefix}-rarity`;
	const priceId = `${idPrefix}-price`;
	const maxSupplyId = `${idPrefix}-max-supply`;
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [cosmeticType, setCosmeticType] = useState<string>(ALL_COSMETIC_TYPES[0]);
	const [rarity, setRarity] = useState<string>('common');
	const [priceSol, setPriceSol] = useState('');
	// Blank means unlimited. Pre-filled with a rarity-based suggestion (see RARITY_DEFAULT_MAX_SUPPLY)
	// but never clobbered once the creator has typed into the field themselves — maxSupplyTouched
	// tracks that so switching rarity after a manual edit doesn't silently overwrite it.
	const [maxSupply, setMaxSupply] = useState('');
	const [maxSupplyTouched, setMaxSupplyTouched] = useState(false);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImageFile(file);
		setImagePreview(URL.createObjectURL(file));
	};

	const handleRarityChange = (nextRarity: string) => {
		setRarity(nextRarity);
		// Only auto-fill the suggestion while the creator hasn't typed into max supply themselves —
		// never clobber a value they already chose.
		if (!maxSupplyTouched) {
			const suggested = RARITY_DEFAULT_MAX_SUPPLY[nextRarity as Rarity] ?? null;
			setMaxSupply(suggested === null ? '' : String(suggested));
		}
	};

	const handleMaxSupplyChange = (value: string) => {
		setMaxSupplyTouched(true);
		setMaxSupply(value);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const priceLamports = Math.round(parseFloat(priceSol) * 1_000_000_000);
		if (!name.trim()) return setError(t`Name is required.`);
		if (!priceSol || Number.isNaN(priceLamports) || priceLamports <= 0)
			return setError(t`Enter a valid price greater than 0.`);

		let maxSupplyValue: number | null = null;
		if (maxSupply.trim() !== '') {
			const parsed = Number.parseInt(maxSupply, 10);
			if (Number.isNaN(parsed) || parsed <= 0) {
				return setError(t`Max supply must be a whole number greater than 0, or left blank for unlimited.`);
			}
			maxSupplyValue = parsed;
		}

		setError(null);
		setSaving(true);
		try {
			let imageUrl: string | null = null;
			if (imageFile) {
				setUploading(true);
				imageUrl = await uploadListingImage(imageFile);
				setUploading(false);
			}
			await CosmeticsStore.createListing({
				name: name.trim(),
				description: description.trim() || undefined,
				image_url: imageUrl ?? undefined,
				cosmetic_type: cosmeticType as (typeof ALL_COSMETIC_TYPES)[number],
				rarity: rarity as (typeof RARITY_ORDER)[number],
				price_lamports: priceLamports,
				max_supply: maxSupplyValue,
			});
			onCreated();
		} catch (err: unknown) {
			setUploading(false);
			setError(err instanceof Error ? err.message : t`Failed to create listing.`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form className={styles.createListingForm} onSubmit={(e) => void handleSubmit(e)}>
			<div className={styles.createListingHeader}>
				<span className={styles.createListingTitle}>
					<Trans>New Listing</Trans>
				</span>
				<button type="button" className={styles.createListingClose} onClick={onCancel} aria-label={t`Cancel`}>
					<XIcon size={16} weight="bold" />
				</button>
			</div>

			<div className={styles.imageUploadRow}>
				<button
					type="button"
					className={styles.imageUploadBox}
					onClick={() => fileInputRef.current?.click()}
					style={imagePreview ? {backgroundImage: `url(${imagePreview})`} : undefined}
				>
					{!imagePreview && <ImageIcon size={28} weight="duotone" className={styles.imageUploadIcon} />}
					{!imagePreview && (
						<span className={styles.imageUploadLabel}>
							<Trans>Upload art</Trans>
						</span>
					)}
				</button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
					className={styles.hiddenFileInput}
					onChange={handleImageChange}
				/>
			</div>

			<div className={styles.formField}>
				<label className={styles.formLabel} htmlFor={nameId}>
					<Trans>Name</Trans>
				</label>
				<input
					id={nameId}
					className={styles.formInput}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={t`e.g. Neon Flame Avatar Frame`}
					maxLength={80}
					required
				/>
			</div>

			<div className={styles.formField}>
				<label className={styles.formLabel} htmlFor={descriptionId}>
					<Trans>Description</Trans> <span className={styles.formLabelOptional}>{t`(optional)`}</span>
				</label>
				<textarea
					id={descriptionId}
					className={styles.formTextarea}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder={t`Describe your cosmetic…`}
					maxLength={300}
					rows={2}
				/>
			</div>

			<div className={styles.formRow}>
				<div className={styles.formField}>
					<label className={styles.formLabel} htmlFor={typeId}>
						<Trans>Type</Trans>
					</label>
					<select
						id={typeId}
						className={styles.formSelect}
						value={cosmeticType}
						onChange={(e) => setCosmeticType(e.target.value)}
					>
						<optgroup label={t`PROFILE`}>
							{ALL_COSMETIC_TYPES.filter((type) => PROFILE_SLOT_TYPES.has(type)).map((type) => (
								<option key={type} value={type}>
									{SLOT_LABELS[type] ?? type}
								</option>
							))}
						</optgroup>
						<optgroup label={t`SERVER`}>
							{ALL_COSMETIC_TYPES.filter((type) => !PROFILE_SLOT_TYPES.has(type)).map((type) => (
								<option key={type} value={type}>
									{SLOT_LABELS[type] ?? type}
								</option>
							))}
						</optgroup>
					</select>
				</div>
				<div className={styles.formField}>
					<label className={styles.formLabel} htmlFor={rarityId}>
						<Trans>Rarity</Trans>
					</label>
					<select
						id={rarityId}
						className={styles.formSelect}
						value={rarity}
						onChange={(e) => handleRarityChange(e.target.value)}
					>
						{[...RARITY_ORDER].reverse().map((r) => (
							<option key={r} value={r}>
								{RARITY_LABELS[r]}
							</option>
						))}
					</select>
				</div>
				<div className={styles.formField}>
					<label className={styles.formLabel} htmlFor={priceId}>
						<Trans>Price (SOL)</Trans>
					</label>
					<input
						id={priceId}
						className={styles.formInput}
						type="number"
						min="0.001"
						step="0.001"
						value={priceSol}
						onChange={(e) => setPriceSol(e.target.value)}
						placeholder="0.50"
						required
					/>
				</div>
			</div>

			<div className={styles.formField}>
				<label className={styles.formLabel} htmlFor={maxSupplyId}>
					<Trans>Max Supply</Trans> <span className={styles.formLabelOptional}>{t`(optional)`}</span>
				</label>
				<input
					id={maxSupplyId}
					className={styles.formInput}
					type="number"
					min="1"
					step="1"
					value={maxSupply}
					onChange={(e) => handleMaxSupplyChange(e.target.value)}
					placeholder={t`Unlimited`}
				/>
				<p className={styles.formHint}>
					<Trans>
						The most this item can ever be minted. We suggest a cap based on rarity, but it's just a suggestion — change
						it or leave it blank for unlimited.
					</Trans>
				</p>
			</div>

			{error != null && <p className={styles.formError}>{error}</p>}

			<div className={styles.formActions}>
				<button type="button" className={styles.formCancelBtn} onClick={onCancel} disabled={saving}>
					<Trans>Cancel</Trans>
				</button>
				<button type="submit" className={styles.formSubmitBtn} disabled={saving}>
					{saving ? uploading ? <Trans>Uploading…</Trans> : <Trans>Saving…</Trans> : <Trans>Create Draft</Trans>}
				</button>
			</div>
		</form>
	);
};
