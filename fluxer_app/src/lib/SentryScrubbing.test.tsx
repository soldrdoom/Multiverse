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

import {HttpError} from '@app/lib/HttpError';
import {
	buildSentryUser,
	CONSOLE_ARGUMENTS_PLACEHOLDER,
	isFilteredSentryNoise,
	scrubDomSelector,
	scrubSentryEvent,
	sentryBeforeSend,
	stripFragmentsInText,
	stripUrlFragment,
} from '@app/lib/SentryScrubbing';
import type {EventHint, ErrorEvent as SentryErrorEvent} from '@sentry/react';
import {describe, expect, test} from 'vitest';

const SECRET_TOKEN = 'aVeryRealResetToken1234567890';

const emptyHint: EventHint = {};

function makeEvent(overrides: Partial<SentryErrorEvent> = {}): SentryErrorEvent {
	return {type: undefined, ...overrides} as SentryErrorEvent;
}

describe('buildSentryUser - H2: no email on the scope user', () => {
	test('keeps id and username, drops email', () => {
		const user = buildSentryUser({
			id: '1234567890',
			username: 'testuser',
			email: 'victim@example.com',
		} as never);
		expect(user).toEqual({id: '1234567890', username: 'testuser'});
		expect(Object.keys(user)).not.toContain('email');
		expect(JSON.stringify(user)).not.toContain('victim@example.com');
	});
});

describe('stripUrlFragment', () => {
	test('removes the fragment from an absolute URL', () => {
		expect(stripUrlFragment(`https://multiverse.forum/reset#token=${SECRET_TOKEN}`)).toBe(
			'https://multiverse.forum/reset',
		);
	});

	test('removes the fragment from a relative path', () => {
		expect(stripUrlFragment(`/verify#token=${SECRET_TOKEN}`)).toBe('/verify');
	});

	test('removes a bare fragment entirely', () => {
		expect(stripUrlFragment(`#token=${SECRET_TOKEN}`)).toBe('');
	});

	test('preserves the query string', () => {
		expect(stripUrlFragment(`/reset?src=email#token=${SECRET_TOKEN}`)).toBe('/reset?src=email');
	});

	test('leaves fragment-free URLs untouched', () => {
		expect(stripUrlFragment('https://multiverse.forum/channels/1/2')).toBe('https://multiverse.forum/channels/1/2');
	});
});

describe('stripFragmentsInText', () => {
	test('strips a fragment out of an embedded URL', () => {
		expect(stripFragmentsInText(`navigating to https://multiverse.forum/reset#token=${SECRET_TOKEN} now`)).toBe(
			'navigating to https://multiverse.forum/reset now',
		);
	});

	test('strips fragments from multiple URLs in one string', () => {
		expect(stripFragmentsInText(`from /a#token=${SECRET_TOKEN} to /b#token=${SECRET_TOKEN}`)).toBe('from /a to /b');
	});

	test('leaves non-location text containing # alone', () => {
		expect(stripFragmentsInText('mentioned #general and used colour #ff00aa')).toBe(
			'mentioned #general and used colour #ff00aa',
		);
	});
});

