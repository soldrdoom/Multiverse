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

import createDOMPurify, {type Config} from 'dompurify';
import {JSDOM} from 'jsdom';

/**
 * Sanitizes creator-uploaded `image/svg+xml` cosmetic listing images
 * (`POST /creators/@me/listings/upload-image`, CosmeticsController.tsx) before they are
 * ever handed to storage.
 *
 * Why this exists, and what it's actually defending against: in-app rendering of
 * listing images always goes through `<img src=...>` (BaseAvatar.tsx, ShopItemCard.tsx,
 * admin CreatorListingsPage.tsx), never `dangerouslySetInnerHTML`, so an `<img>` tag
 * cannot execute embedded SVG `<script>`/event handlers on its own. The actual risk is
 * that the raw uploaded file is served back from `Config.endpoints.staticCdn`, which on
 * this deployment (config.json's `domain.static_cdn_domain`, falling back to
 * `CdnEndpoints.STATIC_HOST`) is the *same origin* as the main app
 * (`multiverse.forum`) — see `fluxer_server/src/Routes.tsx:129-140`. If that URL is ever
 * opened as a top-level navigation (right-click "open image in new tab", a shared raw
 * link, etc.) the browser treats it as its own SVG *document* and will execute any
 * inline `<script>`/`on*` handler/`javascript:` URI that survives, in that document's
 * own same-origin, cookie-bearing context. That direct-navigation case — not the
 * in-app `<img>` rendering — is what this sanitizer closes.
 *
 * Approach: DOMPurify (allowlist-based, actively maintained, specifically hardened
 * against SVG/MathML mutation-XSS bypasses that plain regex stripping is well known to
 * miss) running against a jsdom `window`, since DOMPurify needs a DOM implementation
 * and this runs server-side in Node, not a browser.
 */

// One jsdom window + one DOMPurify instance for the process lifetime. jsdom windows are
// relatively expensive to construct; `sanitize()` itself is synchronous, and Node is
// single-threaded, so concurrent upload requests can't interleave mid-sanitize and
// there's no need to build a fresh window per call.
const sanitizerWindow = new JSDOM('').window;
const purifier = createDOMPurify(sanitizerWindow as unknown as Window & typeof globalThis);

const URI_BEARING_ATTRS = new Set(['href', 'xlink:href', 'src']);

// Matches a single CSS "escaped code point" per the CSS Syntax Level 3 tokenizer
// algorithm: a backslash followed by either 1-6 hex digits (optionally followed by one
// consumed-but-discarded whitespace char that only serves to terminate the hex run), or
// a backslash followed by any other single non-newline character, which decodes to that
// character literally. A backslash immediately followed by a newline (or at end of
// input) is not a valid escape outside a string and is intentionally left unmatched
// here, so it survives untouched rather than being folded into whatever follows it.
const CSS_ESCAPE_RE = /\\(?:([0-9a-fA-F]{1,6})(\r\n|[ \t\n\f])?|([^\n]))/g;

/**
 * Decodes CSS backslash-escapes (`\75 ` / `\75rl` for `u`, `\69mport` for `import`, etc.)
 * to their literal characters, exactly as every CSS tokenizer (browsers included) does
 * before ever looking at identifier/at-keyword/url-token content.
 *
 * This exists because `stripDangerousCss` below matches `@import`/`url(...)` as literal
 * substrings against raw, undecoded CSS text. CSS identifiers and at-keywords may embed
 * escaped code points that tokenize identically to their unescaped form in every
 * browser — `@\69mport \75rl(...)` is indistinguishable from `@import url(...)` once
 * actually parsed — so without this decoding pass first, that literal-substring
 * matching can be trivially defeated while still producing a live `@import`/`url()`
 * reference in the browser's eyes. Decoding first and then running the existing regexes
 * against the decoded text closes that gap without changing what the regexes match.
 *
 * Decoding is semantically transparent for any legitimate CSS that happens to use
 * escapes for unrelated reasons (e.g. an escaped character in a class selector) —
 * decoded and escaped forms mean exactly the same thing to any CSS parser — so this
 * never changes rendering for honest input.
 */
function decodeCssEscapes(css: string): string {
	return css.replace(CSS_ESCAPE_RE, (_match, hex: string | undefined, _ws: string | undefined, literal: string | undefined) => {
		if (hex !== undefined) {
			const codePoint = Number.parseInt(hex, 16);
			if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
				return '�';
			}
			return String.fromCodePoint(codePoint);
		}
		return literal ?? '';
	});
}

