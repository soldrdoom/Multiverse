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

import type {Breadcrumb, EventHint, ErrorEvent as SentryErrorEvent} from '@sentry/react';

/**
 * Data hygiene for outbound Sentry events.
 *
 * Three separate problems are handled here:
 *
 * 1. Single-use auth tokens travel in the URL fragment (`/reset#token=...`, `/verify#token=...`,
 *    `/authorize-ip#token=...`, `/wasntme#token=...`; see `packages/email/src/EmailService.tsx`).
 *    Sentry's `HttpContext` integration copies `document.location.href` -- fragment included -- into
 *    `event.request.url`, and the `history` breadcrumb handler copies the same location into
 *    `breadcrumb.data.from` / `breadcrumb.data.to`. We strip the entire fragment rather than
 *    allowlisting known parameter names, so a future `#code=` / `#ticket=` is covered for free.
 *
 * 2. Console breadcrumbs carry the raw arguments passed to `console.*`. `Logger` forwards every
 *    argument verbatim and the production floor is `Info`, so `HttpError` instances (with an
 *    unredacted `url`, plus `body` / `text` / `headers`) end up in `breadcrumb.data.arguments`.
 *    We drop those arguments entirely; `breadcrumb.message` (the joined string form) is kept.
 *
 * 3. DOM breadcrumbs embed element `id`, and the hardcoded attribute set
 *    `['aria-label', 'type', 'name', 'title', 'alt']`, into the selector string. On a chat client
 *    those hold member and channel display names. The attribute set is NOT configurable through
 *    `Sentry.init` (it is a literal inside `htmlTreeAsString`), so we rewrite the selector here --
 *    structurally, because the SDK writes attribute values unescaped. See `scrubDomSelector`.
 *
 * Everything in this module must be total: `beforeSend` runs on the error path, and throwing there
 * loses the event and can cascade.
 */

/** Placeholder left in place of dropped console-breadcrumb arguments, so triage knows they existed. */
export const CONSOLE_ARGUMENTS_PLACEHOLDER = '[redacted: console breadcrumb arguments are not transmitted]';

/** Guards the recursive sweep. Sentry normalizes events before `beforeSend`, so depth is already bounded. */
const MAX_SCRUB_DEPTH = 8;

/**
 * Keys whose value is a location in its entirety. These get the whole fragment removed, even when
 * the value does not look like a URL (e.g. a bare `#token=...` from an initial `pushState`).
 */
const LOCATION_KEYS: ReadonlySet<string> = new Set([
	'from',
	'to',
	'url',
	'href',
	'location',
	'origin',
	'path',
	'pathname',
	'referer',
	'referrer',
	'request_url',
	'response_url',
	'http.url',
	'page',
]);

/**
 * Matches a URL or absolute path immediately followed by a fragment, capturing the part before `#`.
 * Deliberately requires a scheme or a leading `/` so that ordinary text containing `#` (a `#channel`
 * mention, a markdown heading, a colour literal) is left alone.
 */