describe('scrubSentryEvent - H1: fragment-bearing locations', () => {
	test('strips the fragment from event.request.url', () => {
		const event = scrubSentryEvent(
			makeEvent({request: {url: `https://multiverse.forum/reset#token=${SECRET_TOKEN}`, headers: {}}}),
		);
		expect(event.request?.url).toBe('https://multiverse.forum/reset');
	});

	test('strips the fragment from the Referer header', () => {
		const event = scrubSentryEvent(
			makeEvent({
				request: {
					url: 'https://multiverse.forum/reset',
					headers: {
						Referer: `https://multiverse.forum/verify#token=${SECRET_TOKEN}`,
						'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Vitest',
					},
				},
			}),
		);
		expect(event.request?.headers?.['Referer']).toBe('https://multiverse.forum/verify');
		expect(event.request?.headers?.['User-Agent']).toBe('Mozilla/5.0 (X11; Linux x86_64) Vitest');
	});

	test('strips fragments from history breadcrumb from/to', () => {
		const event = scrubSentryEvent(
			makeEvent({
				breadcrumbs: [
					{
						category: 'navigation',
						data: {from: `/reset#token=${SECRET_TOKEN}`, to: `/authorize-ip#token=${SECRET_TOKEN}`},
					},
				],
			}),
		);
		expect(event.breadcrumbs?.[0]?.data).toEqual({from: '/reset', to: '/authorize-ip'});
	});

	test('strips fragments from fetch/xhr breadcrumb urls', () => {
		const event = scrubSentryEvent(
			makeEvent({
				breadcrumbs: [
					{category: 'fetch', type: 'http', data: {method: 'GET', url: `/api/v1/x#token=${SECRET_TOKEN}`}},
					{category: 'xhr', type: 'http', data: {method: 'POST', url: `/api/v1/y#token=${SECRET_TOKEN}`}},
				],
			}),
		);
		expect(event.breadcrumbs?.[0]?.data?.['url']).toBe('/api/v1/x');
		expect(event.breadcrumbs?.[1]?.data?.['url']).toBe('/api/v1/y');
	});

	test('strips the fragment from event.transaction and exception values', () => {
		const event = scrubSentryEvent(
			makeEvent({
				transaction: `/wasntme#token=${SECRET_TOKEN}`,
				exception: {
					values: [
						{
							type: 'TypeError',
							value: `failed on https://multiverse.forum/reset#token=${SECRET_TOKEN}`,
							stacktrace: {
								frames: [{filename: `https://multiverse.forum/assets/x.js#token=${SECRET_TOKEN}`}],
							},
						},
					],
				},
			}),
		);
		expect(event.transaction).toBe('/wasntme');
		expect(event.exception?.values?.[0]?.value).toBe('failed on https://multiverse.forum/reset');
		expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
			'https://multiverse.forum/assets/x.js',
		);
	});

	test('no #token= value survives anywhere in a realistic event', () => {
		const href = `https://multiverse.forum/reset#token=${SECRET_TOKEN}`;
		const event = scrubSentryEvent(
			makeEvent({
				message: `bootstrapping at ${href}`,
				transaction: `/reset#token=${SECRET_TOKEN}`,
				...({culprit: href} as Partial<SentryErrorEvent>),
				request: {url: href, headers: {Referer: href, 'User-Agent': 'Vitest'}},
				exception: {values: [{type: 'Error', value: `boom at ${href}`}]},
				extra: {currentHref: href, nested: {deep: {alsoHere: href}}},
				contexts: {build: {sha: 'abc'}, page: {url: href}},
				tags: {lastRoute: `/reset#token=${SECRET_TOKEN}`},
				breadcrumbs: [
					{category: 'navigation', data: {from: '/login', to: `/reset#token=${SECRET_TOKEN}`}},
					{category: 'fetch', data: {method: 'GET', url: href}},
					{category: 'ui.click', message: `button[aria-label="Reset ${SECRET_TOKEN}"]`},
					{category: 'console', message: `navigating to ${href}`, data: {logger: 'console', arguments: [href]}},
				],
			}),
		);

		expect(JSON.stringify(event)).not.toContain(SECRET_TOKEN);
		expect(JSON.stringify(event)).not.toContain('#token=');
	});
});

describe('scrubSentryEvent - M1: console breadcrumb arguments', () => {
	test('drops console-breadcrumb arguments carrying an HttpError payload', () => {
		const httpError = new HttpError({
			method: 'GET',
			url: 'https://multiverse.forum/api/v1/users/@me/settings?secret=1',
			ok: false,
			status: 500,
			body: {email: 'victim@example.com'},
			text: '{"email":"victim@example.com"}',
			headers: {'content-type': 'application/json'},
		});

		// Mirrors what the Breadcrumbs integration stores after normalization.
		const normalizedArgument = {
			name: httpError.name,
			message: httpError.message,
			method: httpError.method,
			url: httpError.url,
			ok: httpError.ok,
			status: httpError.status,
			body: httpError.body,
			text: httpError.text,
			headers: httpError.headers,
		};

		const event = scrubSentryEvent(
			makeEvent({
				breadcrumbs: [
					{
						category: 'console',
						level: 'error',
						message: '[00:00:00] [http] [Error] request failed',
						data: {logger: 'console', arguments: [normalizedArgument]},
					},
				],
			}),
		);

		expect(event.breadcrumbs?.[0]?.data?.['arguments']).toBe(CONSOLE_ARGUMENTS_PLACEHOLDER);
		const serialized = JSON.stringify(event);
		expect(serialized).not.toContain('victim@example.com');
		expect(serialized).not.toContain('secret=1');
		expect(event.breadcrumbs?.[0]?.message).toBe('[00:00:00] [http] [Error] request failed');
	});

	test('HttpError.headers is a response header map, so it carries no Authorization value', () => {
		// The constructor only ever receives response headers; assert the field is not sourced from
		// request headers by confirming the class exposes exactly the response-side fields.
		const httpError = new HttpError({
			method: 'GET',
			url: 'https://multiverse.forum/api/v1/x',
			ok: false,
			status: 401,
			headers: {'content-type': 'application/json', 'www-authenticate': 'Bearer'},
		});
		expect(Object.keys(httpError.headers ?? {})).not.toContain('authorization');
		// The message redacts digits but NOT the `url` field -- which is why the arguments are dropped.
		expect(httpError.url).toContain('/api/v1/x');
		expect(httpError.message).toBe('GET https://multiverse.forum/api/vxxx/x [401]');
	});

	test('leaves non-console breadcrumb data intact', () => {
		const event = scrubSentryEvent(
			makeEvent({breadcrumbs: [{category: 'fetch', data: {method: 'GET', url: '/api/v1/x', status_code: 500}}]}),
		);
		expect(event.breadcrumbs?.[0]?.data).toEqual({method: 'GET', url: '/api/v1/x', status_code: 500});
	});
});

