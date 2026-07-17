/*
 * shims.d.ts — Ambient module declarations for non-TS assets and untyped packages.
 * This file MUST remain import-free (no top-level import/export) so TypeScript
 * treats it as a script and the declarations are globally ambient.
 */

// Plain CSS files imported for their side-effects (not CSS Modules).
// Covers local @app/*.css and third-party stylesheets (highlight.js, katex, etc.).
declare module '*.css';

// idna-uts46-hx — used by @fluxer/markdown_parser; ships no type declarations.
declare module 'idna-uts46-hx';