/**
 * Strips `@import` rules and any `url(...)` reference that isn't a same-document
 * `#fragment` from a chunk of CSS text. Applied to both `<style>` element content and
 * inline `style="..."` attribute values (see hooks below) — DOMPurify does not parse
 * CSS itself, so neither location gets any off-origin-reference filtering for free.
 * `@keyframes`/`animation`/selectors/colors/transforms are left completely untouched;
 * that's the entire reason `<style>` is allowed in the first place.
 *
 * CSS escapes are decoded first (see `decodeCssEscapes`) so `@import`/`url(` spelled
 * out via `\XX` escapes can't slip past the literal-substring matching below.
 */
function stripDangerousCss(css: string): string {
	const decoded = decodeCssEscapes(css);
	const withoutImports = decoded.replace(/@import\b[^;]*;?/gi, '');
	return withoutImports.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (full, _quote: string, target: string) =>
		target.trim().startsWith('#') ? full : 'none',
	);
}

// Restrict href/xlink:href/src to same-document fragment references (`#some-id`) only.
//
// This is deliberately implemented as an `uponSanitizeAttribute` hook targeting these
// three attribute names, rather than DOMPurify's global `ALLOWED_URI_REGEXP` config
// option. That option is tested against the *value* of every attribute whose name
// isn't in DOMPurify's small fixed "URI-safe" allowlist (class/id/style/xmlns/etc. —
// notably NOT `cx`/`r`/`viewBox`/`filter`/`stdDeviation`/most SVG geometry and
// presentation attributes), so tightening it globally strips ordinary, harmless
// geometry attributes on every element along with actual URI references — confirmed
// by testing against the reference frame file before landing on this approach.
//
// These frames have no legitimate reason to reference anything off-origin: no
// external images, no external stylesheets, no cross-document `<use>`. Everything the
// animation needs (gradients, filters, glow nodes referenced via `filter="url(#id)"`)
// lives in the same document via a `#id` fragment.
purifier.addHook('uponSanitizeAttribute', (_node, data) => {
	const name = data.attrName.toLowerCase();
	if (URI_BEARING_ATTRS.has(name)) {
		if (!data.attrValue.trim().startsWith('#')) {
			data.keepAttr = false;
		}
		return;
	}
	// `style="..."` is in DOMPurify's URI-safe list, so its value is never checked
	// against ALLOWED_URI_REGEXP at all (unlike href/src) — an inline
	// `style="fill:url(https://evil.example/beacon.png)"` would otherwise pass through
	// completely unfiltered.
	if (name === 'style') {
		data.attrValue = stripDangerousCss(data.attrValue);
	}
});

purifier.addHook('uponSanitizeElement', (node, data) => {
	if (data.tagName !== 'style') return;
	if (!(node instanceof sanitizerWindow.Element)) return;
	node.textContent = stripDangerousCss(node.textContent ?? '');
});

const SANITIZE_CONFIG: Config = {
	USE_PROFILES: {svg: true, svgFilters: true},
	// `foreignObject` lets an SVG embed an arbitrary XHTML/HTML subtree (including
	// `<script>`) and is the classic SVG script-execution vector; `script`/`iframe`/
	// `object`/`embed` are direct code-execution or embedding vectors; `audio`/`video`
	// aren't part of the SVG spec's safe subset and can carry autoplay/remote-media
	// side effects; `link`/`meta`/`base` can redefine the document's base URI or pull
	// in external resources. `use` is already excluded by DOMPurify's own SVG
	// allowlist (it treats `<use>` as high-risk regardless of href target, since
	// historically both `<use href="#local">` and `<use href="external.svg#x">` have
	// had mutation-XSS bypasses) — listed here anyway for explicitness alongside the
	// other tags this feature's threat model calls out.
	FORBID_TAGS: [
		'foreignObject',
		'script',
		'iframe',
		'object',
		'embed',
		'audio',
		'video',
		'link',
		'meta',
		'base',
		'use',
	],
	// Belt-and-suspenders: no `on*` event-handler attribute is in DOMPurify's SVG/HTML
	// attribute allowlist to begin with, so these are already stripped by the
	// allowlist model itself. Listed explicitly so that's not implicit/easy to
	// accidentally undo by a future ADD_ATTR change.
	FORBID_ATTR: ['onload', 'onerror', 'onclick'],
};

export interface SvgSanitizeResult {
	ok: boolean;
	sanitized: string | null;
}

/**
 * Sanitizes an untrusted SVG document for storage/serving.
 *
 * Returns `{ok: false, sanitized: null}` if nothing recognizable as an `<svg>` root
 * survives sanitization — e.g. the upload wasn't really SVG despite its declared
 * content type, or sanitization gutted it down to nothing. Callers must treat that as
 * a rejected upload (400), not silently store an empty file.
 */
export function sanitizeCosmeticSvg(rawSvg: string): SvgSanitizeResult {
	const sanitized = purifier.sanitize(rawSvg, SANITIZE_CONFIG);
	if (!/<svg[\s>]/i.test(sanitized)) {
		return {ok: false, sanitized: null};
	}
	return {ok: true, sanitized};
}