describe('scrubDomSelector - M2: DOM breadcrumb display names', () => {
	test('drops every attribute group but keeps the tag/class path', () => {
		const selector =
			'div.sidebar > li#member-84512 > button._btn_a1b2[aria-label="Message xXDarkLordXx"][type="button"][title="xXDarkLordXx"]';
		expect(scrubDomSelector(selector)).toBe('div.sidebar > li#{id-redacted} > button._btn_a1b2{attrs-redacted}');
	});

	test('redacts alt text on avatars', () => {
		expect(scrubDomSelector('img._avatar[alt="Jane Q. Public"]')).toBe('img._avatar{attrs-redacted}');
	});

	test('control: a plain quoted value is still redacted', () => {
		// The gate's control probe. The output shape changed (attribute groups are now dropped
		// wholesale rather than value-redacted) but the leak check is the same.
		const scrubbed = scrubDomSelector('div#msg-123[title="Alice: my email is a@b.com"]');
		expect(scrubbed).toBe('div#{id-redacted}{attrs-redacted}');
		expect(scrubbed).not.toContain('a@b.com');
		expect(scrubbed).not.toContain('msg-123');
	});

	// F1: the SDK writes attribute values raw and unescaped
	// (`@sentry/core/.../utils/browser.js:113`), so a value containing `"` or `"]` defeats any
	// regex-based scrub. These three probes are the regression guard.
	test('F1: a double quote inside aria-label does not defeat the scrub', () => {
		const scrubbed = scrubDomSelector('button[aria-label="Say "hi" to Bob Smith"]');
		expect(scrubbed).toBe('button{attrs-redacted}');
		expect(scrubbed).not.toContain('Bob Smith');
		expect(scrubbed).not.toContain('hi');
	});

	test('F1: a double quote inside alt does not defeat the scrub', () => {
		const scrubbed = scrubDomSelector('img[alt="avatar of Bob "Bobby" Smith"]');
		expect(scrubbed).toBe('img{attrs-redacted}');
		expect(scrubbed).not.toContain('Bobby');
		expect(scrubbed).not.toContain('Smith');
	});

	test('F1: a value containing `"]` does not truncate the match early', () => {
		const scrubbed = scrubDomSelector('button[aria-label="close "] > div.evil-Bob"]');
		expect(scrubbed).toBe('button{attrs-redacted}');
		expect(scrubbed).not.toContain('evil-Bob');
	});

	test('F1: a value containing the ` > ` segment separator cannot forge a path', () => {
		const scrubbed = scrubDomSelector('li._row[title="Alice > Bob > Carol"]');
		expect(scrubbed).toBe('li._row{attrs-redacted}');
		expect(scrubbed).not.toContain('Alice');
		expect(scrubbed).not.toContain('Carol');
	});

	test('keeps the descendant path when only an ancestor carries attributes', () => {
		expect(scrubDomSelector('div._a[title="Bob"] > button._b')).toBe('div._a{attrs-redacted} > button._b');
	});

	test('drops a trailing fragment that does not look like a path', () => {
		// If a value smuggles a `"]` such that the remainder is not path-shaped, the remainder is
		// discarded rather than emitted.
		const scrubbed = scrubDomSelector('div[title="x"] > span="leak me"]not/a/path');
		expect(scrubbed).toBe('div{attrs-redacted}');
		expect(scrubbed).not.toContain('leak me');
	});

	test('leaves an attribute-free selector alone apart from the id', () => {
		expect(scrubDomSelector('div.sidebar > button._btn_a1b2')).toBe('div.sidebar > button._btn_a1b2');
		expect(scrubDomSelector('SentryComponentName')).toBe('SentryComponentName');
	});

	test('is idempotent', () => {
		for (const selector of [
			'li#member-1[aria-label="Someone"]',
			'button[aria-label="Say "hi" to Bob Smith"]',
			'div._a[title="Bob"] > button._b',
			'div.sidebar > button._btn',
		]) {
			const once = scrubDomSelector(selector);
			expect(scrubDomSelector(once)).toBe(once);
		}
	});

	test('applies to ui.* breadcrumbs through scrubSentryEvent', () => {
		const event = scrubSentryEvent(
			makeEvent({
				breadcrumbs: [
					{category: 'ui.click', message: 'li#channel-42[aria-label="#secret-project"]'},
					{category: 'ui.input', message: 'input[name="dm-to-Alice"][type="text"]'},
					{category: 'ui.click', message: 'button[aria-label="DM "Bob" Smith"]'},
				],
			}),
		);
		expect(event.breadcrumbs?.[0]?.message).toBe('li#{id-redacted}{attrs-redacted}');
		expect(event.breadcrumbs?.[1]?.message).toBe('input{attrs-redacted}');
		expect(event.breadcrumbs?.[2]?.message).toBe('button{attrs-redacted}');
		expect(JSON.stringify(event)).not.toContain('secret-project');
		expect(JSON.stringify(event)).not.toContain('Alice');
		expect(JSON.stringify(event)).not.toContain('Bob');
	});
});