const EMBEDDED_URL_FRAGMENT_PATTERN = /((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s"'<>`]*?)#[^\s"'<>`]*/gi;

/** Stands in for every `[attr="value"]` group dropped from a DOM selector. Contains no `[` or `#`. */
const SELECTOR_ATTRIBUTES_REDACTED = '{attrs-redacted}';

/** Stands in for an element `id`. Contains no `[`, and the `{` blocks the id pattern from re-matching. */
const SELECTOR_ID_REDACTED = '#{id-redacted}';

/** The `#id` component of a Sentry DOM selector. `{`/`}` are excluded so the pass is idempotent. */
const SELECTOR_ID_PATTERN = /#[^\s.#>[\]{}]+/g;

/**
 * Characters that can legitimately appear in the tag / `#id` / `.class` / ` > ` portion of a Sentry
 * DOM selector. Used to reject a trailing fragment that does not look like a path.
 */
const SAFE_SELECTOR_PATH_PATTERN = /^[A-Za-z0-9 >#._:-]*$/;

/**
 * Builds the `Sentry.setUser` payload. Deliberately never includes `email`: the scope user rides on
 * every transmitted event, and the email address is a contactable, account-recovery identifier.
 * `username` is kept -- it is already visible to anyone sharing a channel with the user, and without
 * it a report cannot be tied back to an account during triage.
 */
export function buildSentryUser(user: {id: string; username: string}): {id: string; username: string} {
	return {id: user.id, username: user.username};
}

/** Removes everything from the first `#` onwards. For values that are known to be a location. */
export function stripUrlFragment(value: string): string {
	const fragmentIndex = value.indexOf('#');
	return fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
}

/** Removes fragments from any URL-looking substring inside free text (log lines, error messages). */
export function stripFragmentsInText(value: string): string {
	if (!value.includes('#')) {
		return value;
	}
	return value.replace(EMBEDDED_URL_FRAGMENT_PATTERN, '$1');
}

/**
 * Rewrites a Sentry DOM-breadcrumb selector so it keeps its structural path (tag names, CSS-module
 * class names) but loses everything that can hold a display name: the element `id` and *every*
 * `[attr="value"]` group.
 *
 * This is deliberately structural rather than pattern-based. `_htmlElementAsString`
 * (`@sentry/core/.../utils/browser.js:113-120`) writes attribute values **raw and unescaped** --
 * `out.push(`[${k}="${attr}"]`)` -- so a value containing `"` or `"]` makes the selector grammar
 * ambiguous and *no* regex over it is sound. Two facts about the format make a sound scrub possible:
 *
 *   - each element segment is `tag` + `#id` + `.class`* + `[attr="value"]`* (`out.join('')`), so
 *     every attribute group starts at or after the first `[` in the whole string; and
 *   - the last attribute group in the string ends at the last `"]`, so no attribute-value character
 *     can appear after it.
 *
 * We therefore keep only the prefix before the first `[` and the suffix after the last `"]`, both of
 * which are provably path text, and drop everything between them. The suffix is additionally checked
 * against `SAFE_SELECTOR_PATH_PATTERN` so nothing containing a quote, bracket or `=` is ever emitted.
 *
 * `[type="button"]` is lost along with the rest -- it cannot be located without parsing.
 */
export function scrubDomSelector(selector: string): string {
	let result = selector;

	const firstAttributeStart = result.indexOf('[');
	if (firstAttributeStart !== -1) {
		const head = result.slice(0, firstAttributeStart);
		const lastAttributeEnd = result.lastIndexOf('"]');
		const tail = lastAttributeEnd === -1 ? '' : result.slice(lastAttributeEnd + 2);
		const safeTail = SAFE_SELECTOR_PATH_PATTERN.test(tail) ? tail : '';
		result = `${head}${SELECTOR_ATTRIBUTES_REDACTED}${safeTail}`;
	}

	return result.replace(SELECTOR_ID_PATTERN, SELECTOR_ID_REDACTED);
}

function scrubValue(value: unknown, key: string | undefined, depth: number, seen: WeakSet<object>): unknown {
	if (typeof value === 'string') {
		if (key !== undefined && LOCATION_KEYS.has(key.toLowerCase())) {
			return stripUrlFragment(value);
		}
		return stripFragmentsInText(value);
	}

	if (value === null || typeof value !== 'object' || depth >= MAX_SCRUB_DEPTH || seen.has(value)) {
		return value;
	}
	seen.add(value);

	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			value[index] = scrubValue(value[index], key, depth + 1, seen);
		}
		return value;
	}

	const record = value as Record<string, unknown>;
	for (const recordKey of Object.keys(record)) {
		record[recordKey] = scrubValue(record[recordKey], recordKey, depth + 1, seen);
	}
	return record;
}

/** Applies the category-specific breadcrumb rules. Mutates and returns the breadcrumb. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	const category = typeof breadcrumb.category === 'string' ? breadcrumb.category : '';

	if (category === 'console') {
		const data = breadcrumb.data;
		if (data != null && typeof data === 'object' && 'arguments' in data) {
			(data as Record<string, unknown>)['arguments'] = CONSOLE_ARGUMENTS_PLACEHOLDER;
		}
	}

	if (category.startsWith('ui.') && typeof breadcrumb.message === 'string') {
		breadcrumb.message = scrubDomSelector(breadcrumb.message);
	}

	return breadcrumb;
}

/**
 * Strips location fragments and PII out of an outbound event. Mutates and returns the event, which
 * is safe: Sentry hands `beforeSend` a prepared, already-normalized copy.
 */
export function scrubSentryEvent(event: SentryErrorEvent): SentryErrorEvent {
	const seen = new WeakSet<object>();

	if (typeof event.transaction === 'string') {
		event.transaction = stripUrlFragment(event.transaction);
	}
	// `culprit` is not on the current `ErrorEvent` type but is still accepted by the ingest API and
	// can be populated by other code paths, so scrub it defensively.
	const loose = event as unknown as Record<string, unknown>;
	if (typeof loose['culprit'] === 'string') {
		loose['culprit'] = stripFragmentsInText(loose['culprit']);
	}
	if (typeof event.message === 'string') {
		event.message = stripFragmentsInText(event.message);
	}

	if (Array.isArray(event.breadcrumbs)) {
		for (const breadcrumb of event.breadcrumbs) {
			if (breadcrumb != null && typeof breadcrumb === 'object') {
				scrubBreadcrumb(breadcrumb);
			}
		}
	}

	// Generic sweep over every container that can hold a location, including ones added by future
	// SDK versions or integrations. `user` / `logentry` / `fingerprint` are safe by construction
	// today (`buildSentryUser` returns a fresh literal, nothing calls `setFingerprint`, and
	// `logentry` only appears for parameterized `captureMessage`) -- they are swept anyway so that
	// this stays true if a future caller starts populating them.
	scrubValue(event.request, 'request', 0, seen);
	scrubValue(event.breadcrumbs, 'breadcrumbs', 0, seen);
	scrubValue(event.exception, 'exception', 0, seen);
	scrubValue(event.extra, 'extra', 0, seen);
	scrubValue(event.contexts, 'contexts', 0, seen);
	scrubValue(event.tags, 'tags', 0, seen);
	scrubValue(event.user, 'user', 0, seen);
	scrubValue(event.logentry, 'logentry', 0, seen);
	scrubValue(event.fingerprint, 'fingerprint', 0, seen);

	return event;
}

/**
 * Known-noise errors that should never reach Sentry:
 * - `HTTPResponseError` (every non-2xx API response surfaces as one)
 * - `TimeoutError`
 * - the blob-worker `importScripts` `NetworkError`
 */
export function isFilteredSentryNoise(hint: EventHint | undefined): boolean {
	const error = hint?.originalException;
	if (!(error instanceof Error)) {
		return false;
	}

	if (error.name === 'HTTPResponseError' || error.name === 'TimeoutError') {
		return true;
	}

	return (
		error.name === 'NetworkError' &&
		typeof error.message === 'string' &&
		error.message.includes("Failed to execute 'importScripts' on 'WorkerGlobalScope'") &&
		error.message.includes('blob:')
	);
}

/**
 * `beforeSend` handler. Never throws: if scrubbing fails for any reason the event is dropped rather
 * than transmitted unscrubbed (fail closed) and rather than rethrown (which would cascade).
 */
export function sentryBeforeSend(event: SentryErrorEvent, hint: EventHint): SentryErrorEvent | null {
	try {
		if (isFilteredSentryNoise(hint)) {
			return null;
		}
		return scrubSentryEvent(event);
	} catch {
		return null;
	}
}
