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

import fs from 'node:fs';
import {sanitizeCosmeticSvg} from '@fluxer/api/src/cosmetics/CosmeticsSvgSanitizer';
import {describe, expect, it} from 'vitest';

// The user's actual hand-coded animated avatar frame used to validate this feature:
// pure CSS @keyframes/animation, <defs><filter>, <circle>/<g> elements, no script.
const CLEAN_FRAME_PATH = '/root/frame (2).svg';

describe('sanitizeCosmeticSvg', () => {
	it('preserves all animation-relevant content in a legitimate hand-coded frame', () => {
		if (!fs.existsSync(CLEAN_FRAME_PATH)) {
			// Environment-specific fixture; skip rather than fail if it's not present.
			return;
		}
		const raw = fs.readFileSync(CLEAN_FRAME_PATH, 'utf8');
		const {ok, sanitized} = sanitizeCosmeticSvg(raw);
		expect(ok).toBe(true);
		expect(sanitized).not.toBeNull();
		const out = sanitized as string;

		// @keyframes rules survive verbatim.
		expect(out).toContain('@keyframes ch-spin { to { transform: rotate(360deg); } }');
		expect(out).toContain(
			'@keyframes ch-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }',
		);
		expect(out).toContain('@keyframes ch-node { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }');
		expect(out).toContain(
			'@keyframes ch-halo { 0%,100% { opacity: 0; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.07); } }',
		);

		// animation/animation-delay declarations survive verbatim.
		expect(out).toContain('animation: ch-spin 14s linear infinite;');
		expect(out).toContain('animation: ch-spin-rev 22s linear infinite;');
		expect(out).toContain('animation: ch-node 2.4s ease-in-out infinite;');
		expect(out).toContain('animation: ch-halo 3.6s ease-in-out infinite;');
		expect(out).toContain('animation-delay: 0.8s;');
		expect(out).toContain('animation-delay: 1.6s;');

		// Structural/presentation content needed to actually render the frame survives:
		// viewBox, the local-fragment filter reference, the filter primitives, and every
		// circle's geometry/stroke attributes.
		expect(out).toContain('viewBox="0 0 256 256"');
		expect(out).toContain('filter="url(#ch-glow)"');
		expect(out).toContain('<feGaussianBlur stdDeviation="4" result="b">');
		expect(out).toContain('cx="128" cy="128" r="108"');
		expect(out).toContain('cx="221.5" cy="182" r="4.5"');
		expect(out).toContain('stroke-dasharray="26 14"');
	});

	it('strips <script>, on* handlers, javascript: URIs, foreignObject, and off-origin references', () => {
		const malicious = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(2)">
  <script>alert(1)</script>
  <circle cx="50" cy="50" r="40" onload="alert(3)" onerror="alert(6)" />
  <image href="https://evil.example/track.png" x="0" y="0" width="1" height="1"/>
  <a xlink:href="javascript:alert(4)"><rect width="10" height="10"/></a>
  <foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(5)</script></body></foreignObject>
  <use href="https://evil.example/sprite.svg#icon" />
  <rect style="fill:url(https://evil.example/beacon.png); animation: spin 1s;" width="10" height="10"/>
  <style>
    @import url('https://evil.example/steal.css');
    .x { animation: spin 2s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .y { background: url(https://evil.example/beacon.png); }
  </style>
</svg>`;

		const {ok, sanitized} = sanitizeCosmeticSvg(malicious);
		expect(ok).toBe(true);
		const out = sanitized as string;

		expect(out).not.toMatch(/<script/i);
		expect(out).not.toMatch(/onload=/i);
		expect(out).not.toMatch(/onerror=/i);
		expect(out).not.toMatch(/onclick=/i);
		expect(out).not.toMatch(/javascript:/i);
		expect(out).not.toMatch(/foreignobject/i);
		expect(out).not.toMatch(/<use/i);
		expect(out).not.toMatch(/evil\.example/i);
		expect(out).not.toMatch(/@import/i);

		// Legitimate animation content in the same payload survives untouched.
		expect(out).toContain('.x { animation: spin 2s linear infinite; }');
		expect(out).toContain('@keyframes spin { to { transform: rotate(360deg); } }');
	});

	it('allows local #fragment references in href/xlink:href/src and url()', () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" style="fill:url(#g)"/></svg>`;
		const {ok, sanitized} = sanitizeCosmeticSvg(svg);
		expect(ok).toBe(true);
		expect(sanitized).toContain('url(#g)');
	});

	it('rejects input that sanitizes down to no <svg> root', () => {
		const {ok, sanitized} = sanitizeCosmeticSvg('<script>alert(1)</script>');
		expect(ok).toBe(false);
		expect(sanitized).toBeNull();
	});

	it('strips @import/url() even when spelled out via CSS backslash-hex escapes', () => {
		// `\69mport` and `\75rl(...)` tokenize identically to `import` and `url(...)` in
		// every CSS tokenizer (browsers included) per the CSS Syntax Level 3 escape
		// algorithm — this is the literal-substring-regex bypass the auditor verified.
		const malicious = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <style>
    @\\69mport \\75rl(https://evil.example/steal.css);
    .x { animation: spin 2s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <rect style="background: \\75rl(https://evil.example/beacon.png); animation: spin 1s;" width="10" height="10"/>
</svg>`;

		const {ok, sanitized} = sanitizeCosmeticSvg(malicious);
		expect(ok).toBe(true);
		const out = sanitized as string;

		expect(out).not.toMatch(/evil\.example/i);
		expect(out).not.toMatch(/@import/i);
		expect(out).not.toMatch(/@\\?69mport/i);
		expect(out).not.toMatch(/url\(\s*https:\/\/evil/i);

		// Legitimate animation content in the same payload survives untouched.
		expect(out).toContain('.x { animation: spin 2s linear infinite; }');
		expect(out).toContain('@keyframes spin { to { transform: rotate(360deg); } }');
	});
});