describe('scrubDomSelector - F1: adversarial attribute values never survive', () => {
	// `MARKER` stands in for the user-controlled part of a display name. It appears nowhere in the
	// developer-controlled path, so finding it in the output is unambiguously a leak.
	const MARKER = 'ZzSecretDisplayNameZz';

	const ADVERSARIAL_VALUES = [
		MARKER,
		`Say "hi" to ${MARKER}`,
		`avatar of Bob "${MARKER}" Smith`,
		`${MARKER}"`,
		`"${MARKER}`,
		`x"] > div.${MARKER}`,
		`x"]${MARKER}`,
		`"]${MARKER}"]`,
		`${MARKER} > Bob > Carol`,
		`[${MARKER}]`,
		`a"][title="${MARKER}`,
		`${MARKER}#channel`,
		`"]`.repeat(4) + MARKER,
		`${MARKER}\n${MARKER}`,
		`   ${MARKER}   `,
	];

	const ATTRIBUTE_NAMES = ['aria-label', 'title', 'alt', 'name'];

	const TEMPLATES: Array<(group: string) => string> = [
		(group) => `button${group}`,
		(group) => `div.sidebar > li#member-84512 > button._btn_a1b2${group}`,
		(group) => `div._a${group} > button._b`,
		(group) => `div._a${group} > button._b[type="button"]`,
		(group) => `li#row-7${group}${group}`,
		(group) => `div.a > span${group} > em._x > b`,
	];

	test('no adversarial value survives any attribute/template combination', () => {
		let combinations = 0;
		for (const value of ADVERSARIAL_VALUES) {
			for (const attribute of ATTRIBUTE_NAMES) {
				for (const template of TEMPLATES) {
					const selector = template(`[${attribute}="${value}"]`);
					const scrubbed = scrubDomSelector(selector);
					combinations++;
					expect(scrubbed, `leaked from: ${selector}`).not.toContain(MARKER);
					// Nothing quoted, bracketed or `=`-bearing is ever emitted.
					expect(scrubbed, `unsafe chars from: ${selector}`).not.toMatch(/["'=[\]]/);
					// Still idempotent under every one of these inputs.
					expect(scrubDomSelector(scrubbed)).toBe(scrubbed);
				}
			}
		}
		expect(combinations).toBe(ADVERSARIAL_VALUES.length * ATTRIBUTE_NAMES.length * TEMPLATES.length);
	});
});

describe('scrubSentryEvent - F4: user, logentry and fingerprint are swept', () => {
	test('sweeps event.user, event.logentry and event.fingerprint', () => {
		const event = scrubSentryEvent(
			makeEvent({
				user: {id: '1', username: 'bob', ip_address: '203.0.113.9'},
				logentry: {message: `opened https://multiverse.forum/reset#token=${SECRET_TOKEN}`},
				fingerprint: [`/reset#token=${SECRET_TOKEN}`],
			}),
		);
		expect(event.logentry?.message).toBe('opened https://multiverse.forum/reset');
		expect(event.fingerprint?.[0]).toBe('/reset');
		expect(event.user?.username).toBe('bob');
		expect(JSON.stringify(event)).not.toContain(SECRET_TOKEN);
	});
});

describe('isFilteredSentryNoise / sentryBeforeSend - noise filters still fire', () => {
	test('drops HTTPResponseError', () => {
		const hint: EventHint = {originalException: new HttpError({method: 'GET', url: '/x', ok: false, status: 500})};
		expect(hint.originalException).toBeInstanceOf(Error);
		expect((hint.originalException as Error).name).toBe('HTTPResponseError');
		expect(isFilteredSentryNoise(hint)).toBe(true);
		expect(sentryBeforeSend(makeEvent(), hint)).toBeNull();
	});

	test('drops TimeoutError', () => {
		const error = new Error('timed out');
		error.name = 'TimeoutError';
		expect(sentryBeforeSend(makeEvent(), {originalException: error})).toBeNull();
	});

	test('drops the blob-worker importScripts NetworkError', () => {
		const error = new Error(
			"Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:https://multiverse.forum/abc' failed to load.",
		);
		error.name = 'NetworkError';
		expect(sentryBeforeSend(makeEvent(), {originalException: error})).toBeNull();
	});

	test('does not drop a plain NetworkError without the importScripts/blob markers', () => {
		const error = new Error('connection reset');
		error.name = 'NetworkError';
		expect(sentryBeforeSend(makeEvent(), {originalException: error})).not.toBeNull();
	});

	test('keeps ordinary errors and scrubs them', () => {
		const event = sentryBeforeSend(
			makeEvent({request: {url: `https://multiverse.forum/reset#token=${SECRET_TOKEN}`}}),
			{originalException: new TypeError('boom')},
		);
		expect(event).not.toBeNull();
		expect(event?.request?.url).toBe('https://multiverse.forum/reset');
	});
});

describe('sentryBeforeSend - robustness', () => {
	test('never throws on an empty event or empty hint', () => {
		expect(() => sentryBeforeSend(makeEvent(), emptyHint)).not.toThrow();
		expect(sentryBeforeSend(makeEvent(), emptyHint)).not.toBeNull();
	});

	test('tolerates a missing request and missing breadcrumbs', () => {
		const event = sentryBeforeSend(makeEvent({message: 'hello'}), emptyHint);
		expect(event?.request).toBeUndefined();
		expect(event?.breadcrumbs).toBeUndefined();
	});

	test('tolerates null-ish breadcrumb entries and non-string fields', () => {
		const event = makeEvent({
			breadcrumbs: [null as never, {category: 'ui.click'}, {category: 'console', data: {logger: 'console'}}],
			request: {url: undefined as never, headers: undefined},
		});
		expect(() => sentryBeforeSend(event, emptyHint)).not.toThrow();
	});

	test('tolerates a self-referential object without recursing forever', () => {
		const cyclic: Record<string, unknown> = {href: `/reset#token=${SECRET_TOKEN}`};
		cyclic['self'] = cyclic;
		const event = sentryBeforeSend(makeEvent({extra: {cyclic}}), emptyHint);
		expect(event).not.toBeNull();
		expect((event?.extra?.['cyclic'] as Record<string, unknown>)['href']).toBe('/reset');
	});

	test('fails closed (drops the event) if scrubbing throws', () => {
		const hostile = makeEvent();
		Object.defineProperty(hostile, 'breadcrumbs', {
			get() {
				throw new Error('boom');
			},
		});
		expect(() => sentryBeforeSend(hostile, emptyHint)).not.toThrow();
		expect(sentryBeforeSend(hostile, emptyHint)).toBeNull();
	});
});
